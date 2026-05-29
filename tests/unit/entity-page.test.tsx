// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  getEntityForUser,
  getEntityProvenance,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  getEntityForUser: vi.fn(),
  getEntityProvenance: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/entities", () => ({ getEntityForUser }));
vi.mock("@/server/services/review", () => ({ getEntityProvenance }));
vi.mock("@/app/(dm)/actions", () => ({
  toggleEntityLockAction: vi.fn(),
  toggleEntityFieldLockAction: vi.fn(),
}));
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
    <div>Edit form {entity.name}</div>
  ),
}));

import EntityPage from "@/app/(dm)/campaigns/[id]/entities/[entityId]/page";

const crawlerProvenance = {
  source: "DM",
  authorLabel: "trevor",
  createdAt: new Date("2026-05-01"),
  model: null,
  approvedByLabel: "trevor",
  approvedAt: new Date("2026-05-01"),
  lastChangeTitle: "Update Carl",
  lastChangeSource: "DM",
  changeCount: 2,
};

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
  getEntityProvenance.mockResolvedValue(crawlerProvenance);
});

afterEach(cleanup);

function crawler(overrides = {}) {
  return {
    id: "e1",
    campaignId: "c1",
    type: "CRAWLER",
    name: "Carl",
    summary: "No shoes",
    description: "Canon text",
    status: "CANON",
    visibility: "PLAYER_FACING",
    tags: ["floor 1"],
    version: 2,
    locked: false,
    lockedFields: [],
    isStub: false,
    agentEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    crawler: {
      realName: "Carl",
      crawlerNo: "4122",
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
    ...overrides,
  };
}

async function renderPage(entityId = "e1", edit?: string) {
  return render(
    await EntityPage({
      params: Promise.resolve({ id: "c1", entityId }),
      searchParams: Promise.resolve(edit ? { edit } : {}),
    }),
  );
}

describe("EntityPage", () => {
  it("renders the two-column detail with fields table and provenance", async () => {
    getEntityForUser.mockResolvedValue(crawler());

    await renderPage();

    expect(screen.getByRole("heading", { name: "Carl" })).toBeDefined();
    // breadcrumb + rail
    expect(screen.getByText("World Browser")).toBeDefined();
    expect(screen.getByText("Controls")).toBeDefined();
    expect(screen.getByText("Provenance")).toBeDefined();
    // fields table rows (crawler structured fields)
    expect(screen.getByText("Real name")).toBeDefined();
    expect(screen.getByText("Views")).toBeDefined();
    expect(screen.getByText("1000")).toBeDefined();
    expect(screen.getByText("100")).toBeDefined();
    // provenance origin author
    expect(screen.getByText("Update Carl")).toBeDefined();
    expect(screen.getAllByText("trevor").length).toBeGreaterThan(0);
    // read view, not the edit form
    expect(screen.queryByText("Edit form Carl")).toBeNull();
    // planned panels for M3 data
    expect(screen.getAllByText(/Planned · M3/).length).toBe(2);
  });

  it("shows the edit form when ?edit is present", async () => {
    getEntityForUser.mockResolvedValue(crawler());

    await renderPage("e1", "1");

    expect(screen.getByText("Edit form Carl")).toBeDefined();
    // fields table is hidden in edit mode
    expect(screen.queryByText("Real name")).toBeNull();
  });

  it("renders a locked generic entity without crawler fields", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({
        id: "e2",
        type: "NPC",
        name: "Zev",
        crawler: null,
        locked: true,
        visibility: "DM_ONLY",
        description: null,
      }),
    );

    await renderPage("e2");

    expect(screen.getByRole("heading", { name: "Zev" })).toBeDefined();
    expect(screen.queryByText("Views")).toBeNull();
    expect(screen.queryByText("Followers")).toBeNull();
    // whole-entity lock control reads "Locked"
    expect(screen.getByText("Locked")).toBeDefined();
  });

  it("falls back gracefully when no provenance is recorded", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    getEntityProvenance.mockResolvedValue(null);

    await renderPage();

    expect(screen.getByText("No provenance recorded yet.")).toBeDefined();
  });

  it("renders empty-field placeholders for a sparse, fallen crawler", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({
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
        tags: [],
      }),
    );

    await renderPage();

    expect(screen.getByText("Dead")).toBeDefined();
    expect(screen.getByText("Unknown")).toBeDefined();
    // null real name / crawler id / hp / mp + empty tags all render as "—"
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
  });

  it("shows the AI model and a pending-review provenance state", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    getEntityProvenance.mockResolvedValue({
      source: "AI",
      authorLabel: null,
      createdAt: new Date("2026-05-02"),
      model: "claude-opus-4-8",
      approvedByLabel: null,
      approvedAt: null,
      lastChangeTitle: "Generate Carl",
      lastChangeSource: "AI",
      changeCount: 1,
    });

    await renderPage();

    expect(screen.getByText("claude-opus-4-8")).toBeDefined();
    expect(screen.getByText("pending review")).toBeDefined();
  });

  it("calls notFound when the entity is inaccessible", async () => {
    getEntityForUser.mockResolvedValue(null);

    await expect(renderPage("missing")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
