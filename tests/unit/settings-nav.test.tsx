// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SettingsNav } from "@/components/settings/settings-nav";

afterEach(() => cleanup());

describe("SettingsNav", () => {
  it("renders with the 'ai' section active when activeId matches", () => {
    render(<SettingsNav activeId="ai" campaignId="c1" />);

    // AI section is rendered as active, linking to the base settings route.
    const aiSpan = screen.getByText("AI Provider");
    expect(aiSpan.className).toContain("font-semibold");
    const aiLink = aiSpan.closest("a");
    expect(aiLink?.getAttribute("aria-current")).toBe("page");
    expect(aiLink?.getAttribute("href")).toBe("/campaigns/c1/settings");

    // Crawlers is now a built section linking to its query-param route.
    const crawlersLink = screen.getByText("Crawlers").closest("a");
    expect(crawlersLink?.getAttribute("href")).toBe(
      "/campaigns/c1/settings?section=crawlers",
    );

    // Only General remains planned.
    expect(screen.getAllByText("Planned")).toHaveLength(1);
  });

  it("marks the crawlers section active when activeId matches", () => {
    render(<SettingsNav activeId="crawlers" campaignId="c1" />);

    const crawlersSpan = screen.getByText("Crawlers");
    expect(crawlersSpan.className).toContain("font-semibold");
    expect(crawlersSpan.closest("[aria-current='page']")).toBeTruthy();

    // AI is now inactive.
    const aiSpan = screen.getByText("AI Provider");
    expect(aiSpan.className).toContain("font-medium");
    expect(aiSpan.closest("[aria-current='page']")).toBeNull();
  });
});
