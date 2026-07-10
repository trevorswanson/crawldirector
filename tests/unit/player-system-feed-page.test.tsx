// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, getSystemMessageFeed, notFound } =
  vi.hoisted(() => ({
    requireUser: vi.fn(),
    getCampaignForUser: vi.fn(),
    getSystemMessageFeed: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/system-feed", () => ({ getSystemMessageFeed }));
vi.mock("next/navigation", () => ({ notFound }));

import SystemFeedPage from "@/app/(player)/play/campaigns/[id]/system/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "Dungeon",
    members: [{ role: "PLAYER" }],
  });
  getSystemMessageFeed.mockResolvedValue([]);
});

afterEach(cleanup);

async function renderPage() {
  render(await SystemFeedPage({ params: Promise.resolve({ id: "c1" }) }));
}

describe("System Feed (player) page", () => {
  it("404s a non-member (never leaks existence)", async () => {
    getCampaignForUser.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the empty state when there are no broadcasts", async () => {
    await renderPage();
    expect(screen.getByText(/No broadcasts yet/i)).toBeTruthy();
    expect(screen.getByText("THE SYSTEM")).toBeTruthy();
  });

  it("renders the projected feed", async () => {
    getSystemMessageFeed.mockResolvedValue([
      {
        entityId: "m1",
        name: "Floor 9 collapses in 24 hours",
        summary: "The countdown begins.",
        description: null,
        tags: [],
        broadcastAt: new Date("2026-07-05T00:00:00Z"),
      },
    ]);
    await renderPage();
    expect(screen.getByText("Floor 9 collapses in 24 hours")).toBeTruthy();
    expect(screen.getByText("The countdown begins.")).toBeTruthy();
  });
});
