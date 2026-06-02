// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EventEffectsSection } from "@/components/entities/event-effects-section";
import { describeEffect } from "@/lib/event-effects";
import type { EventEffectView } from "@/server/services/events";

afterEach(cleanup);

const baseEffect: EventEffectView = {
  id: "fx1",
  kind: "ADJUST_STAT",
  targetId: "crawler1",
  stat: "gold",
  delta: 50,
  valueNumber: null,
  value: null,
  note: "Loot",
  applied: false,
};

describe("describeEffect", () => {
  it("describes adjust, set, and alive effects", () => {
    expect(describeEffect(baseEffect)).toBe("Gold +50");
    expect(
      describeEffect({
        ...baseEffect,
        kind: "SET_STAT",
        stat: "currentFloor",
        delta: null,
        valueNumber: 1,
      }),
    ).toBe("Floor = 1");
    expect(
      describeEffect({
        ...baseEffect,
        kind: "SET_ALIVE",
        stat: null,
        delta: null,
        value: false,
      }),
    ).toBe("Marked dead");
  });
});

describe("EventEffectsSection", () => {
  it("renders effects with applied and unapplied status labels", () => {
    render(
      <EventEffectsSection
        effects={[baseEffect, { ...baseEffect, id: "fx2", applied: true }]}
        resolveName={(id) => (id === "crawler1" ? "Carl" : "Unknown")}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Carl")).toHaveLength(2);
    expect(screen.getAllByText("Gold +50")).toHaveLength(2);
    expect(screen.getByText("unapplied")).toBeDefined();
    expect(screen.getByText("applied")).toBeDefined();
    expect(screen.getByRole("button", { name: /Apply unapplied/ })).toBeDefined();
  });

  it("does not render an apply button when all effects are applied", () => {
    render(
      <EventEffectsSection
        effects={[{ ...baseEffect, applied: true }]}
        resolveName={() => "Carl"}
        onApply={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Apply unapplied/ })).toBeNull();
  });

  it("surfaces apply errors", async () => {
    const onApply = vi.fn().mockResolvedValue({ error: "Effect target is locked." });
    render(
      <EventEffectsSection
        effects={[baseEffect]}
        resolveName={() => "Carl"}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Apply unapplied/ }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("alert").textContent).toContain("locked");
    });
  });
});
