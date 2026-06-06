import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/errors";

const { requireUser, setAiKey, deleteAiKey, revalidatePath } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  setAiKey: vi.fn(),
  deleteAiKey: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/ai-keys", () => ({ setAiKey, deleteAiKey }));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  deleteAiKeyAction,
  setAiKeyAction,
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
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/camp1/settings");
    expect(result?.success).toContain("9999");
    expect(result?.error).toBeUndefined();
  });

  it("returns a validation error without calling the service", async () => {
    const result = await setAiKeyAction(
      "camp1",
      undefined,
      formData({ providerId: "anthropic", apiKey: "x" }),
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
