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
  toggleRelationshipLockAction,
} = vi.hoisted(() => ({
  createRelationshipAction: vi.fn(),
  updateRelationshipAction: vi.fn(),
  archiveRelationshipAction: vi.fn(),
  toggleRelationshipLockAction: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({
  createRelationshipAction,
  updateRelationshipAction,
  archiveRelationshipAction,
  toggleRelationshipLockAction,
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

    // cancel hides it again
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("DM-only (secret)")).toBeNull();
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
