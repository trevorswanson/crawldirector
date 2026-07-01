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

  it("marks unbuilt crawler-interface surfaces as Planned, not stub links", () => {
    usePathname.mockReturnValue("/play/campaigns/c1");
    render(<PlayerNav />);
    for (const label of ["System Feed", "Ask the System", "Suggestions"]) {
      const row = screen.getByText(label).closest("[aria-disabled]");
      expect(row).not.toBeNull();
    }
    expect(screen.getAllByText("Planned").length).toBe(3);
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
