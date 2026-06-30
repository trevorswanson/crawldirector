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

  it("marks unbuilt crawler-interface surfaces as Planned, not stub links", () => {
    usePathname.mockReturnValue("/play/campaigns/c1");
    render(<PlayerNav />);
    for (const label of [
      "Crawler Sheet",
      "System Feed",
      "Ask the System",
      "Suggestions",
    ]) {
      const row = screen.getByText(label).closest("[aria-disabled]");
      expect(row).not.toBeNull();
    }
    expect(screen.getAllByText("Planned").length).toBe(4);
  });

  it("highlights Known World as active on an entity detail route", () => {
    usePathname.mockReturnValue("/play/campaigns/c1/entities/e1");
    render(<PlayerNav />);
    const link = screen
      .getByText("Known World")
      .closest("a") as HTMLAnchorElement;
    expect(link.className).toContain("border-[var(--accent)]");
  });
});
