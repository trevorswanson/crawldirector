// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  getEntityForUser,
  listConnectionsForEntity,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  getEntityForUser: vi.fn(),
  listConnectionsForEntity: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/entities", () => ({ getEntityForUser }));
vi.mock("@/server/services/relationships", () => ({ listConnectionsForEntity }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import PlayerEntityPage from "@/app/(player)/play/campaigns/[id]/entities/[entityId]/page";

const baseEntity = {
  id: "e1",
  type: "LOCATION",
  name: "Safe Room",
  summary: "A known place",
  description: "## Lore\n\nA quiet corner of the floor.",
  imageUrl: null,
  tags: ["floor-3", "safe"],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({ id: "c1", name: "Dungeon", members: [{ role: "PLAYER" }] });
  getEntityForUser.mockResolvedValue(baseEntity);
  listConnectionsForEntity.mockResolvedValue([]);
});

afterEach(cleanup);

async function renderPage() {
  render(
    await PlayerEntityPage({
      params: Promise.resolve({ id: "c1", entityId: "e1" }),
    }),
  );
}

describe("Player entity detail page", () => {
  it("404s when the projection hides the entity (null)", async () => {
    getEntityForUser.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("reads through the player-scoped seam (getEntityForUser)", async () => {
    await renderPage();
    expect(getEntityForUser).toHaveBeenCalledWith("u1", "c1", "e1");
  });

  it("renders name, summary, description and tags read-only", async () => {
    await renderPage();
    expect(screen.getByText("Safe Room")).toBeDefined();
    expect(screen.getByText("A known place")).toBeDefined();
    expect(screen.getByText("Lore")).toBeDefined();
    expect(screen.getByText("floor-3")).toBeDefined();
  });

  it("renders player-visible connections that link to the other crawler-known entity", async () => {
    listConnectionsForEntity.mockResolvedValue([
      {
        id: "r1",
        type: "ALLY_OF",
        direction: "out",
        disposition: null,
        sinceDay: null,
        untilDay: null,
        notes: null,
        secret: false,
        locked: false,
        source: "DM",
        other: { id: "e2", name: "Princess Donut", type: "CRAWLER" },
      },
    ]);
    await renderPage();
    const link = screen
      .getByText("Princess Donut")
      .closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/play/campaigns/c1/entities/e2");
  });

  it("exposes no edit/lock affordances", async () => {
    await renderPage();
    expect(screen.queryByText(/edit/i)).toBeNull();
    expect(screen.queryByText(/lock/i)).toBeNull();
  });
});
