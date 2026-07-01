// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { setPlayerCrawlerAction, mockUseActionState } = vi.hoisted(() => ({
  setPlayerCrawlerAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/campaigns/[id]/settings/actions", () => ({
  setPlayerCrawlerAction,
}));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

import {
  CrawlerAssignmentPanel,
  type AssignableCrawler,
  type PlayerMembershipView,
} from "@/components/settings/crawler-assignment-panel";

const crawlers: AssignableCrawler[] = [
  { id: "cr1", name: "Carl", status: "CANON" },
  { id: "cr2", name: "Donut", status: "PENDING" },
];

const players: PlayerMembershipView[] = [
  {
    membershipId: "m1",
    userName: "Alice",
    userEmail: "alice@test",
    crawler: { id: "cr1", name: "Carl" },
  },
  { membershipId: "m2", userName: null, userEmail: "bob@test", crawler: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn()]);
});

afterEach(cleanup);

describe("CrawlerAssignmentPanel", () => {
  it("renders a row per player with the linked crawler pre-selected", () => {
    render(
      <CrawlerAssignmentPanel
        campaignId="c1"
        players={players}
        crawlers={crawlers}
      />,
    );
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("bob@test")).toBeTruthy();

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects).toHaveLength(2);
    // Alice's crawler is pre-selected; Bob's is the empty option.
    expect(selects[0].value).toBe("cr1");
    expect(selects[1].value).toBe("");
    // The non-CANON crawler is annotated in its option label.
    expect(screen.getAllByText(/Donut \(pending\)/).length).toBeGreaterThan(0);
  });

  it("shows the no-players empty state and notes M9 invites", () => {
    render(
      <CrawlerAssignmentPanel campaignId="c1" players={[]} crawlers={crawlers} />,
    );
    expect(screen.getByText(/No players have joined/i)).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows the no-crawlers empty state", () => {
    render(
      <CrawlerAssignmentPanel campaignId="c1" players={players} crawlers={[]} />,
    );
    expect(screen.getByText(/No crawlers exist yet/i)).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("surfaces an action error message", () => {
    mockUseActionState.mockReturnValue([{ error: "Nope." }, vi.fn()]);
    render(
      <CrawlerAssignmentPanel
        campaignId="c1"
        players={[players[0]]}
        crawlers={crawlers}
      />,
    );
    expect(screen.getByText("Nope.")).toBeTruthy();
  });

  it("surfaces an action success message", () => {
    mockUseActionState.mockReturnValue([{ success: "Crawler linked." }, vi.fn()]);
    render(
      <CrawlerAssignmentPanel
        campaignId="c1"
        players={[players[0]]}
        crawlers={crawlers}
      />,
    );
    expect(screen.getByText("Crawler linked.")).toBeTruthy();
  });
});
