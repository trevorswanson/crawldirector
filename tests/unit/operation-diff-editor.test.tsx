// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  OperationDiffEditor,
  type ReviewFieldInit,
} from "@/components/review/operation-diff-editor";
import type { EntityCandidate } from "@/components/entities/entity-typeahead";

afterEach(cleanup);

function field(overrides: Partial<ReviewFieldInit>): ReviewFieldInit {
  return {
    field: "summary",
    fromText: "Old",
    toText: "New",
    kind: "string",
    blocked: false,
    stale: false,
    decision: "PENDING",
    editing: false,
    draft: "New",
    ...overrides,
  };
}

// Capture per-row decisions and edits so one field cannot decide its siblings.
function renderWithCapture(
  fields: ReviewFieldInit[],
  opRejected = false,
  candidates: EntityCandidate[] = [],
) {
  const decisions: { field: string; decision: string }[] = [];
  const edits: { field: string; data: FormData }[] = [];
  const decisionAction = (field: string, decision: string) => {
    decisions.push({ field, decision });
  };
  const editAction = (field: string, formData: FormData) => {
    edits.push({ field, data: formData });
  };
  const view = render(
    <OperationDiffEditor
      candidates={candidates}
      decisionAction={decisionAction}
      editAction={editAction}
      fields={fields}
      opRejected={opRejected}
    />,
  );
  return { view, decisions, edits };
}

