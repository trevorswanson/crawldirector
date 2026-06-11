import { describe, expect, it } from "vitest";

import {
  estimateCostUsd,
  formatUsd,
  getModelPricing,
  isModelPriced,
  MODEL_PRICING,
} from "@/lib/ai/pricing";
import { emptyUsage } from "@/server/ai/types";

describe("getModelPricing / isModelPriced", () => {
  it("resolves a known model, trimming whitespace", () => {
    expect(getModelPricing("claude-opus-4-8")).toEqual(MODEL_PRICING["claude-opus-4-8"]);
    expect(getModelPricing("  gpt-4o-mini  ")).toEqual(MODEL_PRICING["gpt-4o-mini"]);
    expect(isModelPriced("claude-opus-4-8")).toBe(true);
  });

  it("returns undefined / false for an unknown model", () => {
    expect(getModelPricing("llama3.1")).toBeUndefined();
    expect(isModelPriced("llama3.1")).toBe(false);
  });
});

describe("estimateCostUsd", () => {
  it("sums input, output, and cache tokens at the model's rates", () => {
    // 1M input + 1M output on opus = $15 + $75.
    const cost = estimateCostUsd("claude-opus-4-8", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    expect(cost).toBeCloseTo(90, 6);
  });

  it("prices cache reads and cache creation separately", () => {
    const cost = estimateCostUsd("claude-opus-4-8", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000, // $1.50
      cacheCreationTokens: 1_000_000, // $18.75
    });
    expect(cost).toBeCloseTo(20.25, 6);
  });

  it("returns 0 for an empty usage on a priced model", () => {
    expect(estimateCostUsd("gpt-4o-mini", emptyUsage())).toBe(0);
  });

  it("returns null (cost unknown) for an unpriced model — never 0", () => {
    expect(
      estimateCostUsd("some-local-model", {
        inputTokens: 500,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toBeNull();
  });

  it("prices an otherwise-unpriced model from a complete DM override", () => {
    const cost = estimateCostUsd(
      "local-llama",
      { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheCreationTokens: 0 },
      { inputPerMTok: 0.5, outputPerMTok: 1.5 },
    );
    expect(cost).toBeCloseTo(2, 6); // $0.50 + $1.50
  });

  it("derives override cache rates from the input rate (0.1× read, 1.25× write)", () => {
    const cost = estimateCostUsd(
      "local-llama",
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheCreationTokens: 1_000_000 },
      { inputPerMTok: 10, outputPerMTok: 20 },
    );
    expect(cost).toBeCloseTo(10 * 0.1 + 10 * 1.25, 6); // $1 + $12.50
  });

  it("lets a complete override win over the built-in table", () => {
    const cost = estimateCostUsd(
      "claude-opus-4-8",
      { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      { inputPerMTok: 1, outputPerMTok: 1 },
    );
    expect(cost).toBeCloseTo(1, 6); // override $1, not the table's $15
  });

  it("ignores an incomplete override (only one rate) and falls back to the table", () => {
    const cost = estimateCostUsd(
      "claude-opus-4-8",
      { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      { inputPerMTok: 1, outputPerMTok: null },
    );
    expect(cost).toBeCloseTo(15, 6); // table input rate, override ignored
  });

  it("stays null when an incomplete override can't rescue an unpriced model", () => {
    expect(
      estimateCostUsd(
        "local-llama",
        { inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0 },
        { inputPerMTok: 2, outputPerMTok: null },
      ),
    ).toBeNull();
  });
});

describe("formatUsd", () => {
  it("shows two decimals for cent-scale and above", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(12.5)).toBe("$12.50");
    expect(formatUsd(0.01)).toBe("$0.01");
  });

  it("shows extra precision for sub-cent amounts so they aren't all $0.00", () => {
    expect(formatUsd(0.0003)).toBe("$0.0003");
  });
});
