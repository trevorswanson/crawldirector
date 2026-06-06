import { describe, expect, it } from "vitest";

import {
  AI_PROVIDERS,
  aiProviderIds,
  aiProviderLabel,
  getAiProvider,
  isAiProviderId,
  resolveAiModel,
} from "@/lib/ai/providers";

describe("AI provider registry", () => {
  it("includes anthropic, openai, and an openai-compatible entry", () => {
    expect(aiProviderIds).toEqual(
      expect.arrayContaining(["anthropic", "openai", "openai-compatible"]),
    );
  });

  it("maps each provider to the adapter kind that drives it", () => {
    expect(getAiProvider("anthropic")?.kind).toBe("anthropic");
    expect(getAiProvider("openai")?.kind).toBe("openai-compatible");
    expect(getAiProvider("openai-compatible")?.kind).toBe("openai-compatible");
  });

  it("flags the custom endpoint as requiring a base URL + model and allowing a blank key", () => {
    const compat = getAiProvider("openai-compatible")!;
    expect(compat.requiresBaseUrl).toBe(true);
    expect(compat.requiresModel).toBe(true);
    expect(compat.keyOptional).toBe(true);
    expect(compat.defaultModel).toBeNull();
  });

  it("first-party providers require a key, need no endpoint, and carry a default model", () => {
    for (const id of ["anthropic", "openai"]) {
      const p = getAiProvider(id)!;
      expect(p.requiresBaseUrl).toBe(false);
      expect(p.requiresModel).toBe(false);
      expect(p.keyOptional).toBe(false);
      expect(p.defaultModel).toBeTruthy();
    }
    expect(getAiProvider("anthropic")!.defaultModel).toBe("claude-opus-4-8");
  });

  it("resolveAiModel prefers the override, then the default, then null", () => {
    expect(resolveAiModel("anthropic", "claude-haiku-4-5")).toBe("claude-haiku-4-5");
    expect(resolveAiModel("anthropic", "  ")).toBe("claude-opus-4-8");
    expect(resolveAiModel("anthropic", null)).toBe("claude-opus-4-8");
    // A custom endpoint with no override has no default to fall back to.
    expect(resolveAiModel("openai-compatible", null)).toBeNull();
    expect(resolveAiModel("openai-compatible", "llama3.1")).toBe("llama3.1");
    // Unknown provider resolves to null (not a crash).
    expect(resolveAiModel("nope", null)).toBeNull();
  });

  it("label/lookup helpers are stable and reject unknown ids", () => {
    expect(isAiProviderId("anthropic")).toBe(true);
    expect(isAiProviderId("wizard-ai")).toBe(false);
    expect(aiProviderLabel("anthropic")).toBe("Anthropic (Claude)");
    // Unknown ids fall back to the raw id rather than throwing.
    expect(aiProviderLabel("wizard-ai")).toBe("wizard-ai");
    expect(getAiProvider("wizard-ai")).toBeUndefined();
  });

  it("every registry entry is internally consistent", () => {
    for (const p of AI_PROVIDERS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      // requiresModel implies no built-in default (the DM must supply one).
      if (p.requiresModel) expect(p.defaultModel).toBeNull();
      else expect(p.defaultModel).toBeTruthy();
    }
  });
});
