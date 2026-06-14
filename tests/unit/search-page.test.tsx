// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, searchCanon, notFound } = vi.hoisted(
  () => ({
    requireUser: vi.fn(),
    getCampaignForUser: vi.fn(),
    searchCanon: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }),
);

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/search", () => ({ searchCanon }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
// The debounced client search box is exercised in its own test.
vi.mock("@/components/search/search-bar", () => ({
  SearchBar: ({ initialQuery }: { initialQuery: string }) => (
    <input data-testid="search-bar" defaultValue={initialQuery} />
  ),
}));

import CampaignSearchPage from "@/app/(dm)/campaigns/[id]/search/page";

function hit(id: string, name: string, summary: string | null) {
  return {
    targetType: "ENTITY",
    targetId: id,
    rank: 0.5,
    entity: {
      id,
      type: "NPC",
      name,
      summary,
      status: "CANON",
      source: "DM",
      tags: [],
      isStub: false,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({ id: "c1", name: "World One" });
});

afterEach(() => cleanup());

describe("CampaignSearchPage", () => {
  it("404s when the campaign is not visible to the user", async () => {
    getCampaignForUser.mockResolvedValue(null);
    await expect(
      CampaignSearchPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ q: "x" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("shows the prompt state with no query", async () => {
    searchCanon.mockResolvedValue({ role: "OWNER", query: "", hits: [] });
    render(
      await CampaignSearchPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(screen.getByText(/Type to search/i)).toBeDefined();
    expect(screen.getByTestId("search-bar")).toBeDefined();
  });

  it("renders ranked result cards linking to entity detail", async () => {
    searchCanon.mockResolvedValue({
      role: "OWNER",
      query: "donut",
      hits: [
        hit("e1", "Princess Donut", "A royal cat"),
        hit("e2", "Donut Stand", null),
      ],
    });
    render(
      await CampaignSearchPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ q: "donut" }),
      }),
    );
    expect(screen.getByText("2 results")).toBeDefined();
    expect(screen.getByText("Princess Donut")).toBeDefined();
    expect(screen.getByText("No summary yet.")).toBeDefined();
    const link = screen.getByText("Princess Donut").closest("a");
    expect(link?.getAttribute("href")).toBe("/campaigns/c1/entities/e1");
  });

  it("shows a no-matches state for a query with no hits", async () => {
    searchCanon.mockResolvedValue({ role: "OWNER", query: "zzz", hits: [] });
    render(
      await CampaignSearchPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ q: "zzz" }),
      }),
    );
    expect(screen.getByText(/No matches for/i)).toBeDefined();
  });

  it("uses a singular noun for a single result", async () => {
    searchCanon.mockResolvedValue({
      role: "OWNER",
      query: "carl",
      hits: [hit("e1", "Carl", "the one")],
    });
    render(
      await CampaignSearchPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ q: "carl" }),
      }),
    );
    expect(screen.getByText("1 result")).toBeDefined();
  });
});
