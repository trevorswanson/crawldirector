import Anthropic from "@anthropic-ai/sdk";

import {
  DEFAULT_MAX_TOKENS,
  ProviderError,
  emptyUsage,
  type GenerateRequest,
  type GenerateResult,
  type LLMMessage,
  type LLMProvider,
  type LLMUsage,
  type StructuredRequest,
  type StructuredResult,
} from "./types";
import { createSafeFetch } from "./ssrf";
import { toJsonSchema, withRepair } from "./structured";

// Anthropic adapter (M4 — docs/04-ai-integration.md). Server-only. Structured
// output uses **forced tool use**: one tool whose `input_schema` is the Zod
// schema, with `tool_choice` pinned to it, so Claude must emit a parseable
// object (then Zod-validated upstream). Stable system blocks are **prompt-
// cached** via `cache_control` to cut cost on the large, fixed context
// generators reuse across a run. Uses the latest Opus model by default
// (`claude-opus-4-8`); thinking is left off so forced tool use stays valid.

export type AnthropicAdapterOptions = {
  providerId: string;
  apiKey: string;
  baseUrl: string | null;
  model: string;
};

function buildSystem(
  system: GenerateRequest["system"],
): string | Anthropic.TextBlockParam[] | undefined {
  if (system == null) return undefined;
  if (typeof system === "string") return system;
  return system.map((block) => ({
    type: "text" as const,
    text: block.text,
    ...(block.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}

function buildMessages(
  messages: LLMMessage[],
  repairHint: string | null,
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (repairHint) out.push({ role: "user", content: repairHint });
  return out;
}

function readUsage(usage: Anthropic.Usage | undefined): LLMUsage {
  if (!usage) return emptyUsage();
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

export function createAnthropicProvider(opts: AnthropicAdapterOptions): LLMProvider {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    // Enforce the SSRF egress policy on every request, including a custom baseURL.
    fetch: createSafeFetch(),
    ...(opts.baseUrl ? { baseURL: opts.baseUrl } : {}),
  });
  const { model, providerId } = opts;

  return {
    id: providerId,
    model,

    async generate(req: GenerateRequest): Promise<GenerateResult> {
      const resp = await client.messages.create({
        model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: buildSystem(req.system),
        messages: buildMessages(req.messages, null),
      });
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text, usage: readUsage(resp.usage), model, providerId };
    },

    async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const inputSchema = toJsonSchema(req.schema) as Anthropic.Tool.InputSchema;
      return withRepair(req.schema, async (repairHint) => {
        const resp = await client.messages.create({
          model,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: buildSystem(req.system),
          tools: [
            {
              name: req.schemaName,
              description: "Return the result as a single object matching the schema.",
              input_schema: inputSchema,
            },
          ],
          tool_choice: { type: "tool", name: req.schemaName },
          messages: buildMessages(req.messages, repairHint),
        });
        const toolUse = resp.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );
        if (!toolUse) {
          throw new ProviderError("The model did not return a structured tool result.");
        }
        return { raw: toolUse.input, usage: readUsage(resp.usage), model, providerId };
      });
    },
  };
}
