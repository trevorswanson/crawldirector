// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, getMembershipRole, redirect, notFound } = vi.hoisted(
  () => ({
    requireUser: vi.fn(),
    getMembershipRole: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }),
);

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getMembershipRole }));
vi.mock("next/navigation", () => ({ redirect, notFound }));

import PlayerCampaignLayout from "@/app/(player)/play/campaigns/[id]/layout";
import DmCampaignLayout from "@/app/(dm)/campaigns/[id]/layout";

const child = <div>guarded content</div>;

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
});

describe("player campaign role gate", () => {
  it("renders for an actual player", async () => {
    getMembershipRole.mockResolvedValue("PLAYER");
    const out = await PlayerCampaignLayout({
      children: child,
      params: Promise.resolve({ id: "c1" }),
    });
    expect(out).toBe(child);
  });

  it("sends a DM/owner to the DM console", async () => {
    getMembershipRole.mockResolvedValue("OWNER");
    await expect(
      PlayerCampaignLayout({
        children: child,
        params: Promise.resolve({ id: "c1" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/campaigns/c1");
  });

  it("404s a non-member (never leak existence)", async () => {
    getMembershipRole.mockResolvedValue(null);
    await expect(
      PlayerCampaignLayout({
        children: child,
        params: Promise.resolve({ id: "c1" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("DM campaign role gate", () => {
  it("sends a player to their crawler interface", async () => {
    getMembershipRole.mockResolvedValue("PLAYER");
    await expect(
      DmCampaignLayout({
        children: child,
        params: Promise.resolve({ id: "c1" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/play/campaigns/c1");
  });

  it("renders for a DM/owner", async () => {
    getMembershipRole.mockResolvedValue("OWNER");
    const out = await DmCampaignLayout({
      children: child,
      params: Promise.resolve({ id: "c1" }),
    });
    expect(out).toBe(child);
  });

  it("lets a non-member fall through to the page's own member check", async () => {
    getMembershipRole.mockResolvedValue(null);
    const out = await DmCampaignLayout({
      children: child,
      params: Promise.resolve({ id: "c1" }),
    });
    expect(out).toBe(child);
  });
});
