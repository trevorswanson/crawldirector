import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/errors";

// Mock the key store (no DB) and both adapter factories (no SDK). The factory and
// connection-test logic under test is real.
const { assertCampaignDm, getAiKeyConfig, createAnthropicProvider, createOpenAiProvider } =
  vi.hoisted(() => ({
    assertCampaignDm: vi.fn(),
    getAiKeyConfig: vi.fn(),
    createAnthropicProvider: vi.fn(),
    createOpenAiProvider: vi.fn(),
  }));

vi.mock("@/server/services/ai-keys", () => ({ assertCampaignDm, getAiKeyConfig }));
vi.mock("@/server/ai/anthropic", () => ({ createAnthropicProvider }));
vi.mock("@/server/ai/openai", () => ({ createOpenAiProvider }));

import {
  EMBED_MODEL_DEFAULT,
  getCampaignProvider,
  resolveCampaignEmbedder,
  resolveCampaignProvider,
  testAiConnection,
} from "@/server/ai";

function fakeProvider(over: Partial<{ model: string; generateStructured: ReturnType<typeof vi.fn> }> = {}) {
  return {
    id: "x",
    model: over.model ?? "some-model",
    generate: vi.fn(),
    generateStructured: over.generateStructured ?? vi.fn().mockResolvedValue({ data: { ok: true } }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  assertCampaignDm.mockResolvedValue({ role: "OWNER" });
  createAnthropicProvider.mockImplementation((o) => fakeProvider({ model: o.model }));
  createOpenAiProvider.mockImplementation((o) => fakeProvider({ model: o.model }));
});

describe("getCampaignProvider", () => {
  it("returns null for an unknown provider id", async () => {
    expect(await getCampaignProvider("c1", "wizard-ai")).toBeNull();
    expect(getAiKeyConfig).not.toHaveBeenCalled();
  });

  it("returns null when no key is configured", async () => {
    getAiKeyConfig.mockResolvedValue(null);
    expect(await getCampaignProvider("c1", "anthropic")).toBeNull();
  });

  it("returns null when a custom endpoint has no resolvable model", async () => {
    getAiKeyConfig.mockResolvedValue({ apiKey: "", baseUrl: "http://x/v1", model: null });
    expect(await getCampaignProvider("c1", "openai-compatible")).toBeNull();
    expect(createOpenAiProvider).not.toHaveBeenCalled();
  });

  it("builds the Anthropic adapter with the default model for anthropic", async () => {
    getAiKeyConfig.mockResolvedValue({ apiKey: "sk-ant", baseUrl: null, model: null });
    const provider = await getCampaignProvider("c1", "anthropic");
    expect(provider).not.toBeNull();
    expect(createAnthropicProvider).toHaveBeenCalledWith({
      providerId: "anthropic",
      apiKey: "sk-ant",
      baseUrl: null,
      model: "claude-opus-4-8",
    });
  });

  it("builds the OpenAI adapter for a compatible endpoint, substituting a placeholder key", async () => {
    getAiKeyConfig.mockResolvedValue({ apiKey: "", baseUrl: "http://localhost:11434/v1", model: "llama3.1" });
    await getCampaignProvider("c1", "openai-compatible");
    expect(createOpenAiProvider).toHaveBeenCalledWith({
      providerId: "openai-compatible",
      apiKey: "not-needed",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
    });
  });
});

describe("resolveCampaignProvider", () => {
  it("returns the first provider with a usable key (registry order)", async () => {
    // anthropic + openai unconfigured, openai-compatible configured.
    getAiKeyConfig
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ apiKey: "", baseUrl: "http://x/v1", model: "llama3.1" });
    const provider = await resolveCampaignProvider("c1");
    expect(provider).not.toBeNull();
    expect(createOpenAiProvider).toHaveBeenCalledTimes(1);
  });

  it("prefers anthropic when it is configured", async () => {
    getAiKeyConfig.mockResolvedValue({ apiKey: "sk-ant", baseUrl: null, model: null });
    const provider = await resolveCampaignProvider("c1");
    expect(provider?.model).toBe("claude-opus-4-8");
    expect(createAnthropicProvider).toHaveBeenCalledTimes(1);
  });

  it("returns null when no provider is configured", async () => {
    getAiKeyConfig.mockResolvedValue(null);
    expect(await resolveCampaignProvider("c1")).toBeNull();
  });
});

