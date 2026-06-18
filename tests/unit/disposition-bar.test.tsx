// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DispositionBar, dispositionColor } from "@/components/ui/disposition-bar";

afterEach(() => cleanup());

describe("dispositionColor", () => {
  it("returns ok color for warm allies (> 20)", () => {
    expect(dispositionColor(50)).toBe("var(--ok)");
  });

  it("returns hot color for hot rivals (< -20)", () => {
    expect(dispositionColor(-50)).toBe("var(--hot)");
  });

  it("returns ink-faint color for neutral (-20 to 20)", () => {
    expect(dispositionColor(10)).toBe("var(--ink-faint)");
    expect(dispositionColor(-10)).toBe("var(--ink-faint)");
    expect(dispositionColor(null)).toBe("var(--ink-faint)");
  });
});

describe("DispositionBar", () => {
  it("renders a positive disposition with a sign", () => {
    render(<DispositionBar disposition={30} />);
    expect(screen.getByText("disposition +30")).toBeDefined();
  });

  it("renders a negative disposition with a sign", () => {
    render(<DispositionBar disposition={-30} />);
    expect(screen.getByText("disposition -30")).toBeDefined();
  });

  it("renders zero disposition without + sign", () => {
    render(<DispositionBar disposition={0} />);
    expect(screen.getByText("disposition 0")).toBeDefined();
  });
});
