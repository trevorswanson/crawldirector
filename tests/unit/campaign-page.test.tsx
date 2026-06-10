// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  listEntitiesForUser,
  getEntityTypeCounts,
  listCampaignTags,
  resolveFloorEntities,
  listAiKeys,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listEntitiesForUser: vi.fn(),
  getEntityTypeCounts: vi.fn(),
  listCampaignTags: vi.fn(),
  resolveFloorEntities: vi.fn(),
  listAiKeys: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/entities", () => ({
  listEntitiesForUser,
  getEntityTypeCounts,
  listCampaignTags,
}));
vi.mock("@/server/services/events", () => ({ resolveFloorEntities }));
vi.mock("@/server/services/ai-keys", () => ({ listAiKeys }));
vi.mock("@/components/entities/scaffold-stubs-panel", () => ({
  ScaffoldStubsPanel: ({ campaignId }: { campaignId: string }) => (
    <div>Scaffold with AI {campaignId}</div>
  ),
}));
vi.mock("next/navigation", () => ({
  notFound,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/campaigns/c1",
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/entities/entity-forms", () => ({
  QuickCreateStub: ({ campaignId }: { campaignId: string }) => (
    <div>Quick create {campaignId}</div>
  ),
  RestoreEntityUndoForm: ({ campaignId, entityId }: {
    campaignId: string;
    entityId: string;
  }) => <div>Undo archive {campaignId}/{entityId}</div>,
}));

import CampaignPage from "@/app/(dm)/campaigns/[id]/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  listEntitiesForUser.mockResolvedValue({ entities: [], role: "OWNER" });
  getEntityTypeCounts.mockResolvedValue({});
  listCampaignTags.mockResolvedValue([]);
  resolveFloorEntities.mockResolvedValue(new Map());
  listAiKeys.mockResolvedValue([]);
});

afterEach(cleanup);

describe("CampaignPage", () => {
  it("renders the world browser shell and passes default filters", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c1",
      name: "World One",
      summary: "A grand world",
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 0 },
    });
    getEntityTypeCounts.mockResolvedValue({ CRAWLER: 2 });

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("Entity type")).toBeDefined();
    expect(screen.getByText("Locked only")).toBeDefined();
    expect(screen.getByText("Quick create c1")).toBeDefined();
    // No provider key configured (listAiKeys → []), so the AI scaffold panel is hidden.
    expect(screen.queryByText("Scaffold with AI c1")).toBeNull();
    // count chip: 0 results / 2 total
    expect(screen.getByText("0 / 2")).toBeDefined();
    expect(listEntitiesForUser).toHaveBeenCalledWith("u1", "c1", {
      query: undefined,
      type: "ALL",
      status: "ALL",
      source: undefined,
      lockedOnly: false,
    });
    expect(getEntityTypeCounts).toHaveBeenCalledWith("u1", "c1");
  });

  it("shows the AI scaffold panel when a provider key is configured", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c1",
      name: "World One",
      summary: null,
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 0 },
    });
    listAiKeys.mockResolvedValue([{ providerId: "anthropic", lastFour: "4242" }]);

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("Scaffold with AI c1")).toBeDefined();
  });

  it("translates facet search params into service filters", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c2",
      name: "World Two",
      summary: null,
      createdAt: new Date(),
      members: [],
      _count: { members: 3, entities: 1 },
    });

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c2" }),
        searchParams: Promise.resolve({
          q: "carl",
          type: "CRAWLER",
          status: "PENDING",
          source: "PLAYER",
          locked: "1",
        }),
      }),
    );

    expect(listEntitiesForUser).toHaveBeenCalledWith("u1", "c2", {
      query: "carl",
      type: "CRAWLER",
      status: "PENDING",
      source: "PLAYER_SUGGESTION",
      lockedOnly: true,
    });
  });

  it("renders entity cards linking to detail", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c3",
      name: "World Three",
      summary: null,
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 1 },
    });
    listEntitiesForUser.mockResolvedValue({
      role: "OWNER",
      entities: [
        {
          id: "e1",
          type: "CRAWLER",
          name: "Carl",
          summary: "No shoes",
          status: "CANON",
          visibility: "PLAYER_VISIBLE",
          tags: [],
          locked: true,
          isStub: false,
          updatedAt: new Date(),
          crawler: {
            level: 2,
            realName: "Carl",
            crawlerNo: "1",
            isAlive: true,
            currentFloor: 1,
          },
        },
      ],
    });

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c3" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("link", { name: /Carl/ }).getAttribute("href"),
    ).toBe("/campaigns/c3/entities/e1");
    expect(screen.getByText("Floor 1")).toBeDefined();
  });

  it("names a crawler's current floor from its FLOOR entity (ADR 0008 §1)", async () => {
    getCampaignForUser.mockResolvedValue({ id: "c3", name: "Dungeon", role: "OWNER" });
    listEntitiesForUser.mockResolvedValue({
      role: "OWNER",
      entities: [
        {
          id: "e1",
          type: "CRAWLER",
          name: "Carl",
          summary: "No shoes",
          status: "CANON",
          visibility: "PLAYER_VISIBLE",
          tags: [],
          locked: false,
          isStub: false,
          updatedAt: new Date(),
          crawler: { level: 2, realName: "Carl", crawlerNo: "1", isAlive: true, currentFloor: 9 },
        },
      ],
    });
    resolveFloorEntities.mockResolvedValue(
      new Map([[9, { id: "floor9", name: "Larracos", floorNumber: 9 }]]),
    );

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c3" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("Floor 9 · Larracos")).toBeDefined();
  });

  it("renders an entity archive undo notice from the redirect query", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c1",
      name: "World One",
      summary: null,
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 0 },
    });

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ archivedEntity: "e1" }),
      }),
    );

    expect(screen.getByText("Entity archived.")).toBeDefined();
    expect(screen.getByText("Undo archive c1/e1")).toBeDefined();
  });

  it("shows an empty state when no entities match", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c4",
      name: "World Four",
      summary: null,
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 0 },
    });

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c4" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByText(/No entities match/),
    ).toBeDefined();
  });

  it("renders a Tags facet with clickable campaign tags", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c5",
      name: "World Five",
      summary: null,
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 0 },
    });
    listCampaignTags.mockResolvedValue(["floor 1", "sponsor"]);

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c5" }),
        searchParams: Promise.resolve({ tag: "floor 1" }),
      }),
    );

    expect(screen.getByText("Tags")).toBeDefined();
    // The active tag clears the filter; an inactive tag applies it.
    const active = screen.getByRole("link", { name: "floor 1" });
    expect(active.getAttribute("href")).toBe("/campaigns/c5");
    const inactive = screen.getByRole("link", { name: "sponsor" });
    expect(inactive.getAttribute("href")).toBe("/campaigns/c5?tag=sponsor");

    expect(listCampaignTags).toHaveBeenCalledWith("u1", "c5");
    expect(listEntitiesForUser).toHaveBeenCalledWith(
      "u1",
      "c5",
      expect.objectContaining({ tag: "floor 1" }),
    );
  });

  it("hides the Tags facet when the campaign has no tags", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c6",
      name: "World Six",
      summary: null,
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 0 },
    });
    listCampaignTags.mockResolvedValue([]);

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c6" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.queryByText("Tags")).toBeNull();
  });

  it("calls notFound when the user is not a member", async () => {
    getCampaignForUser.mockResolvedValue(null);

    await expect(
      CampaignPage({
        params: Promise.resolve({ id: "missing" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
