// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const {
  createEventAction,
  archiveEventAction,
  linkEventCauseAction,
  archiveEventCausalityAction,
} = vi.hoisted(() => ({
  createEventAction: vi.fn(),
  archiveEventAction: vi.fn(),
  linkEventCauseAction: vi.fn(),
  archiveEventCausalityAction: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({
  createEventAction,
  archiveEventAction,
  linkEventCauseAction,
  archiveEventCausalityAction,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  TimelinePanel,
  type TimelineCandidate,
} from "@/components/entities/timeline-panel";
import type { EntityEvent } from "@/server/services/events";

const candidates: TimelineCandidate[] = [
  { id: "e2", name: "Donut", type: "CRAWLER" },
];

function event(overrides: Partial<EntityEvent> = {}): EntityEvent {
  return {
    id: "ev1",
    title: "Floor 9 boss fight",
    summary: "They beat the boss.",
    time: { floor: 9, label: "Day 3" },
    orderKey: 9,
    secret: false,
    source: "DM",
    role: "ACTOR",
    others: [{ id: "e2", name: "Donut", type: "CRAWLER", role: "ACTOR" }],
    causedBy: [],
    causes: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("TimelinePanel", () => {
  it("renders the empty state and a log toggle", () => {
    render(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={[]}
        candidates={candidates}
      />,
    );

    expect(screen.getByText("No events logged for this entity yet.")).toBeDefined();
    expect(screen.getByText("Timeline · 0")).toBeDefined();
    // form not shown until opened
    expect(screen.queryByText("DM-only (secret)")).toBeNull();
  });

  it("lists events with role, time label, summary, and co-participants", () => {
    render(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={[
          event(),
          event({
            id: "ev2",
            title: "Secret pact",
            summary: null,
            secret: true,
            time: { floor: null, label: null },
            others: [],
          }),
        ]}
        candidates={candidates}
      />,
    );

    expect(screen.getByText("Timeline · 2")).toBeDefined();
    expect(screen.getAllByText("Floor 9 boss fight")[0]).toBeDefined();
    expect(screen.getByText("Day 3")).toBeDefined();
    expect(screen.getByText("They beat the boss.")).toBeDefined();
    // secret events are flagged
    expect(screen.getByText("secret")).toBeDefined();
    // co-participant links to the other entity
    expect(screen.getByText("Donut").closest("a")?.getAttribute("href")).toBe(
      "/campaigns/c1/entities/e2",
    );
  });

  it("renders cause/effect chains and a cause selector for other timeline events", () => {
    render(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={[
          event({
            id: "ev1",
            title: "Sponsor stock drops",
            causedBy: [{ id: "ev2", title: "Arena stunt", linkId: "ec1" }],
          }),
          event({
            id: "ev2",
            title: "Arena stunt",
            causes: [{ id: "ev1", title: "Sponsor stock drops", linkId: "ec1" }],
          }),
        ]}
        candidates={candidates}
      />,
    );

    expect(screen.getByText("Caused by")).toBeDefined();
    expect(screen.getByText("Causes")).toBeDefined();
    expect(screen.getAllByRole("link", { name: "Arena stunt" })[0].getAttribute("href")).toBe(
      "/campaigns/c1/entities/e1?event=ev2",
    );
    expect(screen.queryByRole("button", { name: "Add cause" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Arena stunt" })).toBeNull();
  });

  it("opens the log form with role selects and a participant picker", () => {
    render(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Log event/ }));
    expect(screen.getByPlaceholderText("What happened?")).toBeDefined();
    expect(screen.getByText("DM-only (secret)")).toBeDefined();
    // candidate participant is offered
    expect(screen.getByRole("option", { name: "Donut" })).toBeDefined();

    // cancel hides it again
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("DM-only (secret)")).toBeNull();
  });

  it("falls back to the floor when no time label is set", () => {
    render(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={[event({ time: { floor: 4, label: null } })]}
        candidates={candidates}
      />,
    );

    expect(screen.getByText("Floor 4")).toBeDefined();
  });

  it("still offers the log form when there are no candidate participants", () => {
    render(
      <TimelinePanel campaignId="c1" entityId="e1" events={[]} candidates={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Log event/ }));
    expect(screen.getByPlaceholderText("What happened?")).toBeDefined();
    // no participant picker without candidates
    expect(screen.queryByText("Add participant… (optional)")).toBeNull();
  });
});
