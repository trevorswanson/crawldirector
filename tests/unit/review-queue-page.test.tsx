// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  listPendingChangeSetsForUser,
  getReviewChangeSetForUser,
  getReviewChangeSetSummary,
  listEntitiesForUser,
  notFound,
  approveChangeSetAction,
  approveChangeSetRunAction,
  editChangeOperationPatchAction,
  editEventEffectsOperationAction,
  rejectChangeSetAction,
  rejectChangeSetRunAction,
  reopenChangeSetAction,
  setChangeOperationDecisionAction,
  supersedeChangeSetAction,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listPendingChangeSetsForUser: vi.fn(),
  getReviewChangeSetForUser: vi.fn(),
  getReviewChangeSetSummary: vi.fn(),
  listEntitiesForUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  approveChangeSetAction: vi.fn(),
  approveChangeSetRunAction: vi.fn(),
  editChangeOperationPatchAction: vi.fn(),
  editEventEffectsOperationAction: vi.fn(),
  rejectChangeSetAction: vi.fn(),
  rejectChangeSetRunAction: vi.fn(),
  reopenChangeSetAction: vi.fn(),
  setChangeOperationDecisionAction: vi.fn(),
  supersedeChangeSetAction: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/review", () => ({
  listPendingChangeSetsForUser,
  getReviewChangeSetForUser,
  getReviewChangeSetSummary,
}));
vi.mock("@/server/services/entities", () => ({ listEntitiesForUser }));
vi.mock("@/app/(dm)/actions", () => ({
  approveChangeSetAction,
  approveChangeSetRunAction,
  editChangeOperationPatchAction,
  editEventEffectsOperationAction,
  rejectChangeSetAction,
  rejectChangeSetRunAction,
  reopenChangeSetAction,
  setChangeOperationDecisionAction,
  supersedeChangeSetAction,
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import ReviewQueuePage from "@/app/(dm)/campaigns/[id]/review/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "Dungeon",
    summary: null,
    members: [{ role: "OWNER" }],
    _count: { members: 1, entities: 0 },
  });
  listPendingChangeSetsForUser.mockResolvedValue([]);
  getReviewChangeSetForUser.mockResolvedValue(null);
  getReviewChangeSetSummary.mockResolvedValue(null);
  listEntitiesForUser.mockResolvedValue({ entities: [] });
});

afterEach(cleanup);

