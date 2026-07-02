// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}));

import { SettingsNav } from "@/components/settings/settings-nav";

afterEach(() => cleanup());

describe("SettingsNav", () => {
  it("marks AI active on the settings index and links the crawlers segment", () => {
    usePathname.mockReturnValue("/campaigns/c1/settings");
    render(<SettingsNav />);

    const aiSpan = screen.getByText("AI Provider");
    expect(aiSpan.className).toContain("font-semibold");
    const aiLink = aiSpan.closest("a");
    expect(aiLink?.getAttribute("aria-current")).toBe("page");
    expect(aiLink?.getAttribute("href")).toBe("/campaigns/c1/settings");

    const crawlersLink = screen.getByText("Crawlers").closest("a");
    expect(crawlersLink?.getAttribute("href")).toBe("/campaigns/c1/settings/crawlers");
    expect(crawlersLink?.getAttribute("aria-current")).toBeNull();

    // Only General remains planned.
    expect(screen.getAllByText("Planned")).toHaveLength(1);
  });

  it("marks the crawlers section active on its route", () => {
    usePathname.mockReturnValue("/campaigns/c1/settings/crawlers");
    render(<SettingsNav />);

    const crawlersSpan = screen.getByText("Crawlers");
    expect(crawlersSpan.className).toContain("font-semibold");
    expect(crawlersSpan.closest("[aria-current='page']")).toBeTruthy();

    // AI is now inactive (the index is not a prefix-match of the crawlers route).
    const aiSpan = screen.getByText("AI Provider");
    expect(aiSpan.className).toContain("font-medium");
    expect(aiSpan.closest("[aria-current='page']")).toBeNull();
  });
});
