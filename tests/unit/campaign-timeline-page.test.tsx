// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  listCampaignTimeline,
  listCampaignFloors,
  listEntitiesForUser,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listCampaignTimeline: vi.fn(),
  listCampaignFloors: vi.fn(),
  listEntitiesForUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/events", () => ({ listCampaignTimeline, listCampaignFloors }));
vi.mock("@/server/services/entities", () => ({ listEntitiesForUser }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/timeline/campaign-timeline", () => ({
  CampaignTimeline: ({
    events,
    truncated,
    loadOlderHref,
    totalEvents,
  }: {
    events: Array<{
      title: string;
      participants: Array<{ name: string }>;
    }>;
    truncated?: boolean;
    loadOlderHref?: string;
    totalEvents?: number;
  }) => (
    <main>
      <h1>Campaign Timeline</h1>
      {events.length === 0 ? (
        <p>No events logged yet.</p>
      ) : (
        events.map((event) => (
          <section key={event.title}>
            <h2>{event.title}</h2>
            {event.participants.map((participant) => (
              <span key={participant.name}>{participant.name}</span>
            ))}
          </section>
        ))
      )}
      {truncated && loadOlderHref && (
        <a href={loadOlderHref} data-testid="show-older">
          Show older ({totalEvents} total)
        </a>
      )}
    </main>
  ),
}));

import CampaignTimelinePage from "@/app/(dm)/campaigns/[id]/timeline/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "World One",
    members: [{ role: "OWNER" }],
  });
  listCampaignFloors.mockResolvedValue({
    ladder: [],
    byNumber: {},
    currentFloorNumber: null,
    currentFloorId: null,
    liveEventId: null,
    floorEntities: [],
  });
  listEntitiesForUser.mockResolvedValue({
    entities: [
      { id: "e1", name: "Carl", type: "CRAWLER" },
      { id: "e2", name: "Donut", type: "CRAWLER" },
    ],
  });
});

afterEach(() => {
  cleanup();
});

describe("CampaignTimelinePage", () => {
  it("renders campaign events with participants", async () => {
    listCampaignTimeline.mockResolvedValue({
      events: [
        {
          id: "ev1",
          title: "Boss fight",
          summary: "Carl and Donut survive.",
          time: { floor: 9, label: "Day 3" },
          orderKey: 9,
          rank: "a0",
          secret: false,
          locked: false,
          source: "DM",
          participants: [
            { id: "e1", name: "Carl", type: "CRAWLER", role: "ACTOR" },
            { id: "e2", name: "Donut", type: "CRAWLER", role: "TARGET" },
          ],
          causedBy: [],
          causes: [],
        },
      ],
      totalEvents: 1,
      truncated: false,
    });

    render(await CampaignTimelinePage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByRole("heading", { name: "Campaign Timeline" })).toBeDefined();
    expect(screen.getByText("Boss fight")).toBeDefined();
    expect(screen.getByText("Carl")).toBeDefined();
    expect(screen.getByText("Donut")).toBeDefined();
  });

  it("shows an honest empty state when no events exist", async () => {
    listCampaignTimeline.mockResolvedValue({ events: [], totalEvents: 0, truncated: false });

    render(await CampaignTimelinePage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText(/No events logged yet/)).toBeDefined();
  });

  it("404s for a non-member / missing campaign", async () => {
    getCampaignForUser.mockResolvedValue(null);

    await expect(
      CampaignTimelinePage({ params: Promise.resolve({ id: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("passes truncated=true and a loadOlderHref when the timeline is windowed", async () => {
    listCampaignTimeline.mockResolvedValue({
      events: [
        {
          id: "ev1",
          title: "Recent event",
          summary: "",
          time: { floor: 1, label: null },
          orderKey: 1,
          rank: "a0",
          secret: false,
          locked: false,
          source: "DM",
          participants: [],
          causedBy: [],
          causes: [],
        },
      ],
      totalEvents: 300,
      truncated: true,
    });

    render(
      await CampaignTimelinePage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ window: "1" }),
      }),
    );

    const link = screen.getByTestId("show-older");
    expect(link).toBeDefined();
    // href should increment the window to 2 (no event deep-link here).
    expect((link as HTMLAnchorElement).href).toContain("window=2");
    expect(screen.getByText(/300 total/)).toBeDefined();
  });

  it("does not render the show-older link when not truncated", async () => {
    listCampaignTimeline.mockResolvedValue({ events: [], totalEvents: 0, truncated: false });

    render(await CampaignTimelinePage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.queryByTestId("show-older")).toBeNull();
  });

  it("re-queries the full timeline when the deep-linked event is outside the window", async () => {
    listCampaignTimeline
      .mockResolvedValueOnce({
        events: [
          {
            id: "ev1",
            title: "Recent event",
            summary: "",
            time: { floor: 1, label: null },
            orderKey: 1,
            rank: "a0",
            secret: false,
            locked: false,
            source: "DM",
            participants: [],
            causedBy: [],
            causes: [],
          },
        ],
        totalEvents: 300,
        truncated: true,
      })
      .mockResolvedValueOnce({
        events: [
          {
            id: "ev1",
            title: "Recent event",
            summary: "",
            time: { floor: 1, label: null },
            orderKey: 1,
            rank: "a0",
            secret: false,
            locked: false,
            source: "DM",
            participants: [],
            causedBy: [],
            causes: [],
          },
          {
            id: "ev-old",
            title: "Ancient event",
            summary: "",
            time: { floor: 1, label: null },
            orderKey: 0,
            rank: "Zz",
            secret: false,
            locked: false,
            source: "DM",
            participants: [],
            causedBy: [],
            causes: [],
          },
        ],
        totalEvents: 300,
        truncated: false,
      });

    render(
      await CampaignTimelinePage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ event: "ev-old" }),
      }),
    );

    expect(listCampaignTimeline).toHaveBeenCalledTimes(2);
    expect(listCampaignTimeline).toHaveBeenNthCalledWith(1, "u1", "c1", { limit: 200 });
    expect(listCampaignTimeline).toHaveBeenNthCalledWith(2, "u1", "c1");
    expect(screen.getByText("Ancient event")).toBeDefined();
    expect(screen.queryByTestId("show-older")).toBeNull();
  });
});
