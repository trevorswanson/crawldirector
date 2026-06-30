// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, className, title }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    title?: string;
  }) => (
    <a href={href} className={className} title={title}>
      {children}
    </a>
  ),
}));

import { EventEffectsSection } from "@/components/entities/event-effects-section";
import { describeDialShifts, describeEffect } from "@/lib/event-effects";
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
  dialShifts: null,
  achievementId: null,
  note: "Loot",
  applied: false,
  appliedChangeSetId: null,
  pendingChangeSetId: null,
  pendingOperationId: null,
  reviewStatus: null,
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

  it("describes a persona shift and floor collapse", () => {
    expect(
      describeEffect({
        ...baseEffect,
        kind: "PERSONA_SHIFT",
        stat: null,
        delta: null,
        dialShifts: { resentment: 20, compliance: -15 },
        achievementId: null,
      }),
    ).toBe("Persona shift: Compliance −15, Resentment +20");
    expect(describeEffect({ ...baseEffect, kind: "COLLAPSE_FLOOR", targetId: null, stat: null }))
      .toBe("Floor collapses → next floor opens");
  });

  it("names the granted achievement when a resolver is supplied, degrading otherwise", () => {
    const grant: EventEffectView = {
      ...baseEffect,
      kind: "GRANT_ACHIEVEMENT",
      stat: null,
      delta: null,
      note: null,
      achievementId: "ach1",
    };
    expect(describeEffect(grant, (id) => (id === "ach1" ? "Goblin Slayer" : id))).toBe(
      "Earns achievement: Goblin Slayer",
    );
    expect(describeEffect(grant)).toBe("Earns achievement");
    expect(describeEffect({ ...grant, achievementId: null })).toBe("Earns achievement");
  });

  it("describeDialShifts falls back to 'no change' with no meaningful deltas", () => {
    expect(describeDialShifts(null)).toBe("no change");
    expect(describeDialShifts({ resentment: 0 })).toBe("no change");
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
    expect(screen.getByRole("button", { name: /Send to review/ })).toBeDefined();
  });

  it("does not render an apply button when all effects are applied", () => {
    render(
      <EventEffectsSection
        effects={[{ ...baseEffect, applied: true }]}
        resolveName={() => "Carl"}
        onApply={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Send to review/ })).toBeNull();
  });

  it("renders pending review state without another apply button", () => {
    render(
      <EventEffectsSection
        campaignId="c1"
        effects={[
          {
            ...baseEffect,
            pendingChangeSetId: "cs1",
            pendingOperationId: "op1",
            reviewStatus: "PENDING",
          },
        ]}
        resolveName={() => "Carl"}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByText("pending review")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Send to review/ })).toBeNull();
  });

  it("links pending review state to the selected Review Queue proposal", () => {
    render(
      <EventEffectsSection
        campaignId="c1"
        effects={[
          {
            ...baseEffect,
            pendingChangeSetId: "cs1",
            pendingOperationId: "op1",
            reviewStatus: "PENDING",
          },
        ]}
        resolveName={() => "Carl"}
        onApply={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("link", { name: "pending review" }).getAttribute("href"),
    ).toBe("/campaigns/c1/review?selected=cs1");
  });

  it("renders rejected effects as reviewed and not actionable", () => {
    render(
      <EventEffectsSection
        effects={[{ ...baseEffect, reviewStatus: "REJECTED" }]}
        resolveName={() => "Carl"}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByText("rejected")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Send to review/ })).toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: /Send to review/ }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("alert").textContent).toContain("locked");
    });
  });
});