describe("ReviewQueuePage", () => {
  it("renders the empty review queue state", async () => {
    render(await ReviewQueuePage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText("Review Queue")).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "No pending proposals" }),
    ).toBeDefined();
    expect(listPendingChangeSetsForUser).toHaveBeenCalledWith("u1", "c1");
  });

  it("renders pending change set metadata and operation diffs", async () => {
    listPendingChangeSetsForUser.mockResolvedValue([
      {
        id: "cs1",
        campaignId: "c1",
        source: "AI",
        title: "Propose Zev update",
        summary: "Adds a better admin summary.",
        status: "PENDING",
        actorUserId: "u1",
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: null,
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        operations: [
          {
            id: "op1",
            changeSetId: "cs1",
            op: "UPDATE_ENTITY",
            targetType: "ENTITY",
            targetId: "entity-123456",
            targetLabel: "Zev",
            targetEntityType: "NPC",
            targetLocked: false,
            lockedFields: ["crawler.level"],
            currentValues: {
              summary: "Current canon summary",
            },
            patch: {
              _baseVersion: { to: 1 },
              summary: { from: "Old", to: "New" },
              tags: { from: [], to: ["admin"] },
              description: {
                from: "",
                to: "A very long edited proposal value that should render in a textarea for the DM to tune before approval.",
              },
              data: { from: {}, to: { threat: "high" } },
              "crawler.level": { from: 1, to: 7 },
              "crawler.isAlive": { from: true, to: false },
            },
            editedPatch: null,
            decision: "PENDING",
            blockedByLock: true,
            isStale: true,
          },
        ],
      },
    ]);

    render(await ReviewQueuePage({ params: Promise.resolve({ id: "c1" }) }));

    expect(
      screen.getByRole("heading", { name: "Propose Zev update" }),
    ).toBeDefined();
    expect(screen.getByText("Adds a better admin summary.")).toBeDefined();
    expect(screen.getAllByText("Stale").length).toBeGreaterThan(0);
    expect(screen.getByText("Update")).toBeDefined();
    expect(screen.getByText("NPC")).toBeDefined();
    expect(screen.getByText("Zev")).toBeDefined();
    expect(screen.getByText("Conflict on summary — choose a resolution")).toBeDefined();
    expect(screen.getByText("Current canon summary")).toBeDefined();
    expect(screen.getByText("BLOCKED BY LOCK — UNLOCK TARGET TO APPLY")).toBeDefined();
    expect(screen.getByText("summary")).toBeDefined();
    expect(screen.getAllByText("Old").length).toBeGreaterThan(0);
    expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    // Read-first diff: proposed values render as text (no always-on inputs), with
    // per-field Accept / Reject / Edit controls.
    expect(screen.getByText("admin")).toBeDefined();
    expect(screen.getByRole("button", { name: "Accept summary" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject summary" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Edit summary" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Save field edits" })).toBeDefined();
    // The locked field is display-only — no per-field controls.
    expect(
      screen.queryByRole("button", { name: "Accept crawler.level" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Accept all" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject op" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Approve 5 accepted" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject set" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Supersede" })).toBeDefined();
  });

  it("renders the structured effect-row editor for APPLY_EVENT_EFFECTS ops", async () => {
    listEntitiesForUser.mockResolvedValue({
      entities: [
        { id: "crawler-1", name: "Carl", type: "CRAWLER" },
        { id: "npc-1", name: "Princess Donut", type: "NPC" },
      ],
    });
    listPendingChangeSetsForUser.mockResolvedValue([
      {
        id: "cs-fx",
        campaignId: "c1",
        source: "DM",
        title: "Apply event effects",
        summary: null,
        status: "PENDING",
        actorUserId: "u1",
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: null,
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        operations: [
          {
            id: "op-fx",
            changeSetId: "cs-fx",
            op: "APPLY_EVENT_EFFECTS",
            targetType: "EVENT",
            targetId: "event-1",
            targetLabel: "Floor 9 boss falls",
            targetEntityType: "EVENT",
            targetLocked: false,
            lockedFields: [],
            currentValues: {},
            patch: {
              effects: {
                to: [
                  null,
                  [],
                  { kind: "NOPE", targetEntityId: "crawler-1" },
                  { kind: "SET_STAT" },
                  {
                    id: "fx-1",
                    kind: "ADJUST_STAT",
                    targetEntityId: "crawler-1",
                    stat: "gold",
                    delta: 500,
                    note: "Boss loot",
                    applied: false,
                    reviewStatus: "PENDING",
                    pendingChangeSetId: "cs-fx",
                    pendingOperationId: "op-fx",
                  },
                ],
              },
            },
            editedPatch: null,
            decision: "PENDING",
            blockedByLock: false,
            isStale: false,
          },
          {
            id: "op-fx-empty",
            changeSetId: "cs-fx",
            op: "APPLY_EVENT_EFFECTS",
            targetType: "EVENT",
            targetId: "event-2",
            targetLabel: "Malformed effects",
            targetEntityType: "EVENT",
            targetLocked: false,
            lockedFields: [],
            currentValues: {},
            patch: { effects: { to: "not-an-array" } },
            editedPatch: null,
            decision: "PENDING",
            blockedByLock: false,
            isStale: false,
          },
        ],
      },
    ]);

    const view = render(
      await ReviewQueuePage({ params: Promise.resolve({ id: "c1" }) }),
    );

    // The campaign's crawlers are fetched only because an effect op is pending.
    expect(listEntitiesForUser).toHaveBeenCalledWith("u1", "c1");
    // Read-first effect op: a summary + an Edit affordance, not the live editor.
    expect(screen.getByRole("button", { name: "Edit effect 1" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save effects" })).toBeNull();
    expect(
      view.container.querySelector('textarea[name="value:effects"]'),
    ).toBeNull();
    expect(view.container.querySelector('input[name="effectId_0"]')).toBeNull();
    // Summary row: resolved target name, described effect, and note.
    expect(screen.getByText("Carl")).toBeDefined();
    expect(screen.getByText("Gold +500")).toBeDefined();
    expect(screen.getByText("— Boss loot")).toBeDefined();
    expect(screen.getByText("No effects in this proposal.")).toBeDefined();
  });

  it("skips the crawler lookup when no effect op is pending", async () => {
    listPendingChangeSetsForUser.mockResolvedValue([
      {
        id: "cs-ent",
        campaignId: "c1",
        source: "AI",
        title: "Create entity",
        summary: null,
        status: "PENDING",
        actorUserId: "u1",
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: null,
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        operations: [
          {
            id: "op-ent",
            changeSetId: "cs-ent",
            op: "CREATE_ENTITY",
            targetType: "ENTITY",
            targetId: null,
            targetLabel: "Grull",
            targetEntityType: "MOB_TYPE",
            targetLocked: false,
            lockedFields: [],
            currentValues: {},
            patch: { name: { to: "Grull" } },
            editedPatch: null,
            decision: "PENDING",
            blockedByLock: false,
            isStale: false,
          },
        ],
      },
    ]);

    await ReviewQueuePage({ params: Promise.resolve({ id: "c1" }) });

    expect(listEntitiesForUser).not.toHaveBeenCalled();
  });

  it("renders the mockup queue rail with source filters and selected detail", async () => {
    listPendingChangeSetsForUser.mockResolvedValue([
      {
        id: "cs-ai",
        campaignId: "c1",
        source: "AI",
        title: "AI faction proposal",
        summary: "AI summary",
        status: "PENDING",
        actorUserId: "u1",
        providerId: null,
        model: "claude-sonnet-4.6",
        promptId: null,
        promptVersion: null,
        runId: "run-ai",
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        operations: [
          {
            id: "op-ai",
            changeSetId: "cs-ai",
            op: "CREATE_ENTITY",
            targetType: "ENTITY",
            targetId: null,
            targetLabel: "Grull Trench-Hound",
            targetEntityType: "MOB_TYPE",
            targetLocked: false,
            lockedFields: [],
            currentValues: {},
            patch: { name: { to: "Grull Trench-Hound" } },
            editedPatch: null,
            decision: "PENDING",
            blockedByLock: false,
            isStale: false,
          },
        ],
      },
      {
        id: "cs-player",
        campaignId: "c1",
        source: "PLAYER_SUGGESTION",
        title: "Player suggestion — Carl bio update",
        summary: "Player summary",
        status: "PENDING",
        actorUserId: "u2",
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: null,
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        operations: [],
      },
      {
        id: "cs-import",
        campaignId: "c1",
        source: "IMPORT",
        title: "Import — Canonical Floors 10-12 pack",
        summary: "Import summary",
        status: "PENDING",
        actorUserId: null,
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: null,
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        operations: [],
      },
    ]);

    render(
      await ReviewQueuePage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ selected: "cs-player" }),
      }),
    );

    expect(
      screen.getAllByText(
        (_, element) => element?.textContent === "Review Queue · 3 sets",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "ALL" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "AI" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "PLAYER" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "IMPORT" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("AI faction proposal").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Player suggestion — Carl bio update").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Import — Canonical Floors 10-12 pack").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Player suggestion — Carl bio update" })).toBeDefined();
    expect(screen.getByText("Player summary")).toBeDefined();
  });

  it("filters the queue rail by review source", async () => {
    listPendingChangeSetsForUser.mockResolvedValue([
      {
        id: "cs-ai",
        campaignId: "c1",
        source: "AI",
        title: "AI only",
        summary: "AI summary",
        status: "PENDING",
        actorUserId: "u1",
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: null,
        baseVersions: { entity: 4 },
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(Date.now() - 90_000),
        updatedAt: new Date(),
        operations: [],
      },
      {
        id: "cs-player",
        campaignId: "c1",
        source: "PLAYER_SUGGESTION",
        title: "Player hidden by AI filter",
        summary: "Player summary",
        status: "PENDING",
        actorUserId: "u2",
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: null,
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        operations: [],
      },
    ]);

    render(
      await ReviewQueuePage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ source: "AI", selected: "cs-player" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "AI only" })).toBeDefined();
    expect(screen.getByText("1m ago")).toBeDefined();
    expect(screen.getByText("base v4")).toBeDefined();
    expect(screen.queryByText("Player hidden by AI filter")).toBeNull();
  });

  it("shows an empty filtered state when a source has no proposals", async () => {
    listPendingChangeSetsForUser.mockResolvedValue([
      {
        id: "cs-ai",
        campaignId: "c1",
        source: "AI",
        title: "AI proposal",
        summary: null,
        status: "PENDING",
        actorUserId: "u1",
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: null,
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        updatedAt: new Date(),
        operations: [],
      },
    ]);

    render(
      await ReviewQueuePage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ source: "IMPORT" }),
      }),
    );

    expect(screen.getAllByText("No pending import proposals.").length).toBeGreaterThan(0);
    expect(screen.getByText("Select a proposal to review.")).toBeDefined();
    expect(screen.queryByRole("heading", { name: "AI proposal" })).toBeNull();
  });

  it("renders generator run batch controls for pending run proposals", async () => {
    listPendingChangeSetsForUser.mockResolvedValue([
      {
        id: "cs1",
        campaignId: "c1",
        source: "AI",
        title: "Generate first faction",
        summary: "",
        status: "PENDING",
        actorUserId: "u1",
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: "run-123456",
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        operations: [
          {
            id: "op1",
            changeSetId: "cs1",
            op: "CREATE_ENTITY",
            targetType: "ENTITY",
            targetId: null,
            patch: {
              type: { to: "FACTION" },
              name: { to: "Skull Empire" },
            },
            editedPatch: null,
            decision: "PENDING",
            blockedByLock: false,
            isStale: false,
          },
        ],
      },
      {
        id: "cs2",
        campaignId: "c1",
        source: "AI",
        title: "Generate second faction",
        summary: "",
        status: "PENDING",
        actorUserId: "u1",
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: "run-123456",
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        operations: [
          {
            id: "op2",
            changeSetId: "cs2",
            op: "CREATE_ENTITY",
            targetType: "ENTITY",
            targetId: null,
            patch: {
              type: { to: "FACTION" },
              name: { to: "Bloom Queens" },
            },
            editedPatch: null,
            decision: "PENDING",
            blockedByLock: false,
            isStale: false,
          },
        ],
      },
    ]);

    render(await ReviewQueuePage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText("Generator run · run-1234")).toBeDefined();
    expect(screen.getByText("2 pending proposals")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Accept all non-conflicting" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject run" })).toBeDefined();
  });

  it("renders saved edited patch values as the editable queue state", async () => {
    listPendingChangeSetsForUser.mockResolvedValue([
      {
        id: "cs1",
        campaignId: "c1",
        source: "AI",
        title: "Trim blocked fields",
        summary: "",
        status: "PENDING",
        actorUserId: "u1",
        providerId: null,
        model: null,
        promptId: null,
        promptVersion: null,
        runId: null,
        baseVersions: {},
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        operations: [
          {
            id: "op1",
            changeSetId: "cs1",
            op: "UPDATE_ENTITY",
            targetType: "ENTITY",
            targetId: "entity-123456",
            patch: {
              _baseVersion: { to: 1 },
              name: { from: "Locked", to: "AI name" },
              summary: { from: "", to: "AI summary" },
            },
            editedPatch: {
              summary: { to: "DM summary" },
            },
            decision: "EDITED",
            blockedByLock: false,
            isStale: false,
          },
        ],
      },
    ]);

    render(await ReviewQueuePage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText("EDITED")).toBeDefined();
    // editedPatch carries only `summary`, so `name` initializes rejected and
    // `summary` accepted (showing the edited value as the proposed read-only line).
    expect(
      screen.getByRole("button", { name: "Reject name" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Accept summary" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("DM summary")).toBeDefined();

    // An EDITED op is already accepted-for-approval, so its accept button is
    // disabled to avoid resetting the decision and discarding the edited patch.
    const acceptButton = screen.getByRole("button", {
      name: "Edited",
    }) as HTMLButtonElement;
    expect(acceptButton.disabled).toBe(true);
  });

  it("shows the committed done state after an approval", async () => {
    getReviewChangeSetSummary.mockResolvedValue({
      id: "cs9",
      title: "Approved set",
      source: "AI",
      status: "APPROVED",
    });

    render(
      await ReviewQueuePage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ done: "cs9" }),
      }),
    );

    expect(getReviewChangeSetSummary).toHaveBeenCalledWith("u1", "c1", "cs9");
    expect(screen.getByText("Committed to canon")).toBeDefined();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeDefined();
  });

  it("shows the rejected done state with a reopen control", async () => {
    getReviewChangeSetSummary.mockResolvedValue({
      id: "cs9",
      title: "Rejected set",
      source: "AI",
      status: "REJECTED",
    });

    render(
      await ReviewQueuePage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ done: "cs9" }),
      }),
    );

    expect(screen.getByText("Proposal rejected")).toBeDefined();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeDefined();
  });

  it("reopens an approved proposal as read-only history", async () => {
    getReviewChangeSetForUser.mockResolvedValue({
      id: "cs9",
      campaignId: "c1",
      source: "AI",
      title: "Approved set",
      summary: null,
      status: "APPROVED",
      actorUserId: "u1",
      providerId: null,
      model: null,
      promptId: null,
      promptVersion: null,
      runId: null,
      baseVersions: {},
      reviewedById: "u1",
      reviewedAt: new Date(),
      reviewNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      operations: [
        {
          id: "op9",
          changeSetId: "cs9",
          op: "UPDATE_ENTITY",
          targetType: "ENTITY",
          targetId: "entity-9",
          targetLabel: "Zev",
          targetEntityType: "NPC",
          targetLocked: false,
          lockedFields: [],
          currentValues: { summary: "Approved summary" },
          patch: { summary: { from: "Old", to: "Approved summary" } },
          editedPatch: null,
          decision: "ACCEPTED",
          blockedByLock: false,
          isStale: false,
        },
      ],
    });

    render(
      await ReviewQueuePage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ reopened: "cs9" }),
      }),
    );

    expect(getReviewChangeSetForUser).toHaveBeenCalledWith("u1", "c1", "cs9");
    expect(screen.getByText("Done · read-only history")).toBeDefined();
    expect(screen.getByText("Approved summary")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Accept summary" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept all" })).toBeNull();
  });

  it("calls notFound when the campaign is unavailable", async () => {
    getCampaignForUser.mockResolvedValue(null);

    await expect(
      ReviewQueuePage({ params: Promise.resolve({ id: "missing" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(listPendingChangeSetsForUser).not.toHaveBeenCalled();
  });
});
