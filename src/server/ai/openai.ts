import OpenAI from "openai";

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

// OpenAI (and OpenAI-compatible) adapter (M4 — docs/04-ai-integration.md).
// Server-only. The same Chat Completions wire protocol serves OpenAI itself and
// any compatible endpoint — a self-hosted model (Ollama, LM Studio, vLLM,
// llama.cpp) or a third-party proxy — so this one adapter handles both; the only
// difference is `baseURL` and the explicit model. Structured output uses
// `response_format: json_schema` (strict), then Zod-validated upstream. We send
// `max_tokens` (rather than the newer `max_completion_tokens`) because it is the
// field every compatible server understands. Prompt caching is automatic on
// OpenAI's side, so the `cache` hint on system blocks is a no-op here.

export type OpenAiAdapterOptions = {
  providerId: string;
  apiKey: string;
  baseUrl: string | null;
  model: string;
};

function buildMessages(
  system: GenerateRequest["system"],
  messages: LLMMessage[],
  repairHint: string | null,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (system != null) {
    const text = typeof system === "string" ? system : system.map((b) => b.text).join("\n\n");
    if (text) out.push({ role: "system", content: text });
  }
  for (const m of messages) out.push({ role: m.role, content: m.content });
  if (repairHint) out.push({ role: "user", content: repairHint });
  return out;
}

function readUsage(usage: OpenAI.CompletionUsage | undefined): LLMUsage {
  if (!usage) return emptyUsage();
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    cacheCreationTokens: 0,
  };
}

export function createOpenAiProvider(opts: OpenAiAdapterOptions): LLMProvider {
  const client = new OpenAI({
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
      const resp = await client.chat.completions.create({
        model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: buildMessages(req.system, req.messages, null),
      });
      const text = resp.choices[0]?.message?.content ?? "";
      return { text, usage: readUsage(resp.usage), model, providerId };
    },

    async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const schema = toJsonSchema(req.schema);
      return withRepair(req.schema, async (repairHint) => {
        const resp = await client.chat.completions.create({
          model,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: buildMessages(req.system, req.messages, repairHint),
          response_format: {
            type: "json_schema",
            json_schema: { name: req.schemaName, schema, strict: true },
          },
        });
        const content = resp.choices[0]?.message?.content;
        if (!content) {
          throw new ProviderError("The model returned an empty structured response.");
        }
        let raw: unknown;
        try {
          raw = JSON.parse(content);
        } catch {
          raw = undefined;
        }
        return { raw, usage: readUsage(resp.usage), model, providerId };
      });
    },
  };
}
