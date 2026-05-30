// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  listPendingChangeSetsForUser,
  notFound,
  approveChangeSetAction,
  editChangeOperationPatchAction,
  rejectChangeSetAction,
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
  editChangeOperationPatchAction: vi.fn(),
  rejectChangeSetAction: vi.fn(),
  setChangeOperationDecisionAction: vi.fn(),
  supersedeChangeSetAction: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/review", () => ({ listPendingChangeSetsForUser }));
vi.mock("@/app/(dm)/actions", () => ({
  approveChangeSetAction,
  editChangeOperationPatchAction,
  rejectChangeSetAction,
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

    expect(screen.getByRole("heading", { name: "Review Queue" })).toBeDefined();
    expect(screen.getByText("No pending proposals")).toBeDefined();
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

    expect(screen.getByText("Propose Zev update")).toBeDefined();
    expect(screen.getByText("Adds a better admin summary.")).toBeDefined();
    expect(screen.getByText("Blocked")).toBeDefined();
    expect(screen.getByText("Stale")).toBeDefined();
    expect(screen.getByText("Target · entity-1")).toBeDefined();
    expect(screen.getByText("PENDING")).toBeDefined();
    expect(screen.getByText("summary")).toBeDefined();
    expect(screen.getByText("Old")).toBeDefined();
    expect(screen.getByText("New")).toBeDefined();
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
    expect(screen.getByRole("button", { name: "Accept op" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject op" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Supersede" })).toBeDefined();
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
