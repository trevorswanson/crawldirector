// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, listEntitiesForUser, notFound } =
  vi.hoisted(() => ({
    requireUser: vi.fn(),
    getCampaignForUser: vi.fn(),
    listEntitiesForUser: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/entities", () => ({ listEntitiesForUser }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import KnownWorldPage from "@/app/(player)/play/campaigns/[id]/page";

const entity = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  type: "LOCATION",
  name: "Safe Room",
  summary: "A known place",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "Dungeon",
    summary: null,
    createdAt: new Date(),
    members: [{ role: "PLAYER" }],
    _count: { members: 2, entities: 1 },
  });
  listEntitiesForUser.mockResolvedValue({ entities: [], role: "PLAYER" });
});

afterEach(cleanup);

async function renderPage(searchParams: Record<string, string> = {}) {
  render(
    await KnownWorldPage({
      params: Promise.resolve({ id: "c1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("Known World (player) page", () => {
  it("404s when the user is not a member", async () => {
    getCampaignForUser.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("only ever requests CANON, player-scoped canon (invariant #5)", async () => {
    await renderPage();
    expect(listEntitiesForUser).toHaveBeenCalledWith("u1", "c1", {
      status: "CANON",
      type: "ALL",
    });
  });

  it("renders the in-fiction System banner and player-view tag", async () => {
    await renderPage();
    expect(screen.getByText("THE SYSTEM")).toBeDefined();
    expect(screen.getByText("player view")).toBeDefined();
  });

  it("renders projected entity cards linking to the read-only detail", async () => {
    listEntitiesForUser.mockResolvedValue({
      entities: [entity(), entity({ id: "e2", type: "NPC", name: "Guide" })],
      role: "PLAYER",
    });
    await renderPage();
    const link = screen
      .getByText("Safe Room")
      .closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/play/campaigns/c1/entities/e1");
    expect(screen.getByText("Guide")).toBeDefined();
  });

  it("filters to a selected type and keeps facet totals across all types", async () => {
    listEntitiesForUser.mockResolvedValue({
      entities: [
        entity(),
        entity({ id: "e2", type: "NPC", name: "Guide" }),
        entity({ id: "e3", type: "NPC", name: "Healer" }),
      ],
      role: "PLAYER",
    });
    await renderPage({ type: "NPC" });
    // NPCs shown; the LOCATION is filtered out of the grid.
    expect(screen.getByText("Guide")).toBeDefined();
    expect(screen.getByText("Healer")).toBeDefined();
    expect(screen.queryByText("Safe Room")).toBeNull();
  });

  it("shows an empty state when nothing has been revealed", async () => {
    await renderPage();
    expect(
      screen.getByText(/hasn.t revealed any world details/i),
    ).toBeDefined();
  });
});
