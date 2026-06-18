// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SettingsNav } from "@/components/settings/settings-nav";

afterEach(() => cleanup());

describe("SettingsNav", () => {
  it("renders with the 'ai' section active when activeId matches", () => {
    render(<SettingsNav activeId="ai" />);

    // AI section is rendered as active.
    const aiSpan = screen.getByText("AI Provider");
    expect(aiSpan.className).toContain("font-semibold");
    expect(aiSpan.closest("[aria-current='page']")).toBeTruthy();

    // General & Crawlers are planned sections.
    expect(screen.getAllByText("Planned")).toHaveLength(2);
  });

  it("renders with the 'ai' section inactive when activeId does not match", () => {
    render(<SettingsNav activeId="general" />);

    // Since 'general' is a planned section, it's rendered as planned.
    // The 'ai' section should now be inactive.
    const aiSpan = screen.getByText("AI Provider");
    expect(aiSpan.className).toContain("font-medium");
    expect(aiSpan.closest("[aria-current='page']")).toBeNull();
  });
});
