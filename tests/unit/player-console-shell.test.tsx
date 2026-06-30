// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { usePathname, requireUser, listCampaignsForUser, cookiesGet } =
  vi.hoisted(() => ({
    usePathname: vi.fn(),
    requireUser: vi.fn(),
    listCampaignsForUser: vi.fn(),
    cookiesGet: vi.fn(),
  }));

vi.mock("next/navigation", () => ({ usePathname }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookiesGet })),
}));
vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ listCampaignsForUser }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/console/player-nav", () => ({
  PlayerNav: () => <nav data-testid="player-nav" />,
}));
vi.mock("@/components/console/user-menu", () => ({
  UserMenu: ({ initials }: { initials: string }) => <div>{initials}</div>,
}));

import { PlayerCampaignSwitcher } from "@/components/console/player-campaign-switcher";
import PlayerLayout from "@/app/(player)/layout";

afterEach(cleanup);

describe("PlayerCampaignSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathname.mockReturnValue("/play/campaigns/c1");
  });

  it("shows the active crawl name and links options to /play", () => {
    render(
      <PlayerCampaignSwitcher
        campaigns={[
          { id: "c1", name: "Crawl One" },
          { id: "c2", name: "Crawl Two" },
        ]}
      />,
    );
    // "Crawl One" is the active label and also a menu row.
    expect(screen.getAllByText("Crawl One").length).toBeGreaterThanOrEqual(1);
    const other = screen.getByText("Crawl Two").closest("a") as HTMLAnchorElement;
    expect(other.getAttribute("href")).toBe("/play/campaigns/c2");
  });

  it("falls back to a generic label and empty-state with no crawls", () => {
    usePathname.mockReturnValue("/play/campaigns/unknown");
    render(<PlayerCampaignSwitcher campaigns={[]} />);
    expect(screen.getByText("Crawls")).toBeDefined();
    // Open the menu to reveal the empty-state copy.
    fireEvent.click(screen.getByLabelText("Switch crawl"));
    expect(screen.getByText("No crawls yet.")).toBeDefined();
  });
});

describe("PlayerLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "u1", name: "Ann", email: "ann@x.io" });
    cookiesGet.mockReturnValue(undefined);
  });

  it("renders the player console shell with only player crawls in the switcher", async () => {
    listCampaignsForUser.mockResolvedValue([
      { id: "p1", name: "I play here", members: [{ role: "PLAYER" }] },
      { id: "d1", name: "I run this", members: [{ role: "OWNER" }] },
    ]);
    render(await PlayerLayout({ children: <main>body</main> }));

    expect(screen.getByTestId("player-nav")).toBeDefined();
    expect(screen.getByText("player view")).toBeDefined();
    expect(screen.getByText("AN")).toBeDefined();
    // Only the PLAYER campaign is offered; the DM one is excluded.
    expect(screen.getByText("I play here")).toBeDefined();
    expect(screen.queryByText("I run this")).toBeNull();
  });
});
