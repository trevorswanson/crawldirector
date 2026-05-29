// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, getEntityForUser, notFound } =
  vi.hoisted(() => ({
    requireUser: vi.fn(),
    getCampaignForUser: vi.fn(),
    getEntityForUser: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/entities", () => ({ getEntityForUser }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/entities/entity-forms", () => ({
  ArchiveEntityForm: ({ entityId }: { entityId: string }) => (
    <div>Archive {entityId}</div>
  ),
  EditEntityForm: ({ entity }: { entity: { id: string; name: string } }) => (
    <div>Edit {entity.name}</div>
  ),
}));

import EntityPage from "@/app/(dm)/campaigns/[id]/entities/[entityId]/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "Dungeon",
    summary: null,
    createdAt: new Date(),
    members: [{ role: "OWNER" }],
    _count: { members: 1, entities: 1 },
  });
});

afterEach(cleanup);

describe("EntityPage", () => {
  it("renders entity details and crawler stats", async () => {
    getEntityForUser.mockResolvedValue({
      id: "e1",
      campaignId: "c1",
      type: "CRAWLER",
      name: "Carl",
      summary: "No shoes",
      description: "Canon text",
      status: "CANON",
      visibility: "PLAYER_FACING",
      tags: [],
      version: 2,
      locked: false,
      lockedFields: [],
      isStub: false,
      agentEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      crawler: {
        realName: "Carl",
        crawlerNo: "1",
        level: 3,
        hp: 30,
        mp: 5,
        gold: 10,
        viewCount: BigInt(1000),
        followerCount: BigInt(100),
        favoriteCount: BigInt(10),
        killCount: 4,
        isAlive: true,
        currentFloor: 2,
      },
    });

    render(
      await EntityPage({
        params: Promise.resolve({ id: "c1", entityId: "e1" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Carl" })).toBeDefined();
    expect(screen.getByText("Crawler")).toBeDefined();
    expect(screen.getByText("Player Facing")).toBeDefined();
    expect(screen.getByText("Version 2")).toBeDefined();
    expect(screen.getByText("1000")).toBeDefined();
    expect(screen.getByText("100")).toBeDefined();
    expect(screen.getByText("10")).toBeDefined();
    expect(screen.getByText("Edit Carl")).toBeDefined();
  });

  it("renders locked generic entities without crawler stats", async () => {
    getEntityForUser.mockResolvedValue({
      id: "e2",
      campaignId: "c1",
      type: "NPC",
      name: "Zev",
      summary: null,
      description: null,
      status: "CANON",
      visibility: "DM_ONLY",
      tags: [],
      version: 1,
      locked: true,
      lockedFields: [],
      isStub: false,
      agentEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      crawler: null,
    });

    render(
      await EntityPage({
        params: Promise.resolve({ id: "c1", entityId: "e2" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Zev" })).toBeDefined();
    expect(screen.getByText("Locked")).toBeDefined();
    expect(screen.queryByText("Views")).toBeNull();
    expect(screen.queryByText("Followers")).toBeNull();
    expect(screen.queryByText("Favorites")).toBeNull();
  });

  it("renders unknown floor and dead status for crawlers", async () => {
    getEntityForUser.mockResolvedValue({
      id: "e3",
      campaignId: "c1",
      type: "CRAWLER",
      name: "Fallen Crawler",
      summary: null,
      description: null,
      status: "CANON",
      visibility: "DM_ONLY",
      tags: [],
      version: 1,
      locked: false,
      lockedFields: [],
      isStub: false,
      agentEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      crawler: {
        realName: null,
        crawlerNo: null,
        level: 1,
        hp: null,
        mp: null,
        gold: 0,
        viewCount: BigInt(0),
        followerCount: BigInt(0),
        favoriteCount: BigInt(0),
        killCount: 0,
        isAlive: false,
        currentFloor: null,
      },
    });

    render(
      await EntityPage({
        params: Promise.resolve({ id: "c1", entityId: "e3" }),
      }),
    );

    expect(screen.getByText("Unknown")).toBeDefined();
    expect(screen.getByText("Dead")).toBeDefined();
  });

  it("calls notFound when campaign or entity is inaccessible", async () => {
    getEntityForUser.mockResolvedValue(null);

    await expect(
      EntityPage({
        params: Promise.resolve({ id: "c1", entityId: "missing" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
