import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, createCampaign, signOut, redirect } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createCampaign: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ createCampaign }));
vi.mock("@/server/auth", () => ({ signOut }));
vi.mock("next/navigation", () => ({ redirect }));

import { createCampaignAction, signOutAction } from "@/app/(dm)/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
});

describe("createCampaignAction", () => {
  it("returns a validation error for an empty name", async () => {
    const result = await createCampaignAction(undefined, form({ name: "" }));
    expect(result?.error).toBeTruthy();
    expect(createCampaign).not.toHaveBeenCalled();
  });

  it("creates the campaign and redirects to its page", async () => {
    createCampaign.mockResolvedValue({ id: "c1" });

    await expect(
      createCampaignAction(undefined, form({ name: "World", summary: "" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createCampaign).toHaveBeenCalledWith("u1", {
      name: "World",
      summary: "",
    });
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1");
  });

  it("returns a generic error when creation fails", async () => {
    createCampaign.mockRejectedValue(new Error("db down"));
    const result = await createCampaignAction(
      undefined,
      form({ name: "World", summary: "" }),
    );
    expect(result?.error).toBe("Could not create the campaign. Please try again.");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("signOutAction", () => {
  it("signs out and redirects to sign-in", async () => {
    await signOutAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/sign-in" });
  });
});
