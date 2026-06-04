// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  OperationDiffEditor,
  type ReviewFieldInit,
} from "@/components/review/operation-diff-editor";

afterEach(cleanup);

function field(overrides: Partial<ReviewFieldInit>): ReviewFieldInit {
  return {
    field: "summary",
    fromText: "Old",
    toText: "New",
    kind: "string",
    blocked: false,
    stale: false,
    accepted: true,
    editing: false,
    draft: "New",
    ...overrides,
  };
}

// Render a form whose action captures the submitted FormData so we can assert
// the editedPatch the page action would receive.
function renderWithCapture(fields: ReviewFieldInit[], opRejected = false) {
  const submitted: FormData[] = [];
  const action = (formData: FormData) => {
    submitted.push(formData);
  };
  const view = render(
    <OperationDiffEditor action={action} fields={fields} opRejected={opRejected} />,
  );
  const form = view.container.querySelector("form") as HTMLFormElement;
  return { view, submitted, form };
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
    // Read-first: no visible value input until Edit is clicked.
    expect(view.container.querySelector('input[name="value:summary"]')?.getAttribute("type")).toBe(
      "hidden",
    );
    // Save is disabled until something changes.
    expect(
      (screen.getByRole("button", { name: "Save field edits" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("omits a rejected field from the submitted patch", () => {
    const { submitted, form } = renderWithCapture([
      field({ field: "summary" }),
      field({ field: "title", fromText: null, toText: "Hi", draft: "Hi" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Reject summary" }));
    // Save is enabled once a field is rejected.
    expect(
      (screen.getByRole("button", { name: "Save field edits" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    fireEvent.submit(form);

    const data = submitted.at(-1)!;
    // Rejected field carries no apply flag; accepted field does.
    expect(data.get("apply:summary")).toBeNull();
    expect(data.get("apply:title")).toBe("on");
    expect(data.get("value:title")).toBe("Hi");
  });

  it("reveals an input on Edit and submits the edited value", () => {
    const { submitted, form } = renderWithCapture([field({ field: "summary", draft: "New" })]);

    fireEvent.click(screen.getByRole("button", { name: "Edit summary" }));
    const input = screen.getByLabelText("summary value") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Edited summary" } });
    fireEvent.submit(form);

    const data = submitted.at(-1)!;
    expect(data.get("apply:summary")).toBe("on");
    expect(data.get("value:summary")).toBe("Edited summary");
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
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    expect(screen.queryByLabelText("description value")).toBeNull();
  });

  it("can re-accept an initially rejected field", () => {
    renderWithCapture([field({ accepted: false })]);

    fireEvent.click(screen.getByRole("button", { name: "Accept summary" }));

    expect(
      screen.getByRole("button", { name: "Accept summary" }).getAttribute("aria-pressed"),
    ).toBe("true");
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
        action={() => {}}
        fields={[field({ field: "summary" })]}
        opRejected={false}
        readOnly
      />,
    );

    expect(screen.getByText("New")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Accept summary" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save field edits" })).toBeNull();
  });

  it("does not mark an already-rejected initial field dirty", () => {
    renderWithCapture([field({ accepted: false })]);

    expect(
      (screen.getByRole("button", { name: "Save field edits" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
