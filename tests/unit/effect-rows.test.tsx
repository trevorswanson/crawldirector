// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  EffectRows,
  type EffectRowValue,
} from "@/components/entities/effect-rows";

const crawlers = [
  { id: "e1", name: "Carl", type: "CRAWLER" },
  { id: "e2", name: "Donut", type: "CRAWLER" },
];

const personas = [{ id: "sys1", name: "The System", type: "SYSTEM_AI" }];

const achievements = [{ id: "ach1", name: "Goblin Slayer", type: "ACHIEVEMENT" }];

afterEach(cleanup);

function field(container: HTMLElement, name: string) {
  return container.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;
}

describe("EffectRows", () => {
  it("starts with no rows and a hidden effectCount of 0", () => {
    const { container } = render(
      <form>
        <EffectRows candidates={crawlers} />
      </form>,
    );
    expect(field(container, "effectCount").value).toBe("0");
    expect(screen.getByRole("button", { name: /Add effect/ })).toBeDefined();
  });

  it("adds an ADJUST_STAT row and captures target + delta", () => {
    const { container } = render(
      <form>
        <EffectRows candidates={crawlers} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add effect/ }));
    expect(field(container, "effectCount").value).toBe("1");
    // ADJUST_STAT is the default kind: stat + delta inputs are shown.
    expect(screen.getByLabelText("Stat to adjust")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Delta"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /Carl/ }));

    expect(field(container, "effectKind_0").value).toBe("ADJUST_STAT");
    expect(field(container, "effectTarget_0").value).toBe("e1");
    expect(field(container, "effectDelta_0").value).toBe("500");
  });

  it("switches to SET_ALIVE, swapping stat/delta for an alive select", () => {
    const { container } = render(
      <form>
        <EffectRows candidates={crawlers} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add effect/ }));
    fireEvent.change(screen.getByLabelText("Effect kind"), {
      target: { value: "SET_ALIVE" },
    });
    expect(screen.queryByLabelText("Stat to adjust")).toBeNull();
    expect(screen.getByLabelText("Alive or dead")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Alive or dead"), {
      target: { value: "alive" },
    });
    fireEvent.change(screen.getByLabelText("Effect note"), {
      target: { value: "Revived by potion" },
    });
    expect(field(container, "effectValue_0").value).toBe("alive");
    expect(field(container, "effectNote_0").value).toBe("Revived by potion");
  });

  it("prefills an existing unapplied effect", () => {
    const initial: EffectRowValue[] = [
      {
        id: "fx1",
        kind: "ADJUST_STAT",
        target: crawlers[0],
        stat: "gold",
        delta: "500",
        valueNumber: "",
        alive: "dead",
        dialShifts: {},
        achievement: null,
        note: "Loot",
      },
    ];
    const { container } = render(
      <form>
        <EffectRows candidates={crawlers} initial={initial} />
      </form>,
    );
    expect(field(container, "effectId_0").value).toBe("fx1");
    expect(field(container, "effectTarget_0").value).toBe("e1");
    expect(field(container, "effectDelta_0").value).toBe("500");
    expect(field(container, "effectNote_0").value).toBe("Loot");
    expect(screen.getByText("Carl")).toBeDefined();
  });

  it("switches to SET_STAT, capturing an absolute value", () => {
    const { container } = render(
      <form>
        <EffectRows candidates={crawlers} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add effect/ }));
    fireEvent.change(screen.getByLabelText("Effect kind"), {
      target: { value: "SET_STAT" },
    });
    fireEvent.change(screen.getByLabelText("Stat to adjust"), {
      target: { value: "currentFloor" },
    });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "1" } });

    expect(field(container, "effectKind_0").value).toBe("SET_STAT");
    expect(field(container, "effectStat_0").value).toBe("currentFloor");
    expect(field(container, "effectValueNumber_0").value).toBe("1");
    expect(field(container, "effectDelta_0")).toBeNull();
  });

  it("removes a row", () => {
    const initial: EffectRowValue[] = [
      {
        id: "fx1",
        kind: "SET_ALIVE",
        target: crawlers[0],
        stat: "gold",
        delta: "",
        valueNumber: "",
        alive: "dead",
        dialShifts: {},
        achievement: null,
        note: "",
      },
    ];
    const { container } = render(
      <form>
        <EffectRows candidates={crawlers} initial={initial} />
      </form>,
    );
    expect(field(container, "effectCount").value).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Remove effect row" }));
    expect(field(container, "effectCount").value).toBe("0");
  });

  it("explains the crawler-less case but still allows adding a (floor) effect", () => {
    render(
      <form>
        <EffectRows candidates={[]} />
      </form>,
    );
    // No crawlers to stat-target, but floor effects (COLLAPSE_FLOOR) need none,
    // so adding stays enabled.
    expect(screen.getByText(/only floor effects can be applied/)).toBeDefined();
    expect(
      (screen.getByRole("button", { name: /Add effect/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("shows dial inputs and the persona target pool for a PERSONA_SHIFT row", () => {
    const { container } = render(
      <form>
        <EffectRows candidates={crawlers} personaCandidates={personas} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add effect/ }));
    fireEvent.change(screen.getByLabelText("Effect kind"), {
      target: { value: "PERSONA_SHIFT" },
    });
    // Crawler stat/alive controls give way to per-dial delta inputs.
    expect(screen.queryByLabelText("Stat to adjust")).toBeNull();
    fireEvent.change(screen.getByLabelText("Resentment shift"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Compliance shift"), {
      target: { value: "-15" },
    });
    // The target typeahead lists the SYSTEM_AI candidate, not the crawlers.
    fireEvent.click(screen.getByRole("button", { name: /The System/ }));

    expect(field(container, "effectKind_0").value).toBe("PERSONA_SHIFT");
    expect(field(container, "effectTarget_0").value).toBe("sys1");
    expect(field(container, "effectDial_0_resentment").value).toBe("20");
    expect(field(container, "effectDial_0_compliance").value).toBe("-15");
  });

  it("prefills a PERSONA_SHIFT row's dial deltas and persona target", () => {
    const initial: EffectRowValue[] = [
      {
        id: "fx-shift",
        kind: "PERSONA_SHIFT",
        target: personas[0],
        stat: "gold",
        delta: "",
        valueNumber: "",
        alive: "dead",
        dialShifts: { resentment: "30" },
        achievement: null,
        note: "Court ruling",
      },
    ];
    const { container } = render(
      <form>
        <EffectRows candidates={crawlers} personaCandidates={personas} initial={initial} />
      </form>,
    );
    expect(field(container, "effectDial_0_resentment").value).toBe("30");
    expect(field(container, "effectNote_0").value).toBe("Court ruling");
    expect(screen.getByText("The System")).toBeDefined();
  });

  it("shows the achievement pool plus a crawler target for a GRANT_ACHIEVEMENT row", () => {
    const { container } = render(
      <form>
        <EffectRows candidates={crawlers} achievementCandidates={achievements} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add effect/ }));
    fireEvent.change(screen.getByLabelText("Effect kind"), {
      target: { value: "GRANT_ACHIEVEMENT" },
    });
    // No stat/alive/dial controls — just a crawler target and the achievement pool.
    expect(screen.queryByLabelText("Stat to adjust")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Carl/ }));
    fireEvent.click(screen.getByRole("button", { name: /Goblin Slayer/ }));

    expect(field(container, "effectKind_0").value).toBe("GRANT_ACHIEVEMENT");
    expect(field(container, "effectTarget_0").value).toBe("e1");
    expect(field(container, "effectAchievement_0").value).toBe("ach1");
  });

  it("prefills a GRANT_ACHIEVEMENT row's crawler target and achievement", () => {
    const initial: EffectRowValue[] = [
      {
        id: "fx-grant",
        kind: "GRANT_ACHIEVEMENT",
        target: crawlers[0],
        stat: "gold",
        delta: "",
        valueNumber: "",
        alive: "dead",
        dialShifts: {},
        achievement: achievements[0],
        note: "",
      },
    ];
    const { container } = render(
      <form>
        <EffectRows candidates={crawlers} achievementCandidates={achievements} initial={initial} />
      </form>,
    );
    expect(field(container, "effectTarget_0").value).toBe("e1");
    expect(field(container, "effectAchievement_0").value).toBe("ach1");
    expect(screen.getByText("Goblin Slayer")).toBeDefined();
  });

  it("hides the crawler target + stat inputs for a floor-collapse effect row", () => {
    render(
      <form>
        <EffectRows
          candidates={[{ id: "c1", name: "Carl", type: "CRAWLER" }]}
        />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add effect/ }));
    fireEvent.change(screen.getByLabelText("Effect kind"), {
      target: { value: "COLLAPSE_FLOOR" },
    });
    // The collapse row derives its subject from the event — no crawler target,
    // no stat selector.
    expect(screen.queryByLabelText("Stat to adjust")).toBeNull();
    expect(screen.getByText(/Acts on this event/)).toBeDefined();
  });
});
