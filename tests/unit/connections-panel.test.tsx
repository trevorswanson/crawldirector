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
  ConnectionsPanel,
  type ConnectionCandidate,
} from "@/components/entities/connections-panel";
import type { EntityConnection } from "@/server/services/relationships";

const candidates: ConnectionCandidate[] = [
  { id: "e2", name: "Donut", type: "CRAWLER" },
  { id: "e3", name: "Mordecai", type: "NPC" },
];

function connection(overrides: Partial<EntityConnection> = {}): EntityConnection {
  return {
    id: "r1",
    type: "ALLY_OF",
    direction: "out",
    disposition: 50,
    sinceDay: null,
    untilDay: null,
    notes: null,
    secret: false,
    locked: false,
    source: "DM",
    other: { id: "e2", name: "Donut", type: "CRAWLER" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchEntityCandidatesAction.mockResolvedValue([]);
});

afterEach(cleanup);

describe("ConnectionsPanel", () => {
  it("renders the empty state and an add toggle", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[]}
        candidates={candidates}
      />,
    );

    expect(screen.getByText("No relationships yet.")).toBeDefined();
    expect(screen.getByText("Connections · 0")).toBeDefined();
    // form not shown until opened
    expect(screen.queryByText("DM-only (secret)")).toBeNull();
  });

  it("lists outgoing and incoming edges with directional labels and secret marker", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[
          connection(),
          connection({
            id: "r2",
            type: "BETRAYED",
            direction: "in",
            secret: true,
            other: { id: "e3", name: "Mordecai", type: "NPC" },
          }),
        ]}
        candidates={candidates}
      />,
    );

    expect(screen.getByText("Connections · 2")).toBeDefined();
    expect(screen.getByText("Donut")).toBeDefined();
    // outgoing edge reads forward
    expect(screen.getByText("ally of")).toBeDefined();
    // incoming edge reads the inverse label, and secret edges are flagged
    expect(screen.getByText("betrayed by · secret")).toBeDefined();
    // links point at the other entity
    expect(screen.getByText("Donut").closest("a")?.getAttribute("href")).toBe(
      "/campaigns/c1/entities/e2",
    );
  });

  it("shows a signed disposition readout, and omits it when unset", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[
          connection({ disposition: 50 }),
          connection({
            id: "r2",
            disposition: null,
            other: { id: "e3", name: "Mordecai", type: "NPC" },
          }),
        ]}
        candidates={candidates}
      />,
    );

    // The edge with a disposition reads it out, signed; the null one shows nothing.
    expect(screen.getByText("disposition +50")).toBeDefined();
    expect(screen.getAllByText(/disposition/)).toHaveLength(1);
  });

  it("shows day bounds on bounded membership edges", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[
          connection({
            type: "MEMBER_OF",
            sinceDay: 12,
            untilDay: 20,
            other: { id: "party", name: "Princess Posse", type: "PARTY" },
          }),
          connection({
            id: "r2",
            type: "LEADS",
            sinceDay: 21,
            other: { id: "guild", name: "Guild", type: "GUILD" },
          }),
        ]}
        candidates={candidates}
      />,
    );

    expect(screen.getByText("Day 12 -> 20")).toBeDefined();
    expect(screen.getByText("Day 21 -> current")).toBeDefined();
  });

  it("renders connection lock controls with field-lock affordances", () => {
    const { rerender } = render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[connection()]}
        candidates={candidates}
      />,
    );

    const unlockedButton = screen.getByRole("button", { name: "Lock connection" });
    expect(unlockedButton.className).toContain("border");
    expect(unlockedButton.style.borderColor).toBe("var(--line)");
    expect(unlockedButton.style.color).toBe("var(--ink-faint)");
    expect(unlockedButton.querySelector("svg")?.className.baseVal).toContain(
      "lucide-lock-open",
    );

    rerender(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[connection({ locked: true })]}
        candidates={candidates}
      />,
    );

    const lockedButton = screen.getByRole("button", { name: "Unlock connection" });
    expect(screen.queryByText("Locked")).toBeNull();
    expect(lockedButton.style.borderColor).toBe("var(--sys)");
    expect(lockedButton.style.color).toBe("var(--sys)");
    expect(lockedButton.querySelector("svg")?.className.baseVal).toContain(
      "lucide-lock",
    );
    expect(screen.queryByRole("button", { name: "Remove connection" })).toBeNull();
  });

  it("shows an undo affordance after removing a connection", async () => {
    archiveRelationshipAction.mockResolvedValue(undefined);
    restoreRelationshipAction.mockResolvedValue(undefined);
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[connection()]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove connection" }));
    await waitFor(() =>
      expect(archiveRelationshipAction).toHaveBeenCalledWith("c1", "e1", "r1"),
    );

    expect(screen.getByText("Connection removed.")).toBeDefined();
    expect(screen.queryByText("Donut")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(restoreRelationshipAction).toHaveBeenCalledWith("c1", "e1", "r1"),
    );
    expect(screen.queryByText("Connection removed.")).toBeNull();
  });

  it("edits a connection: prefilled form, submits, and closes on success", async () => {
    updateRelationshipAction.mockResolvedValue(undefined);
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[connection({ notes: "Old notes" })]}
        candidates={candidates}
      />,
    );

    // open the inline edit form
    fireEvent.click(screen.getByRole("button", { name: "Edit connection" }));

    // current values are prefilled
    const typeSelect = screen.getByLabelText("Relationship type") as HTMLSelectElement;
    expect(typeSelect.value).toBe("ALLY_OF");
    expect((screen.getByLabelText("Disposition") as HTMLInputElement).value).toBe("50");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Old notes");

    // change the type and save
    fireEvent.change(typeSelect, { target: { value: "RIVAL_OF" } });
    fireEvent.submit(typeSelect.closest("form")!);

    await waitFor(() => expect(updateRelationshipAction).toHaveBeenCalledTimes(1));
    expect(updateRelationshipAction).toHaveBeenCalledWith(
      "c1",
      "e1",
      "r1",
      undefined,
      expect.any(FormData),
    );
    // form closes once the edit resolves without error
    await waitFor(() => expect(screen.queryByLabelText("Relationship type")).toBeNull());
  });

  it("keeps an existing crawler→FLOOR LOCATED_ON type selectable when editing (ADR 0008 §3)", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[
          connection({
            type: "LOCATED_ON",
            other: { id: "f1", name: "Larracos", type: "FLOOR" },
          }),
        ]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit connection" }));

    // The retired pairing is still the selected value (not silently rewritten)
    // and its option is present in the picker.
    const typeSelect = screen.getByLabelText("Relationship type") as HTMLSelectElement;
    expect(typeSelect.value).toBe("LOCATED_ON");
    expect(screen.getByRole("option", { name: "Located On" })).toBeDefined();
  });

  it("prefills membership day bounds when editing a membership edge", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[
          connection({
            type: "MEMBER_OF",
            sinceDay: 7,
            untilDay: 13,
            other: { id: "party", name: "Princess Posse", type: "PARTY" },
          }),
        ]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit connection" }));

    expect((screen.getByLabelText("Since day") as HTMLInputElement).value).toBe("7");
    expect((screen.getByLabelText("Until day") as HTMLInputElement).value).toBe("13");
  });

  it("keeps the edit form open and shows the error when an edit fails", async () => {
    updateRelationshipAction.mockResolvedValue({ error: "This relationship is locked." });
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[connection()]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit connection" }));
    fireEvent.submit(screen.getByLabelText("Relationship type").closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("This relationship is locked.")).toBeDefined(),
    );
    // stays open for correction
    expect(screen.getByLabelText("Relationship type")).toBeDefined();
  });

  it("cancels and toggles the edit form closed without submitting", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[connection()]}
        candidates={candidates}
      />,
    );

    // Cancel closes the form.
    fireEvent.click(screen.getByRole("button", { name: "Edit connection" }));
    expect(screen.getByLabelText("Relationship type")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Relationship type")).toBeNull();

    // Clicking the edit toggle again opens then closes it.
    fireEvent.click(screen.getByRole("button", { name: "Edit connection" }));
    expect(screen.getByLabelText("Relationship type")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Edit connection" }));
    expect(screen.queryByLabelText("Relationship type")).toBeNull();
    expect(updateRelationshipAction).not.toHaveBeenCalled();
  });

  it("hides the edit control for locked edges", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[connection({ locked: true })]}
        candidates={candidates}
      />,
    );

    expect(screen.queryByRole("button", { name: "Edit connection" })).toBeNull();
  });

  it("hides destructive remove controls for locked edges", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[connection({ locked: true })]}
        candidates={candidates}
      />,
    );

    expect(screen.queryByRole("button", { name: "Remove connection" })).toBeNull();
  });

  it("opens the add form, searches a target, then shows ranked types", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add connection/ }));
    expect(screen.getByText("DM-only (secret)")).toBeDefined();
    // target-first: candidates are searchable, no type picker yet
    expect(
      screen.getByPlaceholderText("Search entity to connect…"),
    ).toBeDefined();
    expect(screen.queryByRole("combobox")).toBeNull();

    // filter and pick a target
    fireEvent.change(
      screen.getByPlaceholderText("Search entity to connect…"),
      { target: { value: "Don" } },
    );
    fireEvent.click(screen.getByText("Donut"));

    // once a target is chosen the type picker appears, collapsed to suggested
    expect(screen.getByRole("combobox")).toBeDefined();
    expect(screen.getByRole("option", { name: "Ally Of" })).toBeDefined();
    // non-suggested types are hidden behind "Show all…" until expanded
    expect(screen.queryByRole("option", { name: "Sponsors" })).toBeNull();
    expect(
      screen.getByRole("option", { name: "Show all relationship types…" }),
    ).toBeDefined();

    // expanding reveals the full grouped list
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "__SHOW_ALL_TYPES__" },
    });
    expect(screen.getByRole("option", { name: "Sponsors" })).toBeDefined();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "MEMBER_OF" },
    });
    expect(screen.getByLabelText("Since day")).toBeDefined();
    expect(screen.getByLabelText("Until day")).toBeDefined();

    // cancel hides it again
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("DM-only (secret)")).toBeNull();
  });

  it("never offers crawler→FLOOR LOCATED_ON, even under 'Show all' (ADR 0008 §3)", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[]}
        candidates={[
          ...candidates,
          { id: "f1", name: "Larracos", type: "FLOOR" },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add connection/ }));
    fireEvent.change(
      screen.getByPlaceholderText("Search entity to connect…"),
      { target: { value: "Larr" } },
    );
    fireEvent.click(screen.getByText("Larracos"));

    // Not suggested...
    expect(screen.queryByRole("option", { name: "Located On" })).toBeNull();
    // ...and not reachable even after expanding the full list.
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "__SHOW_ALL_TYPES__" },
    });
    expect(screen.queryByRole("option", { name: "Located On" })).toBeNull();
  });

  it("submits a new connection and closes the add form on success", async () => {
    createRelationshipAction.mockResolvedValue(undefined);
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add connection/ }));
    fireEvent.change(screen.getByPlaceholderText("Search entity to connect…"), {
      target: { value: "Donut" },
    });
    fireEvent.click(screen.getByText("Donut"));
    fireEvent.submit(screen.getByRole("combobox").closest("form")!);

    await waitFor(() => expect(createRelationshipAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("DM-only (secret)")).toBeNull();
  });

  it("exposes a disposition field and a direction toggle once a target is picked", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        sourceName="Carl"
        connections={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add connection/ }));
    // Direction + disposition only surface after both ends are known.
    expect(screen.queryByLabelText("Disposition")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search entity to connect…"), {
      target: { value: "Don" },
    });
    fireEvent.click(screen.getByText("Donut"));

    // Disposition input and both direction options are now present, default out.
    expect(screen.getByLabelText("Disposition")).toBeDefined();
    const outBtn = screen.getByRole("button", { name: "Carl → Donut" });
    const inBtn = screen.getByRole("button", { name: "Donut → Carl" });
    expect(outBtn.getAttribute("aria-pressed")).toBe("true");
    expect(inBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("submits an incoming edge with the chosen direction and disposition", async () => {
    let captured: FormData | undefined;
    createRelationshipAction.mockImplementation(
      (_c: string, _e: string, _p: unknown, fd: FormData) => {
        captured = fd;
        return Promise.resolve(undefined);
      },
    );
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        sourceName="Carl"
        connections={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add connection/ }));
    fireEvent.change(screen.getByPlaceholderText("Search entity to connect…"), {
      target: { value: "Mor" },
    });
    fireEvent.click(screen.getByText("Mordecai"));

    // Flip to an incoming edge (Mordecai → Carl) and set a disposition.
    fireEvent.click(screen.getByRole("button", { name: "Mordecai → Carl" }));
    fireEvent.change(screen.getByLabelText("Disposition"), { target: { value: "40" } });
    fireEvent.submit(screen.getByRole("combobox").closest("form")!);

    await waitFor(() => expect(createRelationshipAction).toHaveBeenCalledTimes(1));
    expect(captured?.get("direction")).toBe("in");
    expect(captured?.get("targetId")).toBe("e3");
    expect(captured?.get("disposition")).toBe("40");
  });

  it("keeps the add form open when connection creation fails", async () => {
    createRelationshipAction.mockResolvedValue({ error: "Choose a target entity." });
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add connection/ }));
    fireEvent.change(screen.getByPlaceholderText("Search entity to connect…"), {
      target: { value: "Donut" },
    });
    fireEvent.click(screen.getByText("Donut"));
    fireEvent.click(screen.getByRole("button", { name: "Add connection" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Choose a target entity.");
    });
    expect(screen.getByText("DM-only (secret)")).toBeDefined();
  });

  it("hides only roster-rendered membership edges and keeps non-current membership visible", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="party1"
        sourceType="PARTY"
        connections={[
          // Incoming: a crawler is MEMBER_OF this party — shown in the roster above.
          connection({
            id: "m1",
            type: "MEMBER_OF",
            direction: "in",
            other: { id: "e2", name: "Donut", type: "CRAWLER" },
          }),
          // Incoming LEADS — also rolled up in the roster.
          connection({
            id: "m2",
            type: "LEADS",
            direction: "in",
            other: { id: "e3", name: "Carl", type: "CRAWLER" },
          }),
          // Incoming but not in this roster snapshot (for example, a former
          // member whose untilDay is before the selected rosterDay).
          connection({
            id: "m-former",
            type: "MEMBER_OF",
            direction: "in",
            untilDay: 12,
            other: { id: "e5", name: "Former Member", type: "CRAWLER" },
          }),
          // Outgoing: this party is PART_OF a guild — NOT in this party's roster.
          connection({
            id: "m3",
            type: "PART_OF",
            direction: "out",
            other: { id: "g1", name: "Iron Guild", type: "GUILD" },
          }),
          // A non-membership edge stays regardless of direction.
          connection({
            id: "a1",
            type: "ALLY_OF",
            direction: "out",
            other: { id: "e4", name: "Mordecai", type: "NPC" },
          }),
        ]}
        candidates={candidates}
        rosterRelationshipIds={["m1", "m2"]}
      />,
    );

    // Only relationship IDs present in this roster snapshot are suppressed.
    expect(screen.getByText("Connections · 3")).toBeDefined();
    expect(screen.queryByText("Donut")).toBeNull();
    expect(screen.queryByText("Carl")).toBeNull();
    expect(screen.getByText("Former Member")).toBeDefined();
    expect(screen.getByText("Iron Guild")).toBeDefined();
    expect(screen.getByText("Mordecai")).toBeDefined();
    // The hidden membership isn't silently dropped — a note points to the roster.
    expect(screen.getByText("2 membership edges shown in the roster above.")).toBeDefined();
  });

  it("shows the singular roster note and suppresses the empty state when all edges are in the roster", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="party1"
        sourceType="PARTY"
        connections={[
          connection({
            id: "m1",
            type: "MEMBER_OF",
            direction: "in",
            other: { id: "e2", name: "Donut", type: "CRAWLER" },
          }),
        ]}
        candidates={candidates}
        rosterRelationshipIds={["m1"]}
      />,
    );

    expect(screen.getByText("Connections · 0")).toBeDefined();
    expect(screen.getByText("1 membership edge shown in the roster above.")).toBeDefined();
    // The "No relationships yet." empty state would be misleading here.
    expect(screen.queryByText("No relationships yet.")).toBeNull();
  });

  it("prompts to create more entities when there are no candidates", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        sourceType="CRAWLER"
        connections={[]}
        candidates={[]}
      />,
    );

    expect(
      screen.getByText(/Create another entity to connect this one to it\./),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Add connection/ })).toBeNull();
  });
});
