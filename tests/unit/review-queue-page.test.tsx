// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  listPendingChangeSetsForUser,
  notFound,
  approveChangeSetAction,
  approveChangeSetRunAction,
  editChangeOperationPatchAction,
  rejectChangeSetAction,
  rejectChangeSetRunAction,
  setChangeOperationDecisionAction,
  supersedeChangeSetAction,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listPendingChangeSetsForUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  approveChangeSetAction: vi.fn(),
  approveChangeSetRunAction: vi.fn(),
  editChangeOperationPatchAction: vi.fn(),
  rejectChangeSetAction: vi.fn(),
  rejectChangeSetRunAction: vi.fn(),
  setChangeOperationDecisionAction: vi.fn(),
  supersedeChangeSetAction: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/review", () => ({ listPendingChangeSetsForUser }));
vi.mock("@/app/(dm)/actions", () => ({
  approveChangeSetAction,
  approveChangeSetRunAction,
  editChangeOperationPatchAction,
  rejectChangeSetAction,
  rejectChangeSetRunAction,
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

    const view = render(await ReviewQueuePage({ params: Promise.resolve({ id: "c1" }) }));

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
    expect(screen.getByRole("checkbox", { name: "Apply summary" })).toBeDefined();
    expect(screen.getByDisplayValue("New")).toBeDefined();
    expect(screen.getByDisplayValue("admin")).toBeDefined();
    expect(screen.getByDisplayValue(/very long edited proposal value/)).toBeDefined();
    expect(
      view.container.querySelector<HTMLTextAreaElement>('textarea[name="value:data"]')
        ?.value,
    ).toContain('"threat": "high"');
    expect(screen.getByDisplayValue("7")).toBeDefined();
    expect(screen.getByDisplayValue("false")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save edits" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Accept all" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject op" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Approve 0 accepted" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject set" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Supersede" })).toBeDefined();
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
    expect(
      (screen.getByRole("checkbox", { name: "Apply name" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(
      (screen.getByRole("checkbox", { name: "Apply summary" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(screen.getByDisplayValue("DM summary")).toBeDefined();

    // An EDITED op is already accepted-for-approval, so its accept button is
    // disabled to avoid resetting the decision and discarding the edited patch.
    const acceptButton = screen.getByRole("button", {
      name: "Edited",
    }) as HTMLButtonElement;
    expect(acceptButton.disabled).toBe(true);
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
