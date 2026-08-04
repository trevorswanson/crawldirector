// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, getMyCrawlerSheet, listMySuggestions, notFound } =
  vi.hoisted(() => ({
    requireUser: vi.fn(),
    getCampaignForUser: vi.fn(),
    getMyCrawlerSheet: vi.fn(),
    listMySuggestions: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/crawlers", () => ({ getMyCrawlerSheet }));
vi.mock("@/server/services/review", () => ({ listMySuggestions }));
vi.mock("next/navigation", () => ({ notFound }));
// The page only needs a bindable reference — mocked so its real dependency
// chain never loads under Vitest (matches player-ask-page.test.tsx).
vi.mock("@/app/(player)/actions", () => ({ submitSuggestionAction: vi.fn() }));

import SuggestionsPage from "@/app/(player)/play/campaigns/[id]/suggestions/page";

function renderPage() {
  return SuggestionsPage({ params: Promise.resolve({ id: "c1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({ id: "c1", name: "Dungeon", members: [{ role: "PLAYER" }] });
  listMySuggestions.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe("Suggestions (player) page", () => {
  it("404s a non-member (never leaks existence)", async () => {
    getCampaignForUser.mockResolvedValue(null);
    getMyCrawlerSheet.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("shows an empty state when no crawler is linked", async () => {
    getMyCrawlerSheet.mockResolvedValue(null);
    render(await renderPage());
    expect(screen.getByText(/hasn't linked a crawler/i)).toBeTruthy();
  });

  it("renders the suggestion form prefilled from the crawler's bio/notes", async () => {
    getMyCrawlerSheet.mockResolvedValue({
      entityId: "e1",
      name: "Carl",
      summary: "Reluctant hero",
      description: "Backstory notes",
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
      stats: {},
    });
    render(await renderPage());
    expect(screen.getByText("THE SYSTEM")).toBeTruthy();
    expect((screen.getByLabelText(/bio/i) as HTMLTextAreaElement).value).toBe(
      "Reluctant hero",
    );
    expect((screen.getByLabelText(/notes/i) as HTMLTextAreaElement).value).toBe(
      "Backstory notes",
    );
  });

  it("renders the caller's suggestion history", async () => {
    getMyCrawlerSheet.mockResolvedValue({
      entityId: "e1",
      name: "Carl",
      summary: null,
      description: null,
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
      stats: {},
    });
    listMySuggestions.mockResolvedValue([
      {
        id: "cs1",
        title: "Suggestion for Carl",
        status: "PENDING",
        createdAt: new Date("2026-01-01"),
        reviewedAt: null,
        reviewNotes: null,
      },
    ]);
    render(await renderPage());
    expect(screen.getByText("Suggestion for Carl")).toBeTruthy();
    expect(screen.getByText("Pending review")).toBeTruthy();
  });
});
