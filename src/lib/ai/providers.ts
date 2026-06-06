// The set of AI providers a DM can bring a key for (M4 — docs/04-ai-
// integration.md). This module is **pure and secret-free** — no keys, no env, no
// Prisma — so it can be imported by client components (the settings UI) as well
// as the server. The provider abstraction (src/server/ai) keys off these `id`s
// and `kind`s; `keyPrefix` is a light client-side sanity hint, never a security
// check.

// Which server-side adapter drives a provider. Two implementations cover every
// case: the Anthropic Messages API, and the OpenAI Chat Completions API — the
// latter is shared by OpenAI itself and any **OpenAI-compatible** endpoint (a
// self-hosted LLM like Ollama/LM Studio/vLLM, or a third-party proxy), which is
// just the same wire protocol pointed at a different base URL.
export type AiProviderKind = "anthropic" | "openai-compatible";

export type AiProviderInfo = {
  /** Stable id stored on AiKey.providerId and used by the provider abstraction. */
  id: string;
  /** Human label for the settings UI. */
  label: string;
  /** Which server-side adapter handles this provider. */
  kind: AiProviderKind;
  /** Where the DM creates a key (shown as a help link). */
  consoleUrl: string;
  /** Typical key prefix — a soft UI hint only, not validation of authenticity. */
  keyPrefix: string;
  /**
   * Model used when the stored key carries no explicit model. `null` means the
   * provider has no sensible built-in default (a custom endpoint serves unknown
   * models), so the DM must supply one — see `requiresModel`.
   */
  defaultModel: string | null;
  /** Custom HTTP endpoint required (OpenAI-compatible self-host / proxy). */
  requiresBaseUrl: boolean;
  /** An explicit model name is required (we can't infer it for a custom endpoint). */
  requiresModel: boolean;
  /** The API key is optional — many local servers accept any/no auth. */
  keyOptional: boolean;
};

export const AI_PROVIDERS: readonly AiProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "anthropic",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
    defaultModel: "claude-opus-4-8",
    requiresBaseUrl: false,
    requiresModel: false,
    keyOptional: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    consoleUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
    defaultModel: "gpt-4o-mini",
    requiresBaseUrl: false,
    requiresModel: false,
    keyOptional: false,
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible (self-hosted / proxy)",
    kind: "openai-compatible",
    // A locally hosted model (Ollama, LM Studio, vLLM, llama.cpp) or a
    // third-party service that speaks the OpenAI Chat Completions protocol.
    consoleUrl: "https://github.com/openai/openai-openapi",
    keyPrefix: "",
    defaultModel: null,
    requiresBaseUrl: true,
    requiresModel: true,
    keyOptional: true,
  },
] as const;

export const aiProviderIds = AI_PROVIDERS.map((p) => p.id);

export function getAiProvider(id: string): AiProviderInfo | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

export function aiProviderLabel(id: string): string {
  return getAiProvider(id)?.label ?? id;
}

export function isAiProviderId(id: string): boolean {
  return aiProviderIds.includes(id);
}

// Resolve the model a call should use: the per-key override if set, else the
// provider's built-in default. Returns null only for a custom endpoint with no
// model configured (the service rejects that at store time via `requiresModel`).
export function resolveAiModel(id: string, model?: string | null): string | null {
  const trimmed = model?.trim();
  if (trimmed) return trimmed;
  return getAiProvider(id)?.defaultModel ?? null;
}
