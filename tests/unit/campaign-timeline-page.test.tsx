// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  listCampaignTimeline,
  listEntitiesForUser,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listCampaignTimeline: vi.fn(),
  listEntitiesForUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/events", () => ({ listCampaignTimeline }));
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
  }: {
    events: Array<{
      title: string;
      participants: Array<{ name: string }>;
    }>;
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
    </main>
  ),
}));

import CampaignTimelinePage from "@/app/(dm)/campaigns/[id]/timeline/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({ id: "c1", name: "World One" });
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
    listCampaignTimeline.mockResolvedValue([
      {
        id: "ev1",
        title: "Boss fight",
        summary: "Carl and Donut survive.",
        time: { floor: 9, label: "Day 3" },
        orderKey: 9,
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
    ]);

    render(await CampaignTimelinePage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByRole("heading", { name: "Campaign Timeline" })).toBeDefined();
    expect(screen.getByText("Boss fight")).toBeDefined();
    expect(screen.getByText("Carl")).toBeDefined();
    expect(screen.getByText("Donut")).toBeDefined();
  });

  it("shows an honest empty state when no events exist", async () => {
    listCampaignTimeline.mockResolvedValue([]);

    render(await CampaignTimelinePage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText(/No events logged yet/)).toBeDefined();
  });

  it("404s for a non-member / missing campaign", async () => {
    getCampaignForUser.mockResolvedValue(null);

    await expect(
      CampaignTimelinePage({ params: Promise.resolve({ id: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
