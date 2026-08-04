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
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { PlayerNav } from "@/components/console/player-nav";

afterEach(cleanup);

describe("PlayerNav", () => {
  it("links the built Known World item to the active campaign", () => {
    usePathname.mockReturnValue("/play/campaigns/c1");
    render(<PlayerNav />);
    const link = screen
      .getByText("Known World")
      .closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/play/campaigns/c1");
  });

  it("links the built Crawler Sheet item to the active campaign", () => {
    usePathname.mockReturnValue("/play/campaigns/c1");
    render(<PlayerNav />);
    const link = screen
      .getByText("Crawler Sheet")
      .closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/play/campaigns/c1/sheet");
  });

  it("links the built System Feed item to the active campaign", () => {
    usePathname.mockReturnValue("/play/campaigns/c1");
    render(<PlayerNav />);
    const link = screen
      .getByText("System Feed")
      .closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/play/campaigns/c1/system");
  });

  it("links the built Ask the System item to the active campaign", () => {
    usePathname.mockReturnValue("/play/campaigns/c1");
    render(<PlayerNav />);
    const link = screen
      .getByText("Ask the System")
      .closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/play/campaigns/c1/ask");
  });

  it("links the built Suggestions item to the active campaign", () => {
    usePathname.mockReturnValue("/play/campaigns/c1");
    render(<PlayerNav />);
    const link = screen
      .getByText("Suggestions")
      .closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/play/campaigns/c1/suggestions");
  });

  it("has no remaining Planned crawler-interface surfaces (M7 fully built)", () => {
    usePathname.mockReturnValue("/play/campaigns/c1");
    render(<PlayerNav />);
    expect(screen.queryByText("Planned")).toBeNull();
  });

  it("highlights System Feed as active on the system route", () => {
    usePathname.mockReturnValue("/play/campaigns/c1/system");
    render(<PlayerNav />);
    const feed = screen
      .getByText("System Feed")
      .closest("a") as HTMLAnchorElement;
    expect(feed.className).toContain("border-[var(--accent)]");
  });

  it("highlights Ask the System as active on the ask route", () => {
    usePathname.mockReturnValue("/play/campaigns/c1/ask");
    render(<PlayerNav />);
    const ask = screen
      .getByText("Ask the System")
      .closest("a") as HTMLAnchorElement;
    expect(ask.className).toContain("border-[var(--accent)]");
  });

  it("highlights Suggestions as active on the suggestions route", () => {
    usePathname.mockReturnValue("/play/campaigns/c1/suggestions");
    render(<PlayerNav />);
    const suggestions = screen
      .getByText("Suggestions")
      .closest("a") as HTMLAnchorElement;
    expect(suggestions.className).toContain("border-[var(--accent)]");
  });

  it("highlights Known World as active on an entity detail route", () => {
    usePathname.mockReturnValue("/play/campaigns/c1/entities/e1");
    render(<PlayerNav />);
    const link = screen
      .getByText("Known World")
      .closest("a") as HTMLAnchorElement;
    expect(link.className).toContain("border-[var(--accent)]");
  });

  it("highlights Crawler Sheet as active on the sheet route", () => {
    usePathname.mockReturnValue("/play/campaigns/c1/sheet");
    render(<PlayerNav />);
    const sheet = screen
      .getByText("Crawler Sheet")
      .closest("a") as HTMLAnchorElement;
    expect(sheet.className).toContain("border-[var(--accent)]");
    // Known World is not also highlighted on the sheet route.
    const known = screen
      .getByText("Known World")
      .closest("a") as HTMLAnchorElement;
    expect(known.className).not.toContain("border-[var(--accent)]");
  });
});
