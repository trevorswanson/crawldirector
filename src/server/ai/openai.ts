import OpenAI from "openai";

import {
  DEFAULT_MAX_TOKENS,
  ProviderError,
  emptyUsage,
  type EmbedResult,
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
  // Embedding model for `embed()`. Separate from the chat `model`; only set when
  // this adapter is constructed as an embedder (resolveCampaignEmbedder). When
  // absent, `embed()` throws — chat callers never call it.
  embeddingModel?: string | null;
  embeddingDimensions?: number | null;
};

function readEmbedUsage(usage: OpenAI.CreateEmbeddingResponse.Usage | undefined): LLMUsage {
  if (!usage) return emptyUsage();
  // Embeddings only bill input tokens; `LLMUsage.inputTokens` carries them.
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}

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
  // OpenAI reports `prompt_tokens` as the TOTAL input (cached + uncached) and
  // `cached_tokens` as the cached subset. `LLMUsage.inputTokens` is *uncached*
  // input (the Anthropic convention the price model assumes), so subtract the
  // cached portion out — otherwise cached tokens get billed twice (once at the
  // input rate, once at the cache-read rate).
  const promptTokens = usage.prompt_tokens ?? 0;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max(0, promptTokens - cachedTokens),
    outputTokens: usage.completion_tokens ?? 0,
    cacheReadTokens: cachedTokens,
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
    embeddingModel: opts.embeddingModel ?? null,
    embeddingDimensions: opts.embeddingDimensions ?? null,

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

    async embed(texts: string[]): Promise<EmbedResult> {
      const embeddingModel = opts.embeddingModel;
      if (!embeddingModel) {
        throw new ProviderError("No embedding model is configured for this provider.");
      }
      if (texts.length === 0) return { vectors: [], model: embeddingModel, usage: emptyUsage() };

      // Force `float`: the SDK otherwise defaults to base64, which an
      // OpenAI-*compatible* endpoint (Ollama, vLLM, llama.cpp) may not honor —
      // returning a plain float array the SDK then mis-decodes as bytes.
      const params: OpenAI.EmbeddingCreateParams = {
        model: embeddingModel,
        input: texts,
        encoding_format: "float",
      };
      // Ask OpenAI for a specific output width when the DM configured one. Without
      // it, a non-default dimension (e.g. text-embedding-3-large at 1024d) comes
      // back at the model's native width; embedSearchDocs then rejects it as
      // wrong-dimension and query-time semantic search degrades to keyword-only.
      // `dimensions` is a first-party OpenAI request param, supported only by
      // `text-embedding-3` and later models, so scope it to the real OpenAI
      // endpoint (no custom baseURL): a compatible endpoint serves a fixed-width
      // model that may reject the param, and legacy models (ada-002) don't take it.
      if (
        opts.baseUrl == null &&
        opts.embeddingDimensions != null &&
        embeddingModel.startsWith("text-embedding-3")
      ) {
        params.dimensions = opts.embeddingDimensions;
      }
      const resp = await client.embeddings.create(params);
      // The API returns rows in input order, but sort on `index` to be safe.
      const vectors = [...resp.data]
        .sort((a, b) => a.index - b.index)
        .map((row) => row.embedding as number[]);
      return { vectors, model: embeddingModel, usage: readEmbedUsage(resp.usage) };
    },
  };
}
