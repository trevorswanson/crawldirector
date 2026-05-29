// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Kicker } from "@/components/ui/kicker";
import { HudTag } from "@/components/ui/hud-tag";
import { TypeDot } from "@/components/ui/type-dot";
import { SourceBadge } from "@/components/ui/source-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { LockChip } from "@/components/ui/lock-chip";
import { Panel, PanelHeader } from "@/components/ui/panel";

afterEach(cleanup);

describe("Kicker", () => {
  it("renders children and applies dim/nolead modifiers", () => {
    const { container } = render(
      <Kicker dim noLead>
        Section
      </Kicker>,
    );
    const el = screen.getByText("Section");
    expect(el.className).toContain("kicker");
    expect(el.className).toContain("dim");
    expect(el.className).toContain("nolead");
    expect(container).toBeDefined();
  });

  it("omits modifiers by default", () => {
    render(<Kicker>Plain</Kicker>);
    const el = screen.getByText("Plain");
    expect(el.className).not.toContain("dim");
    expect(el.className).not.toContain("nolead");
  });
});

describe("HudTag", () => {
  it("renders a hud-tag chip", () => {
    render(<HudTag className="x">Tag</HudTag>);
    const el = screen.getByText("Tag");
    expect(el.className).toContain("hud-tag");
    expect(el.className).toContain("x");
  });
});

describe("TypeDot", () => {
  it("colors the dot by entity type", () => {
    const { container } = render(<TypeDot type="CRAWLER" />);
    const dot = container.querySelector("span");
    expect(dot?.style.background).toBe("var(--accent)");
  });
});

describe("SourceBadge", () => {
  it("renders the short code and supports the small size", () => {
    render(<SourceBadge source="AI" small />);
    expect(screen.getByText("AI")).toBeDefined();
  });
});

describe("StatusPill", () => {
  it("renders the status label", () => {
    render(<StatusPill status="CANON" />);
    expect(screen.getByText("Canon")).toBeDefined();
  });
});

describe("LockChip", () => {
  it("reflects locked and unlocked states", () => {
    const { rerender } = render(<LockChip locked />);
    expect(screen.getByText("Locked")).toBeDefined();
    rerender(<LockChip locked={false} />);
    expect(screen.getByText("Unlocked")).toBeDefined();
  });
});

describe("Panel", () => {
  it("renders a panel surface with header", () => {
    render(
      <Panel className="p-x">
        <PanelHeader kicker="Kick" title="Heading" sub="Subtitle" right={<button>Act</button>} />
      </Panel>,
    );
    expect(screen.getByText("Kick")).toBeDefined();
    expect(screen.getByText("Heading")).toBeDefined();
    expect(screen.getByText("Subtitle")).toBeDefined();
    expect(screen.getByRole("button", { name: "Act" })).toBeDefined();
  });

  it("renders a header without optional slots", () => {
    render(<PanelHeader title="Bare" />);
    expect(screen.getByText("Bare")).toBeDefined();
  });
});
