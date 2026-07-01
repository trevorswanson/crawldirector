// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, getMyCrawlerSheet, notFound } =
  vi.hoisted(() => ({
    requireUser: vi.fn(),
    getCampaignForUser: vi.fn(),
    getMyCrawlerSheet: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/crawlers", () => ({ getMyCrawlerSheet }));
vi.mock("next/navigation", () => ({ notFound }));

import CrawlerSheetPage from "@/app/(player)/play/campaigns/[id]/sheet/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "Dungeon",
    members: [{ role: "PLAYER" }],
  });
});

afterEach(cleanup);

async function renderPage() {
  render(await CrawlerSheetPage({ params: Promise.resolve({ id: "c1" }) }));
}

describe("Crawler Sheet (player) page", () => {
  it("404s a non-member (never leaks existence)", async () => {
    getCampaignForUser.mockResolvedValue(null);
    getMyCrawlerSheet.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows an empty state when no crawler is linked", async () => {
    getMyCrawlerSheet.mockResolvedValue(null);
    await renderPage();
    expect(screen.getByText(/hasn't linked a crawler/i)).toBeTruthy();
  });

  it("renders the sheet when the player has a linked crawler", async () => {
    getMyCrawlerSheet.mockResolvedValue({
      entityId: "e1",
      name: "Carl",
      summary: null,
      imageUrl: null,
      realName: null,
      crawlerNo: null,
      level: 7,
      hp: 42,
      mp: 12,
      gold: 300,
      currentFloor: 9,
      isAlive: true,
      killCount: 5,
      followerCount: BigInt(0),
      viewCount: BigInt(0),
      stats: {},
    });
    await renderPage();
    expect(screen.getByText("Carl")).toBeTruthy();
    expect(screen.getByText("THE SYSTEM")).toBeTruthy();
  });
});
