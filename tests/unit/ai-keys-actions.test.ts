import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/errors";

const { requireUser, setAiKey, deleteAiKey, testAiConnection, setCampaignSpendCap, revalidatePath } =
  vi.hoisted(() => ({
    requireUser: vi.fn(),
    setAiKey: vi.fn(),
    deleteAiKey: vi.fn(),
    testAiConnection: vi.fn(),
    setCampaignSpendCap: vi.fn(),
    revalidatePath: vi.fn(),
  }));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/ai-keys", () => ({ setAiKey, deleteAiKey }));
vi.mock("@/server/services/ai-usage", () => ({ setCampaignSpendCap }));
vi.mock("@/server/ai", () => ({ testAiConnection }));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  deleteAiKeyAction,
  setAiKeyAction,
  setSpendCapAction,
  testAiConnectionAction,
} from "@/app/(dm)/campaigns/[id]/settings/actions";

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "dm1" });
});

describe("setAiKeyAction", () => {
  it("saves a valid key and returns a masked success message", async () => {
    setAiKey.mockResolvedValue({ providerId: "anthropic", label: "Anthropic (Claude)", lastFour: "9999" });
    const result = await setAiKeyAction(
      "camp1",
      undefined,
      formData({ providerId: "anthropic", apiKey: "sk-ant-secret-9999" }),
    );
    expect(setAiKey).toHaveBeenCalledWith("dm1", "camp1", {
      providerId: "anthropic",
      apiKey: "sk-ant-secret-9999",
      baseUrl: "",
      model: "",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/camp1/settings");
    expect(result?.success).toContain("9999");
    expect(result?.error).toBeUndefined();
  });

  it("passes the endpoint URL and model through for an OpenAI-compatible provider", async () => {
    setAiKey.mockResolvedValue({ providerId: "openai-compatible", label: "OpenAI-compatible", lastFour: "" });
    const result = await setAiKeyAction(
      "camp1",
      undefined,
      formData({
        providerId: "openai-compatible",
        apiKey: "",
        baseUrl: "http://localhost:11434/v1",
        model: "llama3.1",
      }),
    );
    expect(setAiKey).toHaveBeenCalledWith("dm1", "camp1", {
      providerId: "openai-compatible",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
    });
    // No last-four hint when the key is blank — the message omits it cleanly.
    expect(result?.success).toMatch(/Saved OpenAI-compatible\./);
  });

  it("returns a validation error without calling the service", async () => {
    const result = await setAiKeyAction(
      "camp1",
      undefined,
      formData({ providerId: "", apiKey: "sk-whatever" }),
    );
    expect(setAiKey).not.toHaveBeenCalled();
    expect(result?.error).toBeTruthy();
  });

  it("surfaces a ServiceError message", async () => {
    setAiKey.mockRejectedValue(new ServiceError("Unknown AI provider."));
    const result = await setAiKeyAction(
      "camp1",
      undefined,
      formData({ providerId: "anthropic", apiKey: "sk-valid-enough" }),
    );
    expect(result?.error).toBe("Unknown AI provider.");
  });

  it("returns a generic error for an unexpected failure", async () => {
    setAiKey.mockRejectedValue(new Error("boom"));
    const result = await setAiKeyAction(
      "camp1",
      undefined,
      formData({ providerId: "anthropic", apiKey: "sk-valid-enough" }),
    );
    expect(result?.error).toMatch(/Could not save/);
  });
});

describe("setSpendCapAction", () => {
  it("sets a numeric cap and returns a confirmation", async () => {
    setCampaignSpendCap.mockResolvedValue({ spendCapUsd: 25 });
    const result = await setSpendCapAction("camp1", undefined, formData({ spendCapUsd: "25" }));
    expect(setCampaignSpendCap).toHaveBeenCalledWith("dm1", "camp1", 25);
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/camp1/settings");
    expect(result?.success).toBe("Spend cap set to $25.00.");
  });

  it("clears the cap when the field is blank", async () => {
    setCampaignSpendCap.mockResolvedValue({ spendCapUsd: null });
    const result = await setSpendCapAction("camp1", undefined, formData({ spendCapUsd: "" }));
    expect(setCampaignSpendCap).toHaveBeenCalledWith("dm1", "camp1", null);
    expect(result?.success).toBe("Spend cap cleared.");
  });

  it("returns a validation error for a negative cap without calling the service", async () => {
    const result = await setSpendCapAction("camp1", undefined, formData({ spendCapUsd: "-5" }));
    expect(setCampaignSpendCap).not.toHaveBeenCalled();
    expect(result?.error).toBeTruthy();
  });

  it("surfaces a ServiceError message", async () => {
    setCampaignSpendCap.mockRejectedValue(new ServiceError("nope"));
    const result = await setSpendCapAction("camp1", undefined, formData({ spendCapUsd: "10" }));
    expect(result?.error).toBe("nope");
  });

  it("returns a generic error for an unexpected failure", async () => {
    setCampaignSpendCap.mockRejectedValue(new Error("boom"));
    const result = await setSpendCapAction("camp1", undefined, formData({ spendCapUsd: "10" }));
    expect(result?.error).toMatch(/Could not save the spend cap/);
  });
});

describe("deleteAiKeyAction", () => {
  it("removes the key and revalidates", async () => {
    deleteAiKey.mockResolvedValue({ providerId: "openai" });
    await deleteAiKeyAction("camp1", "openai");
    expect(deleteAiKey).toHaveBeenCalledWith("dm1", "camp1", "openai");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/camp1/settings");
  });

  it("swallows a ServiceError but still revalidates", async () => {
    deleteAiKey.mockRejectedValue(new ServiceError("No key is configured for that provider."));
    await expect(deleteAiKeyAction("camp1", "openai")).resolves.toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/camp1/settings");
  });
});

describe("testAiConnectionAction", () => {
  it("reports a successful connection with model + latency", async () => {
    testAiConnection.mockResolvedValue({
      ok: true,
      providerId: "anthropic",
      model: "claude-opus-4-8",
      latencyMs: 321,
    });
    const result = await testAiConnectionAction("camp1", "anthropic", undefined, new FormData());
    expect(testAiConnection).toHaveBeenCalledWith("dm1", "camp1", "anthropic");
    expect(result?.success).toContain("claude-opus-4-8");
    expect(result?.success).toContain("321");
  });

  it("surfaces a ServiceError message from the provider call", async () => {
    testAiConnection.mockRejectedValue(new ServiceError("The provider rejected the key (authentication failed)."));
    const result = await testAiConnectionAction("camp1", "openai", undefined, new FormData());
    expect(result?.error).toMatch(/authentication failed/);
  });

  it("returns a generic error for an unexpected failure", async () => {
    testAiConnection.mockRejectedValue(new Error("network down"));
    const result = await testAiConnectionAction("camp1", "openai", undefined, new FormData());
    expect(result?.error).toMatch(/Could not reach/);
  });
});
