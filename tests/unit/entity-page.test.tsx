// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  getEntityForUser,
  listEntitiesForUser,
  listCampaignTags,
  listConnectionsForEntity,
  listEventsForEntity,
  resolveFloorEntity,
  getGroupRoster,
  isGroupEntityType,
  listKnowledgeOfEntity,
  listKnowledgeHeldByEntity,
  getEntityProvenance,
  listAiKeys,
  validateEntityReferences,
  countReferrers,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  getEntityForUser: vi.fn(),
  listEntitiesForUser: vi.fn(),
  listCampaignTags: vi.fn(),
  listConnectionsForEntity: vi.fn(),
  listEventsForEntity: vi.fn(),
  resolveFloorEntity: vi.fn(),
  getGroupRoster: vi.fn(),
  isGroupEntityType: vi.fn(),
  listKnowledgeOfEntity: vi.fn(),
  listKnowledgeHeldByEntity: vi.fn(),
  getEntityProvenance: vi.fn(),
  listAiKeys: vi.fn(),
  validateEntityReferences: vi.fn(),
  countReferrers: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/entities", () => ({
  getEntityForUser,
  listEntitiesForUser,
  listCampaignTags,
}));
vi.mock("@/server/services/relationships", () => ({ listConnectionsForEntity }));
vi.mock("@/server/services/events", () => ({ listEventsForEntity, resolveFloorEntity }));
vi.mock("@/server/services/groups", () => ({
  getGroupRoster,
  isGroupEntityType,
}));
vi.mock("@/server/services/review", () => ({ getEntityProvenance }));
vi.mock("@/server/services/ai-keys", () => ({ listAiKeys }));
vi.mock("@/server/services/references", () => ({
  validateEntityReferences,
  countReferrers,
}));
vi.mock("@/server/services/knowledge", () => ({
  listKnowledgeOfEntity,
  listKnowledgeHeldByEntity,
}));
vi.mock("@/components/entities/ai-actions-dialog", () => ({
  AiActionsDialog: ({ locked }: { locked: boolean }) => (
    <div>Entity AI actions{locked ? " (locked)" : ""}</div>
  ),
}));
vi.mock("@/components/entities/knowledge-panel", () => ({
  KnowledgePanel: ({
    knownTo,
    knowsAbout,
  }: {
    knownTo: unknown[];
    knowsAbout: unknown[];
  }) => (
    <div>
      Knowledge panel ({knownTo.length}/{knowsAbout.length})
    </div>
  ),
}));
vi.mock("@/components/entities/roster-panel", () => ({
  RosterPanel: ({
    roster,
    asOfDay,
  }: {
    roster: { rolledUpMemberCount: number };
    asOfDay?: number;
  }) => (
    <div>
      Roster panel ({roster.rolledUpMemberCount})
      {asOfDay !== undefined ? ` as of day ${asOfDay}` : ""}
    </div>
  ),
}));
vi.mock("@/components/entities/connections-panel", () => ({
  ConnectionsPanel: ({
    connections,
    candidates,
    rosterRelationshipIds,
  }: {
    connections: unknown[];
    candidates: unknown[];
    rosterRelationshipIds?: readonly string[];
  }) => (
    <div>
      Connections panel ({connections.length}/{candidates.length})
      {rosterRelationshipIds
        ? ` roster ${rosterRelationshipIds.join(",")}`
        : ""}
    </div>
  ),
}));
vi.mock("@/components/entities/timeline-panel", () => ({
  TimelinePanel: ({
    events,
    candidates,
  }: {
    events: unknown[];
    candidates: unknown[];
  }) => (
    <div>
      Timeline panel ({events.length}/{candidates.length})
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
  ArchiveEntityForm: ({
    entityId,
    referrerCount,
  }: {
    entityId: string;
    referrerCount?: number;
  }) => (
    <div>
      Archive {entityId} (refs: {referrerCount ?? 0})
    </div>
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
  VisibilitySidebarControl: ({
    initialVisibility,
  }: {
    initialVisibility: string;
  }) => <div>Visibility control {initialVisibility}</div>,
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
  lastChangeModel: null,
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
  listCampaignTags.mockResolvedValue([]);
  listConnectionsForEntity.mockResolvedValue([]);
  listEventsForEntity.mockResolvedValue([]);
  resolveFloorEntity.mockResolvedValue(null);
  getGroupRoster.mockResolvedValue(null);
  isGroupEntityType.mockImplementation((type: string) =>
    ["PARTY", "GUILD", "FACTION", "ORGANIZATION"].includes(type),
  );
  listKnowledgeOfEntity.mockResolvedValue([]);
  listKnowledgeHeldByEntity.mockResolvedValue([]);
  listAiKeys.mockResolvedValue([]);
  validateEntityReferences.mockResolvedValue([]);
  countReferrers.mockResolvedValue(0);
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
    imageUrl: null,
    status: "CANON",
    visibility: "PLAYER_VISIBLE",
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

async function renderPage(
  entityId = "e1",
  editOrSearchParams?: string | { edit?: string; event?: string; rosterDay?: string },
) {
  const searchParams =
    typeof editOrSearchParams === "string"
      ? { edit: editOrSearchParams }
      : editOrSearchParams ?? {};
  return render(
    await EntityPage({
      params: Promise.resolve({ id: "c1", entityId }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("EntityPage", () => {
  it("surfaces a broken-reference badge and the archive impact for an ITEM (ADR 0011 Part B)", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({ id: "i1", type: "ITEM", name: "Orphan Blade", crawler: null, data: { itemTypeId: "missing", _v: 1 } }),
    );
    validateEntityReferences.mockResolvedValue([
      {
        field: "itemTypeId",
        patchKey: "data.itemTypeId",
        targetType: "ITEM_TYPE",
        targetId: "missing",
        resolvedName: null,
        broken: true,
      },
    ]);
    countReferrers.mockResolvedValue(0);

    await renderPage("i1");

    // The reference services were called for the entity, and the badge renders.
    expect(validateEntityReferences).toHaveBeenCalledWith("u1", "c1", "i1");
    expect(countReferrers).toHaveBeenCalledWith("u1", "c1", "i1");
    expect(screen.getByText("Broken reference")).toBeDefined();
  });

  it("passes the referrer count into the archive form (impact-aware archive)", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({ id: "t1", type: "ITEM_TYPE", name: "Magic Sword", crawler: null, data: {} }),
    );
    countReferrers.mockResolvedValue(4);

    await renderPage("t1");

    expect(screen.getByText("Archive t1 (refs: 4)")).toBeDefined();
  });

  it("does not flag broken references for a player viewer (invariant #5)", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({ id: "i2", type: "ITEM", name: "Public Item", crawler: null, data: { itemTypeId: "hidden", _v: 1 } }),
    );
    listEntitiesForUser.mockResolvedValue({ entities: [], role: "PLAYER" });
    // A player's scoped validation reads the hidden target as broken...
    validateEntityReferences.mockResolvedValue([
      {
        field: "itemTypeId",
        patchKey: "data.itemTypeId",
        targetType: "ITEM_TYPE",
        targetId: "hidden",
        resolvedName: null,
        broken: true,
      },
    ]);

    await renderPage("i2");

    // ...but the page never renders the badge to a player (hidden ≠ broken).
    expect(screen.queryByText("Broken reference")).toBeNull();
  });

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
    // connections + timeline panels render (relationships & events graph) with
    // the current entity filtered out of the candidate list
    expect(screen.getByText("Connections panel (0/1)")).toBeDefined();
    expect(screen.getByText("Timeline panel (0/1)")).toBeDefined();
    expect(screen.queryAllByText(/Planned · M3/).length).toBe(0);
  });

  it("renders a round avatar image for a character entity", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({ imageUrl: "https://example.com/carl.png" }),
    );

    await renderPage();

    const img = screen.getByRole("img", { name: "Carl" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://example.com/carl.png");
    expect(img.className).toContain("rounded-full");
  });

  it("renders an illustration card image for a non-character entity", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({
        id: "loc1",
        type: "LOCATION",
        name: "The Brothel",
        crawler: null,
        imageUrl: "https://example.com/brothel.png",
      }),
    );

    await renderPage("loc1");

    const img = screen.getByRole("img", {
      name: "The Brothel",
    }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://example.com/brothel.png");
    expect(img.className).not.toContain("rounded-full");
  });

  it("shows a locked empty-state when imageUrl is locked with no value", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({ imageUrl: null, lockedFields: ["imageUrl"] }),
    );

    await renderPage();

    expect(screen.getByText("No image (locked)")).toBeDefined();
    expect(screen.queryByRole("img", { name: "Carl" })).toBeNull();
  });

  it("renders no image block when imageUrl is empty and unlocked", async () => {
    getEntityForUser.mockResolvedValue(crawler({ imageUrl: null }));

    await renderPage();

    expect(screen.queryByRole("img", { name: "Carl" })).toBeNull();
    expect(screen.queryByText("No image (locked)")).toBeNull();
  });

  it("links a crawler's current floor to its FLOOR entity (ADR 0008 §1)", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    resolveFloorEntity.mockResolvedValue({
      id: "floor9",
      name: "Larracos",
      floorNumber: 2,
    });

    await renderPage();

    const floorLink = screen.getByRole("link", { name: /Floor 2 · Larracos/ });
    expect(floorLink.getAttribute("href")).toBe("/campaigns/c1/entities/floor9");
  });

  it("shows a bare floor number when no FLOOR entity resolves", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    resolveFloorEntity.mockResolvedValue(null);

    await renderPage();

    expect(screen.getByText("Floor 2")).toBeDefined();
    expect(screen.queryByRole("link", { name: /Floor 2/ })).toBeNull();
  });

  it("renders the knowledge panel with the entity's reveal grants", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    listKnowledgeOfEntity.mockResolvedValue([{ id: "k1" }]);
    listKnowledgeHeldByEntity.mockResolvedValue([{ id: "k2" }, { id: "k3" }]);

    await renderPage();

    expect(screen.getByText("Knowledge panel (1/2)")).toBeDefined();
  });

  it("hides the DM-only knowledge panel from a player viewer", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    listEntitiesForUser.mockResolvedValue({ entities: [], role: "PLAYER" });

    await renderPage();

    expect(screen.queryByText(/Knowledge panel/)).toBeNull();
  });

  it("shows the consolidated AI action in the entity title row for a configured DM", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    listAiKeys.mockResolvedValue([{ providerId: "anthropic" }]);

    await renderPage();

    const heading = screen.getByRole("heading", { name: "Carl" });
    expect(heading.parentElement?.textContent).toContain("Entity AI actions");
  });

  it("hides the AI generation panel when no provider key is configured", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    listAiKeys.mockResolvedValue([]);

    await renderPage();

    expect(screen.queryByText("Entity AI actions")).toBeNull();
  });

  it("hides the AI generation panel from a player viewer", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    listEntitiesForUser.mockResolvedValue({ entities: [], role: "PLAYER" });
    listAiKeys.mockResolvedValue([{ providerId: "anthropic" }]);

    await renderPage();

    expect(screen.queryByText("Entity AI actions")).toBeNull();
  });

  it("passes rosterDay into group roster snapshots", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({
        id: "party1",
        type: "PARTY",
        name: "Desperado Club",
        crawler: null,
      }),
    );
    getGroupRoster.mockResolvedValue({
      group: { id: "party1", name: "Desperado Club", type: "PARTY" },
      leaders: [
        {
          relationshipId: "current-leader",
          relationshipType: "LEADS",
          sinceDay: null,
          untilDay: null,
          locked: false,
          secret: false,
          entity: { id: "leader1", name: "Carl", type: "CRAWLER" },
          subRoster: null,
        },
      ],
      members: [
        {
          relationshipId: "current-member",
          relationshipType: "MEMBER_OF",
          sinceDay: 40,
          untilDay: null,
          locked: false,
          secret: false,
          entity: { id: "member1", name: "Donut", type: "CRAWLER" },
          subRoster: null,
        },
      ],
      rolledUpMemberCount: 3,
    });

    await renderPage("party1", { rosterDay: "52" });

    expect(getGroupRoster).toHaveBeenCalledWith("u1", "c1", "party1", {
      asOfDay: 52,
    });
    expect(screen.getByText("Roster panel (3) as of day 52")).toBeDefined();
    // Only membership relationships present in this day-specific roster are
    // excluded from the connections pane.
    expect(
      screen.getByText(
        /Connections panel .* roster current-leader,current-member/,
      ),
    ).toBeDefined();
  });

  it("does not pass roster relationship IDs for non-group entities", async () => {
    getEntityForUser.mockResolvedValue(crawler());

    await renderPage();

    const panel = screen.getByText(/Connections panel/);
    expect(panel.textContent).not.toContain("roster");
  });

  it("offers lock toggles for summary and description in the read view", async () => {
    getEntityForUser.mockResolvedValue(crawler());

    await renderPage();

    // Both narrative fields expose an unlocked "Click to lock this field" toggle
    // (alongside the structured-field toggles).
    expect(screen.getAllByTitle("Click to lock this field").length).toBeGreaterThanOrEqual(2);
  });

  it("reflects a locked summary/description as locked toggles", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({ lockedFields: ["summary", "description"] }),
    );

    await renderPage();

    // summary + description both render as locked toggles.
    expect(
      screen.getAllByTitle("Locked field — click to unlock").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("surfaces an AI last-change in provenance (source badge + model)", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    getEntityProvenance.mockResolvedValue({
      ...crawlerProvenance,
      source: "DM",
      model: "claude-opus-4-8",
      lastChangeTitle: "Flesh out Carl",
      lastChangeSource: "AI",
      lastChangeModel: "claude-opus-4-8",
    });

    await renderPage();

    expect(screen.getByText("Flesh out Carl")).toBeDefined();
    // Shown in both the Model row and the Last-change row.
    expect(screen.getAllByText(/claude-opus-4-8/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders entity tags as links that filter the World Browser", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({ tags: ["floor 1", "sponsor"] }),
    );

    await renderPage();

    const tagLink = screen.getByRole("link", { name: "floor 1" });
    expect(tagLink.getAttribute("href")).toBe("/campaigns/c1?tag=floor%201");
    expect(
      screen.getByRole("link", { name: "sponsor" }).getAttribute("href"),
    ).toBe("/campaigns/c1?tag=sponsor");
    // Read view uses entity.tags; the campaign tag scan is skipped here.
    expect(listCampaignTags).not.toHaveBeenCalled();
  });

  it("shows the edit form when ?edit is present", async () => {
    getEntityForUser.mockResolvedValue(crawler());
    listEntitiesForUser.mockResolvedValue({
      entities: [{ id: "it1", name: "Gourd Type", type: "ITEM_TYPE" }],
      role: "OWNER",
    });

    await renderPage("e1", "1");

    expect(screen.getByText("Edit form Carl")).toBeDefined();
    // fields table is hidden in edit mode
    expect(screen.queryByText("Real name")).toBeNull();
    // lock button should be hidden in edit mode
    expect(screen.queryByRole("button", { name: "Lock" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Locked" })).toBeNull();
    // The campaign tag list is fetched only in edit mode (autocomplete source).
    expect(listCampaignTags).toHaveBeenCalledWith("u1", "c1");
  });

  it("disables the visibility lock toggle while editing", async () => {
    getEntityForUser.mockResolvedValue(crawler());

    await renderPage("e1", "1");

    const visibilityLock = screen.getByTitle(
      "Finish or discard edits before changing the visibility lock",
    );
    expect(visibilityLock.getAttribute("disabled")).not.toBeNull();
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

  it("renders the AI description on an ITEM entity without the italic class on the quote block", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({
        type: "ITEM",
        data: {
          itemTypeId: "it1",
          aiDescription: "AI generated item details",
          divine: true,
          unique: true,
          fleeting: true,
        },
      }),
    );
    listEntitiesForUser.mockResolvedValue({
      entities: [
        { id: "e1", name: "Carl", type: "CRAWLER" },
        { id: "it1", name: "Gourd Type", type: "ITEM_TYPE" },
      ],
      role: "OWNER",
    });
    validateEntityReferences.mockResolvedValue([
      {
        field: "itemTypeId",
        patchKey: "data.itemTypeId",
        targetType: "ITEM_TYPE",
        targetId: "it1",
        resolvedName: "Gourd Type",
        broken: false,
      },
    ]);

    await renderPage();

    // Verify item descriptions prefix and description are rendered
    expect(screen.getByText(/This is a divine item\./)).toBeDefined();
    expect(screen.getByText(/This is a unique item\./)).toBeDefined();
    expect(screen.getByText(/This is a fleeting item\./)).toBeDefined();
    expect(screen.getByText(/AI generated item details/)).toBeDefined();
    expect(screen.getByText("Gourd Type")).toBeDefined();

    // The enclosing blockquote should not be italic
    const blockquote = screen.getByText(/AI generated item details/).closest("blockquote");
    expect(blockquote).not.toBeNull();
    expect(blockquote?.className).not.toContain("italic");
  });

  it("renders a lock button next to the AI description, reflecting its lock status", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({
        type: "ITEM",
        lockedFields: ["data.aiDescription"],
        data: {
          itemTypeId: "it1",
          aiDescription: "AI generated item details",
        },
      }),
    );
    listEntitiesForUser.mockResolvedValue({
      entities: [{ id: "it1", name: "Gourd Type", type: "ITEM_TYPE" }],
      role: "OWNER",
    });

    await renderPage();

    // Verify the lock button is rendered with the locked field title
    const lockBtn = screen.getByTitle("Locked field — click to unlock");
    expect(lockBtn).toBeDefined();
  });

  it("renders the AI description section even if empty, when it is locked, so it can be unlocked", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({
        type: "ITEM",
        lockedFields: ["data.aiDescription"],
        data: {
          itemTypeId: "it1",
          aiDescription: null,
        },
      }),
    );
    listEntitiesForUser.mockResolvedValue({
      entities: [{ id: "it1", name: "Gourd Type", type: "ITEM_TYPE" }],
      role: "OWNER",
    });

    await renderPage();

    // Verify placeholder text is shown
    expect(screen.getByText("Empty AI description (locked)")).toBeDefined();
    // Verify lock button is present
    expect(screen.getByTitle("Locked field — click to unlock")).toBeDefined();
  });

  it("renders FLOOR-specific data fields on the read view", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({
        type: "FLOOR",
        name: "Floor Nine",
        summary: "Faction Wars",
        crawler: null,
        tags: [],
        data: {
          floorNumber: 9,
          theme: "Castle siege",
          startDay: 35,
          collapseDay: 65,
        },
      }),
    );

    await renderPage();

    expect(screen.getByText("Floor number")).toBeDefined();
    expect(screen.getByText("9")).toBeDefined();
    expect(screen.getByText("Theme")).toBeDefined();
    expect(screen.getByText("Castle siege")).toBeDefined();
    expect(screen.getByText("Opens")).toBeDefined();
    expect(screen.getByText("Day 35")).toBeDefined();
    expect(screen.getByText("Collapses")).toBeDefined();
    expect(screen.getByText("Day 65")).toBeDefined();
  });

  it("renders unaccounted entity data fields in a generic fallback panel", async () => {
    getEntityForUser.mockResolvedValue(
      crawler({
        type: "NPC",
        name: "Mordecai",
        crawler: null,
        tags: [],
        data: {
          favoriteSnack: "goblin jerky",
          dangerRating: 7,
          nestedSignal: { floor: 3 },
        },
      }),
    );

    await renderPage();

    expect(screen.getByText("Additional data")).toBeDefined();
    expect(screen.getByText("Favorite snack")).toBeDefined();
    expect(screen.getByText("goblin jerky")).toBeDefined();
    expect(screen.getByText("Danger rating")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
    expect(screen.getByText("Nested signal")).toBeDefined();
    expect(screen.getByText('{"floor":3}')).toBeDefined();
  });
});
