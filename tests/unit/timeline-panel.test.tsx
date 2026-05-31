// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const {
  createEventAction,
  archiveEventAction,
  toggleEventLockAction,
  linkEventCauseAction,
  archiveEventCausalityAction,
} = vi.hoisted(() => ({
  createEventAction: vi.fn(),
  archiveEventAction: vi.fn(),
  toggleEventLockAction: vi.fn(),
  linkEventCauseAction: vi.fn(),
  archiveEventCausalityAction: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({
  createEventAction,
  archiveEventAction,
  toggleEventLockAction,
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
    locked: false,
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
    expect(screen.getByText("Timeline · 0 events")).toBeDefined();
    // form not shown until opened
    expect(screen.queryByText("DM-only (secret)")).toBeNull();
  });

  it("lists events with time label, role, and provenance, hiding details until opened", () => {
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

    expect(screen.getByText("Timeline · 2 events")).toBeDefined();
    expect(screen.getByText("Floor 9 boss fight")).toBeDefined();
    expect(screen.getByText("Day 3")).toBeDefined();
    // provenance is shown at a glance, like the mockup
    expect(screen.getAllByText("DM").length).toBeGreaterThan(0);
    // secret events are flagged
    expect(screen.getByText("secret")).toBeDefined();
    // summary and co-participants are collapsed until the event is opened
    expect(screen.queryByText("They beat the boss.")).toBeNull();
    expect(screen.queryByText("Donut")).toBeNull();

    // clicking the event name reveals summary + participants
    fireEvent.click(screen.getByRole("button", { name: /Floor 9 boss fight/ }));
    expect(screen.getByText("They beat the boss.")).toBeDefined();
    expect(screen.getByText("Donut").closest("a")?.getAttribute("href")).toBe(
      "/campaigns/c1/entities/e2",
    );
  });

  it("reveals cause/effect chains and a cause selector when an event is opened", () => {
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

    // causality is collapsed until the event is opened
    expect(screen.queryByText("Caused by")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Sponsor stock drops/ }));

    expect(screen.getByText("Caused by")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Arena stunt" }).getAttribute("href"),
    ).toBe("/campaigns/c1/entities/e1?event=ev2");
    expect(screen.queryByRole("option", { name: "Arena stunt" })).toBeNull();

    // opening the other end surfaces the downstream "Causes" chain
    fireEvent.click(screen.getByRole("button", { name: /Arena stunt/ }));
    expect(screen.getByText("Causes")).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Sponsor stock drops" })
        .getAttribute("href"),
    ).toBe("/campaigns/c1/entities/e1?event=ev1");
  });

  it("opens an event's details on load when initialEventId is set", () => {
    render(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={[event()]}
        candidates={candidates}
        initialEventId="ev1"
      />,
    );

    // details are visible without a click because the deep link targets this event
    expect(screen.getByText("They beat the boss.")).toBeDefined();
    expect(screen.getByRole("button", { name: /Remove event/ })).toBeDefined();
  });

  it("surfaces locked events and hides the destructive remove control", () => {
    render(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={[event({ locked: true })]}
        candidates={candidates}
        initialEventId="ev1"
      />,
    );

    expect(screen.getByText("Locked")).toBeDefined();
    expect(screen.getByRole("button", { name: "Unlock event" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Remove event/ })).toBeNull();
  });

  it("re-opens the targeted event when the deep link changes", () => {
    const events = [
      event({ id: "ev1", title: "First event", summary: "First summary." }),
      event({ id: "ev2", title: "Second event", summary: "Second summary." }),
    ];
    const { rerender } = render(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={events}
        candidates={candidates}
        initialEventId="ev1"
      />,
    );
    expect(screen.getByText("First summary.")).toBeDefined();
    expect(screen.queryByText("Second summary.")).toBeNull();

    // a soft navigation to ?event=ev2 re-renders with a new prop
    rerender(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={events}
        candidates={candidates}
        initialEventId="ev2"
      />,
    );
    expect(screen.getByText("Second summary.")).toBeDefined();
    expect(screen.queryByText("First summary.")).toBeNull();
  });

  it("logs an event and closes the form on success", async () => {
    createEventAction.mockResolvedValue(undefined);
    render(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Log event/ }));
    const titleInput = screen.getByPlaceholderText("What happened?");
    fireEvent.change(titleInput, { target: { value: "A new event" } });
    fireEvent.submit(titleInput.closest("form")!);

    await waitFor(() => expect(createEventAction).toHaveBeenCalledTimes(1));
    expect(createEventAction).toHaveBeenCalledWith(
      "c1",
      "e1",
      undefined,
      expect.any(FormData),
    );
    // the form closes once the action resolves without error
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("What happened?")).toBeNull(),
    );
  });

  it("keeps the form open and surfaces the error when logging fails", async () => {
    createEventAction.mockResolvedValue({ error: "Could not log the event." });
    render(
      <TimelinePanel
        campaignId="c1"
        entityId="e1"
        events={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Log event/ }));
    const titleInput = screen.getByPlaceholderText("What happened?");
    fireEvent.change(titleInput, { target: { value: "A new event" } });
    fireEvent.submit(titleInput.closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("Could not log the event.")).toBeDefined(),
    );
    // the form stays open so the DM can correct and retry
    expect(screen.getByPlaceholderText("What happened?")).toBeDefined();
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
    // participant picker is a typeahead; candidates surface as selectable rows
    expect(screen.getByPlaceholderText("Search entity to add…")).toBeDefined();
    expect(screen.getByRole("button", { name: /Donut/ })).toBeDefined();

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
    expect(screen.queryByText("Add participant (optional)")).toBeNull();
    expect(screen.queryByPlaceholderText("Search entity to add…")).toBeNull();
  });
});
