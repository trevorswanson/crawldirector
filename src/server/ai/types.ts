import type { ZodType } from "zod";

// Provider-agnostic LLM interface (M4 — docs/04-ai-integration.md). Generators
// (later slices) depend only on this shape, never on a vendor SDK, so the review
// pipeline stays provider-independent. Adapters live alongside
// (`anthropic.ts`, `openai.ts`) and are constructed by the factory in
// `index.ts`. Everything here is server-only — it is reached only through
// `getCampaignProvider`, which decrypts the BYO key at the call site
// (invariant #6: secrets never reach the client, logs, or provenance).

export type LLMMessage = { role: "user" | "assistant"; content: string };

// A system-prompt block. `cache` marks large, stable context (campaign canon,
// schemas, style guide) worth prompt-caching on providers that support it
// (Anthropic). Volatile, per-request text should be left uncached.
export type LLMSystemBlock = { text: string; cache?: boolean };

// Token usage for one call. The four buckets are **disjoint** — no token is
// counted in more than one — so cost is `Σ tokens × rate` with no overlap.
// `inputTokens` is *uncached* input (cached input lives in `cacheReadTokens`);
// adapters normalize their vendor's shape to this convention (Anthropic already
// reports it this way; the OpenAI adapter subtracts the cached subset out).
export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

export type GenerateRequest = {
  system?: string | LLMSystemBlock[];
  messages: LLMMessage[];
  maxTokens?: number;
};

export type StructuredRequest<T> = GenerateRequest & {
  /** Short, schema-naming hint — used as the tool / response-format name. */
  schemaName: string;
  /** The Zod schema the result is validated against before it is returned. */
  schema: ZodType<T>;
};

export type GenerateResult = {
  text: string;
  usage: LLMUsage;
  model: string;
  providerId: string;
};

export type StructuredResult<T> = {
  data: T;
  usage: LLMUsage;
  model: string;
  providerId: string;
};

// Result of embedding one or more texts (M5 semantic search). `vectors` preserves
// input order, one row per input. `usage` reuses the disjoint-bucket convention
// (embedding APIs only bill input tokens, so `inputTokens` carries them).
export type EmbedResult = {
  vectors: number[][];
  model: string;
  usage: LLMUsage;
};

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  /** Free-text completion. */
  generate(req: GenerateRequest): Promise<GenerateResult>;
  /**
   * Structured completion: the provider is constrained to emit JSON matching
   * `schema` (tool-calling / JSON-schema mode), the result is Zod-validated, and
   * one repair retry is attempted before failing. **Mandatory for generators** —
   * they must return a parseable Change Set, never freeform prose.
   */
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  /**
   * Embed texts into vectors for semantic retrieval (M5 — docs/07-search-
   * retrieval.md). Not every provider supports embeddings: the Anthropic
   * Messages API has none, so its adapter throws a `ProviderError`. Callers that
   * need embeddings resolve an embedding-capable provider via
   * `resolveCampaignEmbedder` and degrade to full-text search when none exists.
   */
  embed(texts: string[]): Promise<EmbedResult>;
}

export const DEFAULT_MAX_TOKENS = 4096;

const EMPTY_USAGE: LLMUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

export function emptyUsage(): LLMUsage {
  return { ...EMPTY_USAGE };
}

// A failure inside a provider call. The message is safe to surface to the DM —
// adapters never put the API key in it.
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}
