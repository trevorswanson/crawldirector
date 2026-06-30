// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const {
  createRelationshipAction,
  updateRelationshipAction,
  archiveRelationshipAction,
  restoreRelationshipAction,
  toggleRelationshipLockAction,
  searchEntityCandidatesAction,
} = vi.hoisted(() => ({
  createRelationshipAction: vi.fn(),
  updateRelationshipAction: vi.fn(),
  archiveRelationshipAction: vi.fn(),
  restoreRelationshipAction: vi.fn(),
  toggleRelationshipLockAction: vi.fn(),
  searchEntityCandidatesAction: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({
  createRelationshipAction,
  updateRelationshipAction,
  archiveRelationshipAction,
  restoreRelationshipAction,
  toggleRelationshipLockAction,
  searchEntityCandidatesAction,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  RosterEditor,
  type RosterEditorCandidate,
} from "@/components/entities/roster-editor";
import type { RosterEntry } from "@/server/services/groups";

const group = { id: "g1", name: "The Guild", type: "GUILD" };
const candidates: RosterEditorCandidate[] = [
  { id: "e2", name: "Donut", type: "CRAWLER" },
  { id: "e3", name: "Mordecai", type: "NPC" },
];

function entry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    relationshipId: "r1",
    relationshipType: "MEMBER_OF",
    sinceDay: null,
    untilDay: null,
    disposition: null,
    notes: null,
    locked: false,
    secret: false,
    entity: { id: "carl", name: "Carl", type: "NPC" },
    subRoster: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchEntityCandidatesAction.mockResolvedValue([]);
});

afterEach(cleanup);

describe("RosterEditor", () => {
  it("renders an empty state and an add toggle", () => {
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[]}
        members={[]}
        candidates={candidates}
      />,
    );
    expect(screen.getByText(/No members yet/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add to roster/ })).toBeTruthy();
    // form not open until toggled
    expect(screen.queryByText("DM-only (secret)")).toBeNull();
  });

  it("renders leaders and members with edit controls", () => {
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[
          entry({
            relationshipId: "lead1",
            relationshipType: "LEADS",
            entity: { id: "gm", name: "Guildmaster", type: "NPC" },
          }),
        ]}
        members={[entry({ relationshipId: "m1" })]}
        candidates={candidates}
      />,
    );
    expect(screen.getByText("Leaders")).toBeTruthy();
    expect(screen.getByText("Members")).toBeTruthy();
    expect(screen.getByText("Guildmaster")).toBeTruthy();
    expect(
      screen.getByText("Carl").getAttribute("href"),
    ).toBe("/campaigns/c1/entities/carl");
    // both rows are removable
    expect(screen.getAllByRole("button", { name: "Remove from roster" })).toHaveLength(2);
  });

  it("removes a member and offers an undo that restores it", async () => {
    archiveRelationshipAction.mockResolvedValue(undefined);
    restoreRelationshipAction.mockResolvedValue(undefined);
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[]}
        members={[entry({ relationshipId: "m1" })]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove from roster" }));
    await waitFor(() =>
      expect(archiveRelationshipAction).toHaveBeenCalledWith("c1", "g1", "m1"),
    );
    expect(screen.getByText(/Member removed/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(restoreRelationshipAction).toHaveBeenCalledWith("c1", "g1", "m1"),
    );
  });

  it("promotes a member to leader, preserving the edge's other fields", async () => {
    let captured: FormData | undefined;
    updateRelationshipAction.mockImplementation(
      (_c: string, _g: string, _r: string, _p: unknown, fd: FormData) => {
        captured = fd;
        return Promise.resolve(undefined);
      },
    );
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[]}
        members={[
          entry({
            relationshipId: "m1",
            sinceDay: 3,
            disposition: 25,
            notes: "trusted",
          }),
        ]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Promote to leader" }));
    await waitFor(() =>
      expect(updateRelationshipAction).toHaveBeenCalledWith(
        "c1",
        "g1",
        "m1",
        undefined,
        expect.any(FormData),
      ),
    );
    expect(captured?.get("type")).toBe("LEADS");
    expect(captured?.get("sinceDay")).toBe("3");
    expect(captured?.get("disposition")).toBe("25");
    expect(captured?.get("notes")).toBe("trusted");
  });

  it("demotes a leader to member", async () => {
    let captured: FormData | undefined;
    updateRelationshipAction.mockImplementation(
      (_c: string, _g: string, _r: string, _p: unknown, fd: FormData) => {
        captured = fd;
        return Promise.resolve(undefined);
      },
    );
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[
          entry({
            relationshipId: "lead1",
            relationshipType: "LEADS",
            entity: { id: "gm", name: "Guildmaster", type: "NPC" },
          }),
        ]}
        members={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Demote to member" }));
    await waitFor(() => expect(updateRelationshipAction).toHaveBeenCalledTimes(1));
    expect(captured?.get("type")).toBe("MEMBER_OF");
  });

  it("edits day-bounds, preserving the role and secret flag", async () => {
    let captured: FormData | undefined;
    updateRelationshipAction.mockImplementation(
      (_c: string, _g: string, _r: string, _p: unknown, fd: FormData) => {
        captured = fd;
        return Promise.resolve(undefined);
      },
    );
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[]}
        members={[entry({ relationshipId: "m1", sinceDay: 1, secret: true })]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit membership" }));
    const since = screen.getByLabelText("Since day") as HTMLInputElement;
    expect(since.value).toBe("1");
    fireEvent.change(since, { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Until day"), { target: { value: "9" } });
    fireEvent.submit(since.closest("form")!);

    await waitFor(() => expect(updateRelationshipAction).toHaveBeenCalledTimes(1));
    expect(captured?.get("type")).toBe("MEMBER_OF");
    expect(captured?.get("sinceDay")).toBe("5");
    expect(captured?.get("untilDay")).toBe("9");
    // secret round-trips via the checkbox (defaulted on for this edge)
    expect(captured?.get("secret")).toBe("true");
  });

  it("keeps the edit form open and shows the error when the update fails", async () => {
    updateRelationshipAction.mockResolvedValue({ error: "This membership is locked." });
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[]}
        members={[entry({ relationshipId: "m1" })]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit membership" }));
    fireEvent.submit(screen.getByLabelText("Since day").closest("form")!);
    await waitFor(() =>
      expect(screen.getByText("This membership is locked.")).toBeTruthy(),
    );
    // form stays open
    expect(screen.getByLabelText("Since day")).toBeTruthy();
  });

  it("adds a member through the typeahead as an incoming MEMBER_OF edge", async () => {
    let captured: FormData | undefined;
    createRelationshipAction.mockImplementation(
      (_c: string, _g: string, _p: unknown, fd: FormData) => {
        captured = fd;
        return Promise.resolve(undefined);
      },
    );
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[]}
        members={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add to roster/ }));
    fireEvent.change(screen.getByPlaceholderText("Search entity to add…"), {
      target: { value: "Don" },
    });
    fireEvent.click(screen.getByText("Donut"));
    // The typeahead replaces its search input with the chosen-entity chip once a
    // target is picked, so reach the form via a still-present field.
    fireEvent.submit(screen.getByLabelText("Since day").closest("form")!);

    await waitFor(() => expect(createRelationshipAction).toHaveBeenCalledTimes(1));
    expect(captured?.get("direction")).toBe("in");
    expect(captured?.get("type")).toBe("MEMBER_OF");
    expect(captured?.get("targetId")).toBe("e2");
  });

  it("adds a leader when the leader role is chosen", async () => {
    let captured: FormData | undefined;
    createRelationshipAction.mockImplementation(
      (_c: string, _g: string, _p: unknown, fd: FormData) => {
        captured = fd;
        return Promise.resolve(undefined);
      },
    );
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[]}
        members={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add to roster/ }));
    fireEvent.change(screen.getByPlaceholderText("Search entity to add…"), {
      target: { value: "Mor" },
    });
    fireEvent.click(screen.getByText("Mordecai"));
    fireEvent.click(screen.getByRole("button", { name: "Leader" }));
    fireEvent.submit(screen.getByLabelText("Since day").closest("form")!);

    await waitFor(() => expect(createRelationshipAction).toHaveBeenCalledTimes(1));
    expect(captured?.get("type")).toBe("LEADS");
    expect(captured?.get("targetId")).toBe("e3");
  });

  it("keeps a locked membership read-only but allows unlocking", () => {
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[]}
        members={[entry({ relationshipId: "m1", locked: true })]}
        candidates={candidates}
      />,
    );
    expect(screen.queryByRole("button", { name: "Remove from roster" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit membership" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Promote to leader" })).toBeNull();
    expect(screen.getByRole("button", { name: "Unlock membership" })).toBeTruthy();
  });

  it("does not offer promote/demote for a PART_OF sub-group edge", () => {
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[]}
        members={[
          entry({
            relationshipId: "p1",
            relationshipType: "PART_OF",
            entity: { id: "party", name: "Princess Party", type: "PARTY" },
          }),
        ]}
        candidates={candidates}
      />,
    );
    expect(screen.getByText("Princess Party")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Promote to leader" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Demote to member" })).toBeNull();
    // still removable and editable
    expect(screen.getByRole("button", { name: "Remove from roster" })).toBeTruthy();
  });

  it("renders a direct member's sub-group roster read-only", () => {
    render(
      <RosterEditor
        campaignId="c1"
        group={group}
        leaders={[]}
        members={[
          entry({
            relationshipId: "party1",
            entity: { id: "party", name: "Princess Party", type: "PARTY" },
            subRoster: {
              group: { id: "party", name: "Princess Party", type: "PARTY" },
              leaders: [],
              members: [
                entry({
                  relationshipId: "nested1",
                  entity: { id: "nestedCarl", name: "Nested Carl", type: "NPC" },
                }),
              ],
              rolledUpMemberCount: 1,
            },
          }),
        ]}
        candidates={candidates}
      />,
    );
    expect(screen.getByText("Nested Carl")).toBeTruthy();
    // only the direct party row is editable; the nested member is read-only
    expect(screen.getAllByRole("button", { name: "Remove from roster" })).toHaveLength(1);
  });
});
