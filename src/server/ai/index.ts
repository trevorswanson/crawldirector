import { z } from "zod";

import { ServiceError } from "@/lib/errors";
import {
  AI_PROVIDERS,
  OPENAI_DEFAULT_EMBEDDING_DIMENSIONS,
  OPENAI_DEFAULT_EMBEDDING_MODEL,
  getAiProvider,
  isAiProviderId,
  resolveAiModel,
  resolveEmbeddingDimensions,
  resolveEmbeddingModel,
} from "@/lib/ai/providers";
import { assertCampaignDm, getAiKeyConfig } from "@/server/services/ai-keys";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAiProvider } from "./openai";
import type { LLMProvider } from "./types";

// Provider factory + connection test (M4 — docs/04-ai-integration.md). This is
// the single server-only seam between the encrypted BYO key store and a live
// vendor call. `getCampaignProvider` is what generators (later slices) call to
// get a ready `LLMProvider`; nothing on the action/client surface imports the
// adapters directly, which is what holds invariant #6 (secrets never leave the
// server).

export type { LLMProvider } from "./types";
export { ProviderError } from "./types";

// Resolve a configured provider for a campaign into a ready adapter, decrypting
// the BYO key at the call site. Returns null when no usable key is configured
// (no row, or a custom endpoint missing its model) so the app degrades
// gracefully — AI is additive and everything works with no key.
export async function getCampaignProvider(
  campaignId: string,
  providerId: string,
): Promise<LLMProvider | null> {
  const provider = getAiProvider(providerId);
  if (!provider) return null;

  const config = await getAiKeyConfig(campaignId, providerId);
  if (!config) return null;

  const model = resolveAiModel(providerId, config.model);
  if (!model) return null;

  // Local servers may run without auth; the OpenAI SDK still requires a non-empty
  // string, so pass a harmless placeholder when the DM left the key blank.
  const apiKey = config.apiKey || "not-needed";

  if (provider.kind === "anthropic") {
    return createAnthropicProvider({ providerId, apiKey, baseUrl: config.baseUrl, model });
  }
  return createOpenAiProvider({ providerId, apiKey, baseUrl: config.baseUrl, model });
}

// Resolve *whichever* provider a campaign has a usable key for, preferring the
// registry order (Anthropic first). Generators don't ask the DM to pick a vendor
// per run — they use the one configured key. Returns null when none is usable so
// callers degrade gracefully (AI is additive; everything works with no key).
export async function resolveCampaignProvider(
  campaignId: string,
): Promise<LLMProvider | null> {
  for (const provider of AI_PROVIDERS) {
    const ready = await getCampaignProvider(campaignId, provider.id);
    if (ready) return ready;
  }
  return null;
}

// Default embedding model/dimension for the real OpenAI provider (M5 — docs/07-
// search-retrieval.md). A per-key bring-your-own embedding model/dimension (e.g.
// `codestral-embed` on an OpenAI-compatible endpoint) takes precedence — see
// `resolveEmbeddingModel` / `resolveEmbeddingDimensions`.
export const EMBED_MODEL_DEFAULT = OPENAI_DEFAULT_EMBEDDING_MODEL;
export const EMBED_DIMENSIONS_DEFAULT = OPENAI_DEFAULT_EMBEDDING_DIMENSIONS;

// Resolve an embedding-capable provider for a campaign. Only OpenAI-compatible
// providers (real OpenAI or a self-hosted/proxy endpoint) expose an embeddings
// API — the Anthropic Messages API has none — so we skip the Anthropic adapter
// here. The embedding model is resolved independently of the chat model: a
// per-key BYO override falls back to the provider's built-in embedding default.
// Real OpenAI has one; a custom endpoint serves unknown models, so without an
// explicit embedding model we can't embed through it — skip to the next
// candidate. Returns null when no candidate yields a usable embedder, so the
// semantic layer degrades gracefully to full-text search (doc 07).
export async function resolveCampaignEmbedder(
  campaignId: string,
): Promise<LLMProvider | null> {
  for (const provider of AI_PROVIDERS) {
    if (provider.kind !== "openai-compatible") continue;
    const config = await getAiKeyConfig(campaignId, provider.id);
    if (!config) continue;

    const embeddingModel = resolveEmbeddingModel(provider.id, config.embeddingModel);
    if (!embeddingModel) continue;
    const embeddingDimensions = resolveEmbeddingDimensions(
      provider.id,
      config.embeddingDimensions,
    );

    // Custom endpoints may run without auth; the SDK still needs a non-empty key.
    const apiKey = config.apiKey || "not-needed";
    return createOpenAiProvider({
      providerId: provider.id,
      apiKey,
      baseUrl: config.baseUrl,
      // The chat model is unused by embed(); fall back to the embedding model so
      // the adapter always has a non-null `model`.
      model: resolveAiModel(provider.id, config.model) ?? embeddingModel,
      embeddingModel,
      embeddingDimensions,
    });
  }
  return null;
}

const pingSchema = z.object({ ok: z.boolean() });

export type AiConnectionResult = {
  ok: true;
  providerId: string;
  model: string;
  latencyMs: number;
};

// Turn an unknown provider/SDK error into a short, key-safe message for the DM.
// We deliberately do NOT reflect the provider's free-text `message`: for an
// OpenAI-compatible endpoint that text comes from an arbitrary proxy/local
// server and could echo headers or other key-bearing config (invariant #6).
// Only the numeric HTTP status (safe) is ever surfaced.
export function describeProviderError(error: unknown): string {
  const status =
    typeof error === "object" && error !== null
      ? (error as { status?: number }).status
      : undefined;
  if (status === 401 || status === 403) {
    return "The provider rejected the key (authentication failed).";
  }
  if (status === 404) {
    return "The model or endpoint was not found — check the model name and URL.";
  }
  if (typeof status === "number") {
    return `The provider returned an error (HTTP ${status}). Check the endpoint and model.`;
  }
  return "Connection failed. Check the key, endpoint, and model, then try again.";
}

// Make a tiny structured call to verify a campaign's stored key/endpoint/model
// actually work. DM/co-DM only. Exercises the whole provider abstraction without
// touching canon — the deliberate, no-generation way for a DM to confirm their
// BYO setup before generators (later slices) rely on it.
export async function testAiConnection(
  userId: string,
  campaignId: string,
  providerId: string,
): Promise<AiConnectionResult> {
  await assertCampaignDm(userId, campaignId);
  if (!isAiProviderId(providerId)) {
    throw new ServiceError("Unknown AI provider.");
  }

  const provider = await getCampaignProvider(campaignId, providerId);
  if (!provider) {
    throw new ServiceError("No usable key is configured for that provider.");
  }

  const start = Date.now();
  try {
    await provider.generateStructured({
      schemaName: "connection_check",
      schema: pingSchema,
      maxTokens: 64,
      system: "You are a connection test. Reply only with the requested JSON.",
      messages: [{ role: "user", content: 'Respond with {"ok": true} and nothing else.' }],
    });
  } catch (error) {
    throw new ServiceError(describeProviderError(error));
  }

  return { ok: true, providerId, model: provider.model, latencyMs: Date.now() - start };
}
