// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
  it("seeds rows from effects and resolves target names", () => {
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

    expect(screen.getByRole("button", { name: "Save effects" })).toBeDefined();
    expect(screen.getByText("Carl")).toBeDefined();
    expect(screen.getByText("Princess Donut")).toBeDefined();
    expect(screen.getByDisplayValue("500")).toBeDefined();
    // SET_ALIVE row exposes the alive/dead select, defaulted to "dead".
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

    // The unresolved target still submits the original id and shows it as a label.
    expect(screen.getByText("archived-crawler")).toBeDefined();
    expect(
      container.querySelector<HTMLInputElement>('input[name="effectTarget_0"]')
        ?.value,
    ).toBe("archived-crawler");
    expect(screen.getByDisplayValue("40")).toBeDefined();
  });

  it("dims the editor when the operation is rejected", () => {
    const { container } = render(
      <EffectOperationEditor
        action={noop}
        candidates={candidates}
        effects={[]}
        rejected
      />,
    );

    expect(container.querySelector("form")?.className).toContain("opacity-45");
    // No seeded rows, but the editor still offers to add one.
    expect(screen.getByRole("button", { name: "Add effect" })).toBeDefined();
  });
});