describe("resolveCampaignEmbedder", () => {
  it("skips Anthropic and builds an OpenAI embedder with the default embedding model", async () => {
    // First lookup (the `openai` provider) is configured.
    getAiKeyConfig.mockResolvedValueOnce({ apiKey: "sk-openai", baseUrl: null, model: null });
    const embedder = await resolveCampaignEmbedder("c1");
    expect(embedder).not.toBeNull();
    // Anthropic (kind "anthropic") is never even queried for a key.
    expect(getAiKeyConfig).toHaveBeenCalledTimes(1);
    expect(getAiKeyConfig.mock.calls[0][1]).toBe("openai");
    expect(createOpenAiProvider).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "openai", embeddingModel: EMBED_MODEL_DEFAULT }),
    );
    expect(createAnthropicProvider).not.toHaveBeenCalled();
  });

  it("falls through to a self-hosted OpenAI-compatible endpoint", async () => {
    getAiKeyConfig
      .mockResolvedValueOnce(null) // openai
      .mockResolvedValueOnce({ apiKey: "", baseUrl: "http://x/v1", model: "bge" }); // openai-compatible
    await resolveCampaignEmbedder("c1");
    expect(createOpenAiProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "openai-compatible",
        apiKey: "not-needed",
        baseUrl: "http://x/v1",
        embeddingModel: EMBED_MODEL_DEFAULT,
      }),
    );
  });

  it("returns null when no OpenAI-compatible key is configured", async () => {
    getAiKeyConfig.mockResolvedValue(null);
    expect(await resolveCampaignEmbedder("c1")).toBeNull();
    expect(createOpenAiProvider).not.toHaveBeenCalled();
  });
});

describe("testAiConnection", () => {
  it("checks DM permission, pings the provider, and returns model + latency", async () => {
    getAiKeyConfig.mockResolvedValue({ apiKey: "sk-ant", baseUrl: null, model: null });
    const result = await testAiConnection("dm1", "c1", "anthropic");
    expect(assertCampaignDm).toHaveBeenCalledWith("dm1", "c1");
    expect(result.ok).toBe(true);
    expect(result.model).toBe("claude-opus-4-8");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("rejects an unknown provider", async () => {
    await expect(testAiConnection("dm1", "c1", "wizard-ai")).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects when no usable key is configured", async () => {
    getAiKeyConfig.mockResolvedValue(null);
    await expect(testAiConnection("dm1", "c1", "anthropic")).rejects.toThrow(/No usable key/);
  });

  it("translates a 401 from the provider into a safe auth message", async () => {
    getAiKeyConfig.mockResolvedValue({ apiKey: "sk-bad", baseUrl: null, model: null });
    createAnthropicProvider.mockReturnValue(
      fakeProvider({ generateStructured: vi.fn().mockRejectedValue({ status: 401, message: "secret-leak" }) }),
    );
    const err = await testAiConnection("dm1", "c1", "anthropic").catch((e) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.message).toMatch(/authentication failed/i);
    // The provider's raw message (which could echo config) is not surfaced.
    expect(err.message).not.toContain("secret-leak");
  });

  it("maps statuses to safe hints and never reflects a raw provider message", async () => {
    getAiKeyConfig.mockResolvedValue({ apiKey: "x", baseUrl: "http://x/v1", model: "m" });

    createOpenAiProvider.mockReturnValueOnce(
      fakeProvider({ generateStructured: vi.fn().mockRejectedValue({ status: 404 }) }),
    );
    await expect(testAiConnection("dm1", "c1", "openai-compatible")).rejects.toThrow(/not found/i);

    // A non-auth status surfaces the numeric code only (safe), not free text.
    createOpenAiProvider.mockReturnValueOnce(
      fakeProvider({
        generateStructured: vi.fn().mockRejectedValue({ status: 500, message: "x-api-key: sk-leak" }),
      }),
    );
    const httpErr = await testAiConnection("dm1", "c1", "openai-compatible").catch((e) => e);
    expect(httpErr.message).toMatch(/HTTP 500/);
    expect(httpErr.message).not.toContain("sk-leak");

    // A message-only error (no status) is replaced by a generic message — the
    // provider's free text (which could echo key-bearing config) is never shown.
    createOpenAiProvider.mockReturnValueOnce(
      fakeProvider({ generateStructured: vi.fn().mockRejectedValue({ message: "Authorization: Bearer sk-leak" }) }),
    );
    const bareErr = await testAiConnection("dm1", "c1", "openai-compatible").catch((e) => e);
    expect(bareErr.message).toMatch(/Connection failed/);
    expect(bareErr.message).not.toContain("sk-leak");

    createOpenAiProvider.mockReturnValueOnce(
      fakeProvider({ generateStructured: vi.fn().mockRejectedValue("just a string") }),
    );
    await expect(testAiConnection("dm1", "c1", "openai-compatible")).rejects.toThrow(/Check the key/);
  });

  it("propagates the DM-permission rejection", async () => {
    assertCampaignDm.mockRejectedValue(new ServiceError("You do not have permission to manage this campaign's AI keys."));
    await expect(testAiConnection("player1", "c1", "anthropic")).rejects.toBeInstanceOf(ServiceError);
  });
});
