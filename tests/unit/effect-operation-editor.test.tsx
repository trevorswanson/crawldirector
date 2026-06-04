// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  EffectOperationEditor,
  type ReviewEffectSeed,
} from "@/components/review/effect-operation-editor";

const candidates = [
  { id: "crawler-1", name: "Carl", type: "CRAWLER" },
  { id: "crawler-2", name: "Princess Donut", type: "CRAWLER" },
];

const noop = () => {};

afterEach(cleanup);

describe("EffectOperationEditor", () => {
  it("shows a read-only summary by default and reveals the editor on Edit", () => {
    const effects: ReviewEffectSeed[] = [
      {
        id: "fx-1",
        kind: "ADJUST_STAT",
        targetEntityId: "crawler-1",
        stat: "gold",
        delta: 500,
        valueNumber: null,
        value: null,
        note: "Loot",
        before: 500,
        after: 1000,
      },
      {
        id: "fx-2",
        kind: "SET_ALIVE",
        targetEntityId: "crawler-2",
        stat: null,
        delta: null,
        valueNumber: null,
        value: false,
        note: null,
        before: true,
        after: false,
      },
    ];

    const { container } = render(
      <EffectOperationEditor
        action={noop}
        candidates={candidates}
        effects={effects}
        rejected={false}
      />,
    );

    // Read-first: described effects, no live editor yet.
    expect(screen.getByText("Gold 500 → 1,000")).toBeDefined();
    expect(screen.getByText("— Loot")).toBeDefined();
    expect(screen.getByText("Alive → Dead")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save effects" })).toBeNull();
    expect(container.querySelector('input[name="effectId_0"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit effect 1" }));

    // Editor revealed: seeded rows with resolved targets + stable ids.
    expect(screen.getByRole("button", { name: "Save effects" })).toBeDefined();
    expect(screen.getByDisplayValue("500")).toBeDefined();
    expect(screen.getByDisplayValue("Mark dead")).toBeDefined();
    expect(
      container.querySelector<HTMLInputElement>('input[name="effectId_0"]')?.value,
    ).toBe("fx-1");
    expect(
      container.querySelector<HTMLInputElement>('input[name="effectTarget_1"]')
        ?.value,
    ).toBe("crawler-2");
  });

  it("falls back to the raw id when the target is not a known crawler", () => {
    const effects: ReviewEffectSeed[] = [
      {
        id: "fx-1",
        kind: "SET_STAT",
        targetEntityId: "archived-crawler",
        stat: "hp",
        delta: null,
        valueNumber: 40,
        value: null,
        note: null,
        before: 120,
        after: 40,
      },
    ];

    const { container } = render(
      <EffectOperationEditor
        action={noop}
        candidates={candidates}
        effects={effects}
        rejected={false}
      />,
    );

    // Summary shows the raw id when unresolved.
    expect(screen.getByText("archived-crawler")).toBeDefined();
    expect(screen.getByText("HP 120 → 40")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Edit effect 1" }));

    // The editor still submits the original id rather than dropping the target.
    expect(
      container.querySelector<HTMLInputElement>('input[name="effectTarget_0"]')
        ?.value,
    ).toBe("archived-crawler");
    expect(screen.getByDisplayValue("40")).toBeDefined();
  });

  it("dims the summary and hides Edit when the operation is rejected", () => {
    const { container } = render(
      <EffectOperationEditor
        action={noop}
        candidates={candidates}
        effects={[]}
        rejected
      />,
    );

    expect(container.querySelector(".opacity-45")).not.toBeNull();
    expect(screen.getByText("No effects in this proposal.")).toBeDefined();
    // A rejected op offers no Edit affordance.
    expect(screen.queryByRole("button", { name: "Add effect" })).toBeNull();
  });

  it("opens an empty effect editor from Add effect and can cancel", () => {
    render(
      <EffectOperationEditor
        action={noop}
        candidates={[]}
        effects={[]}
        rejected={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add effect" }));
    expect(screen.getByRole("button", { name: "Save effects" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("No effects in this proposal.")).toBeDefined();
  });

  it("hides per-row Edit controls in read-only history", () => {
    render(
      <EffectOperationEditor
        action={noop}
        candidates={[]}
        effects={[
          {
            id: "fx-1",
            kind: "ADJUST_STAT",
            targetEntityId: "crawler-1",
            stat: "gold",
            delta: 50,
            valueNumber: null,
            value: null,
            note: null,
            before: 100,
            after: 150,
          },
        ]}
        rejected={false}
        readOnly
      />,
    );

    expect(screen.getByText("Gold 100 → 150")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Edit effect 1" })).toBeNull();
  });

  it("falls back to proposal descriptions when a live preview is unavailable", () => {
    render(
      <EffectOperationEditor
        action={noop}
        candidates={candidates}
        effects={[
          {
            id: "fx-1",
            kind: "ADJUST_STAT",
            targetEntityId: "crawler-1",
            stat: "gold",
            delta: -50,
            valueNumber: null,
            value: null,
            note: null,
          },
          {
            id: "fx-2",
            kind: "SET_STAT",
            targetEntityId: "crawler-1",
            stat: "hp",
            delta: null,
            valueNumber: 40,
            value: null,
            note: null,
          },
          {
            id: "fx-3",
            kind: "SET_ALIVE",
            targetEntityId: "crawler-1",
            stat: null,
            delta: null,
            valueNumber: null,
            value: true,
            note: null,
          },
        ]}
        rejected={false}
      />,
    );

    expect(screen.getByText("Gold -50")).toBeDefined();
    expect(screen.getByText("HP = 40")).toBeDefined();
    expect(screen.getByText("Revived (alive)")).toBeDefined();
  });

  it("labels an unset preview value", () => {
    render(
      <EffectOperationEditor
        action={noop}
        candidates={candidates}
        effects={[
          {
            id: "fx-1",
            kind: "SET_STAT",
            targetEntityId: "crawler-1",
            stat: "hp",
            delta: null,
            valueNumber: 40,
            value: null,
            note: null,
            before: null,
            after: 40,
          },
        ]}
        rejected={false}
      />,
    );

    expect(screen.getByText("HP Unset → 40")).toBeDefined();
  });
});
