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

  it("disables adding and explains when there are no crawler candidates", () => {
    render(
      <form>
        <EffectRows candidates={[]} />
      </form>,
    );
    expect(screen.getByText(/No crawlers in this campaign/)).toBeDefined();
    expect(
      (screen.getByRole("button", { name: /Add effect/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
