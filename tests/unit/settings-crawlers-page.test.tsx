// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  listPlayerMemberships,
  listAssignableCrawlers,
  usePathname,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listPlayerMemberships: vi.fn(),
  listAssignableCrawlers: vi.fn(),
  usePathname: vi.fn(() => "/campaigns/c1/settings/crawlers"),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/crawlers", () => ({
  listPlayerMemberships,
  listAssignableCrawlers,
}));
vi.mock("next/navigation", () => ({ notFound, usePathname }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/settings/crawler-assignment-panel", () => ({
  CrawlerAssignmentPanel: ({
    campaignId,
    players,
    crawlers,
  }: {
    campaignId: string;
    players: unknown[];
    crawlers: unknown[];
  }) => (
    <div data-testid="crawler-assignment-panel">
      crawlers:{campaignId}:{players.length}:{crawlers.length}
    </div>
  ),
}));

import CrawlerSettingsPage from "@/app/(dm)/campaigns/[id]/settings/crawlers/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({ id: "c1", name: "World One", members: [{ role: "OWNER" }] });
  listPlayerMemberships.mockResolvedValue([{ membershipId: "m1" }]);
  listAssignableCrawlers.mockResolvedValue([
    { id: "cr1", name: "Carl", status: "CANON" },
    { id: "cr2", name: "Donut", status: "CANON" },
  ]);
});

afterEach(() => cleanup());

async function renderPage() {
  render(await CrawlerSettingsPage({ params: Promise.resolve({ id: "c1" }) }));
}

describe("CrawlerSettingsPage", () => {
  it("renders the assignment panel with the crawlers section active for a DM", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: /^Crawlers$/ })).toBeTruthy();
    expect(screen.getByTestId("crawler-assignment-panel").textContent).toBe(
      "crawlers:c1:1:2",
    );
    expect(listPlayerMemberships).toHaveBeenCalledWith("u1", "c1");
    expect(listAssignableCrawlers).toHaveBeenCalledWith("u1", "c1");
    // The crawlers nav link is marked active on this route (the heading also
    // reads "Crawlers", so target the nav link specifically).
    expect(
      screen.getByRole("link", { name: "Crawlers" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("404s when the campaign is not visible to the user", async () => {
    getCampaignForUser.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listPlayerMemberships).not.toHaveBeenCalled();
  });

  it("404s for a player member (settings is DM-only)", async () => {
    getCampaignForUser.mockResolvedValue({ id: "c1", name: "World One", members: [{ role: "PLAYER" }] });
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listPlayerMemberships).not.toHaveBeenCalled();
  });
});
