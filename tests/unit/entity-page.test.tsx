// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  getEntityForUser,
  listEntitiesForUser,
  listConnectionsForEntity,
  getEntityProvenance,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  getEntityForUser: vi.fn(),
  listEntitiesForUser: vi.fn(),
  listConnectionsForEntity: vi.fn(),
  getEntityProvenance: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/entities", () => ({
  getEntityForUser,
  listEntitiesForUser,
}));
vi.mock("@/server/services/relationships", () => ({ listConnectionsForEntity }));
vi.mock("@/server/services/review", () => ({ getEntityProvenance }));
vi.mock("@/components/entities/connections-panel", () => ({
  ConnectionsPanel: ({
    connections,
    candidates,
  }: {
    connections: unknown[];
    candidates: unknown[];
  }) => (
    <div>
      Connections panel ({connections.length}/{candidates.length})
    </div>
  ),
}));
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
  EditFormProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  EditRailControls: ({ detailHref }: { detailHref: string }) => (
    <div>Edit controls {detailHref}</div>
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
  listEntitiesForUser.mockResolvedValue({ entities: [], role: "OWNER" });
  listConnectionsForEntity.mockResolvedValue([]);
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
    source: "DM",
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
    // Candidate list includes the current entity (filtered out) and one other,
    // so the connection-target candidate mapping is exercised.
    listEntitiesForUser.mockResolvedValue({
      entities: [
        { id: "e1", name: "Carl", type: "CRAWLER" },
        { id: "e2", name: "Donut", type: "CRAWLER" },
      ],
      role: "OWNER",
    });

    await renderPage();

    expect(screen.getByRole("heading", { name: "Carl" })).toBeDefined();
    // breadcrumb + rail
    expect(screen.getByText("WORLD BROWSER")).toBeDefined();
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
    // lock button should be present in read-only mode
    expect(screen.getByRole("button", { name: "Lock" })).toBeDefined();
    // connections panel renders (relationships graph) with the current entity
    // filtered out of the candidate list; timeline still planned
    expect(screen.getByText("Connections panel (0/1)")).toBeDefined();
    expect(screen.getAllByText(/Planned · M3/).length).toBe(1);
  });

  it("shows the edit form when ?edit is present", async () => {
    getEntityForUser.mockResolvedValue(crawler());

    await renderPage("e1", "1");

    expect(screen.getByText("Edit form Carl")).toBeDefined();
    // fields table is hidden in edit mode
    expect(screen.queryByText("Real name")).toBeNull();
    // lock button should be hidden in edit mode
    expect(screen.queryByRole("button", { name: "Lock" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Locked" })).toBeNull();
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

    // edit button should be disabled
    const editBtn = screen.getByRole("button", { name: "Edit" });
    expect(editBtn.getAttribute("disabled")).not.toBeNull();
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

  it("renders the description as formatted Markdown", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({
        description: "# Carl's Notes\n\n- Bullet item\n- **Bold item** with [a link](https://dcc.com)\n\n1. Numbered item 1\n2. Numbered item 2\n\n> Quote block\n\n| Header A | Header B |\n| -------- | -------- |\n| Cell A   | Cell B   |\n\nThis is `inline <code>` snippet.\n\n```html\n<div>Hello</div>\n```",
      }),
    );

    await renderPage();

    // Check heading
    const h1 = screen.getByRole("heading", { name: "Carl's Notes" });
    expect(h1).toBeDefined();
    expect(h1.tagName.toLowerCase()).toBe("h1");

    // Check list item
    expect(screen.getByText("Bullet item")).toBeDefined();

    // Check bold text
    const boldText = screen.getByText("Bold item");
    expect(boldText.tagName.toLowerCase()).toBe("strong");

    // Check link
    const link = screen.getByRole("link", { name: "a link" });
    expect(link.getAttribute("href")).toBe("https://dcc.com");

    // Check ordered list items
    const numberedItem1 = screen.getByText("Numbered item 1");
    expect(numberedItem1.tagName.toLowerCase()).toBe("li");
    expect(numberedItem1.closest("ol")).not.toBeNull();
    expect(screen.getByText("Numbered item 2")).toBeDefined();

    // Check blockquote
    const quoteText = screen.getByText("Quote block");
    expect(quoteText.closest("blockquote")).not.toBeNull();

    // Check table rendering
    const tableHeaderA = screen.getByText("Header A");
    expect(tableHeaderA.tagName.toLowerCase()).toBe("th");
    expect(tableHeaderA.closest("table")).not.toBeNull();

    const tableCellA = screen.getByText("Cell A");
    expect(tableCellA.tagName.toLowerCase()).toBe("td");

    // Check escaped inline code
    expect(screen.getByText("inline <code>")).toBeDefined();

    // Check escaped code block
    expect(screen.getByText("<div>Hello</div>")).toBeDefined();
  });
});