describe("OperationDiffEditor", () => {
  it("renders a read-only diff with per-field controls and no inputs", () => {
    const { view } = renderWithCapture([
      field({ field: "summary", fromText: "Old", toText: "New" }),
    ]);

    expect(screen.getByText("Old")).toBeDefined();
    expect(screen.getByText("New")).toBeDefined();
    expect(screen.getByRole("button", { name: "Accept summary" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reject summary" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Edit summary" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Accept summary" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: "Reject summary" }).getAttribute("aria-pressed"),
    ).toBe("false");
    // Read-first: no visible value input until Edit is clicked.
    expect(view.container.querySelector('input[name="value"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Save field edits" })).toBeNull();
  });

  it("persists accept and reject decisions for only the clicked rows", () => {
    const { decisions } = renderWithCapture([
      field({ field: "summary" }),
      field({ field: "title", fromText: null, toText: "Hi", draft: "Hi" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Accept title" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject summary" }));

    expect(decisions).toEqual([
      { field: "title", decision: "ACCEPTED" },
      { field: "summary", decision: "REJECTED" },
    ]);
  });

  it("replaces row controls with save/discard while editing", () => {
    const { edits } = renderWithCapture([field({ field: "summary", draft: "New" })]);

    fireEvent.click(screen.getByRole("button", { name: "Edit summary" }));
    expect(screen.queryByRole("button", { name: "Accept summary" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject summary" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save summary" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Discard summary edit" })).toBeDefined();
    const input = screen.getByLabelText("summary value") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Edited summary" } });
    fireEvent.click(screen.getByRole("button", { name: "Save summary" }));

    expect(edits.at(-1)?.field).toBe("summary");
    expect(edits.at(-1)?.data.get("value")).toBe("Edited summary");
  });

  it("renders typed inputs only after Edit and lets Edit be cancelled", () => {
    renderWithCapture([
      field({
        field: "secret",
        kind: "boolean",
        fromText: null,
        toText: "true",
        draft: "true",
      }),
      field({
        field: "data",
        kind: "json",
        fromText: null,
        toText: '{"threat":"high"}',
        draft: '{"threat":"high"}',
      }),
      field({
        field: "description",
        fromText: null,
        toText: "Long",
        draft: "x".repeat(81),
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Edit secret" }));
    fireEvent.change(screen.getByLabelText("secret value"), {
      target: { value: "false" },
    });
    expect(screen.getByDisplayValue("false")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Edit data" }));
    fireEvent.change(screen.getByLabelText("data value"), {
      target: { value: '{"threat":"low"}' },
    });
    expect(screen.getByDisplayValue('{"threat":"low"}')).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    expect(screen.getByLabelText("description value").tagName).toBe("TEXTAREA");
    fireEvent.click(screen.getByRole("button", { name: "Discard description edit" }));
    expect(screen.queryByLabelText("description value")).toBeNull();
  });

  it("can re-accept an initially rejected field", () => {
    const { decisions } = renderWithCapture([field({ decision: "REJECTED" })]);

    fireEvent.click(screen.getByRole("button", { name: "Accept summary" }));

    expect(decisions).toEqual([{ field: "summary", decision: "ACCEPTED" }]);
  });

  it("can return an accepted field to pending", () => {
    const { decisions } = renderWithCapture([field({ decision: "ACCEPTED" })]);

    fireEvent.click(screen.getByRole("button", { name: "Accept summary" }));

    expect(decisions).toEqual([{ field: "summary", decision: "PENDING" }]);
  });

  it("renders a blocked field display-only with no controls", () => {
    renderWithCapture([
      field({ field: "crawler.level", toText: "7", draft: "7", blocked: true }),
    ]);

    expect(screen.getByText("BLOCKED BY LOCK — UNLOCK TARGET TO APPLY")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Accept crawler.level" }),
    ).toBeNull();
  });

  it("hides per-field controls when the whole op is rejected", () => {
    renderWithCapture([field({ field: "summary" })], true);

    expect(screen.queryByRole("button", { name: "Accept summary" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save field edits" })).toBeNull();
  });

  it("renders completed operation diffs as read-only history", () => {
    render(
      <OperationDiffEditor
        decisionAction={() => {}}
        editAction={() => {}}
        fields={[field({ field: "summary" })]}
        opRejected={false}
        readOnly
      />,
    );

    expect(screen.getByText("New")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Accept summary" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save field edits" })).toBeNull();
  });

  it("renders an already-rejected field as selected", () => {
    renderWithCapture([field({ decision: "REJECTED" })]);

    expect(
      screen.getByRole("button", { name: "Reject summary" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("edits an entity reference with the entity picker", () => {
    const { edits } = renderWithCapture(
      [
        field({
          field: "sourceId",
          toText: "Carl",
          draft: "entity-carl",
          structured: {
            kind: "entity",
            value: { id: "entity-carl", name: "Carl", type: "CRAWLER" },
          },
        }),
      ],
      false,
      [
        { id: "entity-carl", name: "Carl", type: "CRAWLER" },
        { id: "entity-donut", name: "Princess Donut", type: "CRAWLER" },
      ],
    );

    expect(screen.getByText("Carl")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Edit sourceId" }));
    fireEvent.click(screen.getByTitle("Choose a different entity"));
    fireEvent.click(screen.getByRole("button", { name: /Princess Donut/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save sourceId" }));

    expect(edits.at(-1)?.data.get("value")).toBe("entity-donut");
  });

  it("edits in-game time as a basis, floor, offset, and label override", () => {
    const { edits } = renderWithCapture([
      field({
        field: "inGameTime",
        kind: "json",
        toText: "Air supply throttled",
        draft: JSON.stringify({
          basis: "FLOOR_START",
          floor: 9,
          label: "Air supply throttled",
        }),
        structured: {
          kind: "inGameTime",
          basis: "FLOOR_START",
          floor: 9,
          offset: null,
          unit: null,
          anchorEventId: null,
          label: "Air supply throttled",
        },
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Edit inGameTime" }));
    fireEvent.change(screen.getByLabelText("In-game floor"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Time offset"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("In-game time label"), {
      target: { value: "After the collapse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save inGameTime" }));

    expect(edits.at(-1)?.data.get("value")).toBe(
      JSON.stringify({
        basis: "FLOOR_START",
        floor: 10,
        offset: 3,
        unit: "DAY",
        label: "After the collapse",
      }),
    );
  });

  it("edits participants as entity and role rows", () => {
    const { edits } = renderWithCapture([
      field({
        field: "participants",
        kind: "json",
        toText: "Carl · Affected",
        draft: JSON.stringify([{ entityId: "entity-carl", role: "AFFECTED" }]),
        structured: {
          kind: "participants",
          value: [
            {
              entity: { id: "entity-carl", name: "Carl", type: "CRAWLER" },
              role: "AFFECTED",
            },
          ],
        },
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Edit participants" }));
    fireEvent.change(screen.getByLabelText("Participant role"), {
      target: { value: "ACTOR" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save participants" }));

    expect(edits.at(-1)?.data.get("value")).toBe(
      JSON.stringify([{ entityId: "entity-carl", role: "ACTOR" }]),
    );
  });

  it("adds, selects, and removes participant rows", () => {
    const { edits } = renderWithCapture(
      [
        field({
          field: "participants",
          kind: "json",
          toText: "No participants",
          draft: "[]",
          structured: { kind: "participants", value: [] },
        }),
      ],
      false,
      [
        { id: "entity-carl", name: "Carl", type: "CRAWLER" },
        { id: "entity-donut", name: "Princess Donut", type: "CRAWLER" },
      ],
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit participants" }));
    fireEvent.click(screen.getByRole("button", { name: "Add participant" }));
    expect(screen.getAllByRole("button", { name: "Remove participant" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: /Carl/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove participant" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Save participants" }));

    expect(edits.at(-1)?.data.get("value")).toBe(
      JSON.stringify([{ entityId: "entity-carl", role: "ACTOR" }]),
    );
  });

  it("does not offer FLOOR entities as event participants (ADR 0008 §3)", () => {
    renderWithCapture(
      [
        field({
          field: "participants",
          kind: "json",
          toText: "No participants",
          draft: "[]",
          structured: { kind: "participants", value: [] },
        }),
      ],
      false,
      [
        { id: "entity-carl", name: "Carl", type: "CRAWLER" },
        { id: "floor-9", name: "Gloomdeep", type: "FLOOR" },
      ],
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit participants" }));
    fireEvent.change(screen.getByPlaceholderText("Search entity…"), {
      target: { value: "Gloomdeep" },
    });
    expect(screen.queryByRole("button", { name: /Gloomdeep/ })).toBeNull();
    expect(screen.getByText("No matching entities.")).toBeDefined();
  });
});
