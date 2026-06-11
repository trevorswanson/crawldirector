// Per-model price table + cost estimation (M4 — docs/04-ai-integration.md). This
// module is **pure and secret-free** — no keys, no env, no Prisma — so it can be
// imported by client components (the usage panel) as well as the server.
//
// Prices are in **USD per million tokens** and are *estimates*: providers change
// pricing and a self-hosted/proxy endpoint serves unknown models. When a model
// isn't in the table, `estimateCostUsd` returns `null` (cost unknown) rather than
// inventing a number — the recorded token counts stay authoritative either way.

import type { LLMUsage } from "@/server/ai/types";

export type ModelPricing = {
  /** Uncached input tokens. */
  inputPerMTok: number;
  /** Output (completion) tokens. */
  outputPerMTok: number;
  /** Prompt-cache reads (Anthropic). */
  cacheReadPerMTok: number;
  /** Prompt-cache writes / creation (Anthropic). */
  cacheWritePerMTok: number;
};

const MILLION = 1_000_000;

// Representative list prices (USD / 1M tokens) for the models this app defaults
// to or commonly uses. Anthropic cache reads are ~0.1× input and cache writes
// ~1.25× input; OpenAI has no separate cache-write charge (its adapter reports
// zero cache-creation tokens), so those rates are left at the input rate and
// never actually applied.
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  // Anthropic
  "claude-opus-4-8": { inputPerMTok: 15, outputPerMTok: 75, cacheReadPerMTok: 1.5, cacheWritePerMTok: 18.75 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25 },
  // OpenAI
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10, cacheReadPerMTok: 1.25, cacheWritePerMTok: 2.5 },
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6, cacheReadPerMTok: 0.075, cacheWritePerMTok: 0.15 },
};

// Look up a model's price, ignoring surrounding whitespace. Returns undefined
// when the model isn't priced.
export function getModelPricing(model: string): ModelPricing | undefined {
  return MODEL_PRICING[model.trim()];
}

// Whether we have a price for this model (so the UI can flag unmetered runs).
export function isModelPriced(model: string): boolean {
  return getModelPricing(model) !== undefined;
}

// A DM-supplied per-key price override (USD per 1M tokens). Both rates must be
// present for the override to apply — see `resolvePricing`.
export type PricingOverride = {
  inputPerMTok: number | null;
  outputPerMTok: number | null;
};

// Build a full `ModelPricing` from a DM override's input/output rates. The
// override only carries input + output (a self-hosted/proxy model the DM is
// pricing themselves); cache rates are derived from the input rate using the
// same conventions as the built-in table (cache read ≈ 0.1× input, cache write
// ≈ 1.25× input). For OpenAI-compatible endpoints the adapter reports zero cache
// tokens, so those rates never actually apply there.
function pricingFromOverride(o: PricingOverride): ModelPricing | null {
  if (o.inputPerMTok == null || o.outputPerMTok == null) return null;
  return {
    inputPerMTok: o.inputPerMTok,
    outputPerMTok: o.outputPerMTok,
    cacheReadPerMTok: o.inputPerMTok * 0.1,
    cacheWritePerMTok: o.inputPerMTok * 1.25,
  };
}

// Resolve the price to use: a complete DM override wins, then the built-in table,
// then null (cost unknown). Lets a DM cost a self-hosted/proxy model the table
// doesn't know — or correct a first-party model's price for their own proxy.
export function resolvePricing(
  model: string,
  override?: PricingOverride | null,
): ModelPricing | null {
  if (override) {
    const fromOverride = pricingFromOverride(override);
    if (fromOverride) return fromOverride;
  }
  return getModelPricing(model) ?? null;
}

// Estimate a run's cost in USD from its token usage. Returns null when neither a
// DM override nor the built-in table prices the model — callers must treat that
// as "cost unknown", never as "$0".
export function estimateCostUsd(
  model: string,
  usage: LLMUsage,
  override?: PricingOverride | null,
): number | null {
  const pricing = resolvePricing(model, override);
  if (!pricing) return null;
  const cost =
    (usage.inputTokens * pricing.inputPerMTok +
      usage.outputTokens * pricing.outputPerMTok +
      usage.cacheReadTokens * pricing.cacheReadPerMTok +
      usage.cacheCreationTokens * pricing.cacheWritePerMTok) /
    MILLION;
  return cost;
}

// Format a USD amount for display. Sub-cent costs (typical for a single run) get
// more precision so they don't all read "$0.00".
export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
