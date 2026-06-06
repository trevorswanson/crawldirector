// The set of AI providers a DM can bring a key for (M4 — docs/04-ai-
// integration.md). This module is **pure and secret-free** — no keys, no env, no
// Prisma — so it can be imported by client components (the settings dropdown) as
// well as the server. The generator/provider abstraction (later M4 slices) keys
// off these `id`s; `keyPrefix` is a light client-side sanity hint, never a
// security check.

export type AiProviderInfo = {
  /** Stable id stored on AiKey.providerId and used by the provider abstraction. */
  id: string;
  /** Human label for the settings UI. */
  label: string;
  /** Where the DM creates a key (shown as a help link). */
  consoleUrl: string;
  /** Typical key prefix — a soft UI hint only, not validation of authenticity. */
  keyPrefix: string;
};

export const AI_PROVIDERS: readonly AiProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
  },
  {
    id: "openai",
    label: "OpenAI",
    consoleUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
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
