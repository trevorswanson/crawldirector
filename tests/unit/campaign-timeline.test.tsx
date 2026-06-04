// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const {
  createCampaignEventAction,
  updateCampaignEventAction,
  applyCampaignEventEffectsAction,
  reorderEventAction,
  routerRefresh,
} = vi.hoisted(() => ({
  createCampaignEventAction: vi.fn(),
  updateCampaignEventAction: vi.fn(),
  applyCampaignEventEffectsAction: vi.fn(),
  reorderEventAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({
  createCampaignEventAction,
  updateCampaignEventAction,
  applyCampaignEventEffectsAction,
  reorderEventAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import {
  CampaignTimeline,
  computeReorderNeighbors,
} from "@/components/timeline/campaign-timeline";
import type { CampaignTimelineEvent } from "@/server/services/events";

const candidates = [
  { id: "e1", name: "Carl", type: "CRAWLER" },
  { id: "e2", name: "Donut", type: "CRAWLER" },
];

function timeInfo(
  over: Partial<CampaignTimelineEvent["time"]> = {},
): CampaignTimelineEvent["time"] {
  return {
    basis: "UNSCHEDULED",
    floor: null,
    offset: null,
    unit: null,
    anchorEventId: null,
    label: null,
    phrase: null,
    ...over,
  };
}

const events: CampaignTimelineEvent[] = [
  {
    id: "ev1",
    title: "Boss fight",
    summary: "Carl and Donut survive.",
    time: timeInfo({ basis: "FLOOR_START", floor: 9, label: "Day 3", phrase: "Day 3" }),
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
    effects: [],
  },
];

function makeEvent(
  id: string,
  title: string,
  orderKey: number,
  rank: string,
): CampaignTimelineEvent {
  return {
    id,
    title,
    summary: null,
    time: orderKey
      ? timeInfo({ basis: "FLOOR_START", floor: orderKey, phrase: `Floor ${orderKey}` })
      : timeInfo(),
    orderKey,
    rank,
    secret: false,
    locked: false,
    source: "DM",
    participants: [],
    causedBy: [],
    causes: [],
    effects: [],
  };
}

// Three floor-9 events in displayed (rank-descending) order: Alpha, Bravo, Charlie.
function floor9Trio(): CampaignTimelineEvent[] {
  return [
    makeEvent("ev-a", "Alpha", 9, "a2"),
    makeEvent("ev-b", "Bravo", 9, "a1"),
    makeEvent("ev-c", "Charlie", 9, "a0"),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("CampaignTimeline", () => {
  it("renders events with all visible participants", () => {
    render(
      <CampaignTimeline campaignId="c1" events={[...events]} candidates={candidates} />,
    );

    expect(screen.getByText("Boss fight")).toBeDefined();
    expect(screen.getByText("Carl")).toBeDefined();
    expect(screen.getByText("Donut")).toBeDefined();
    expect(screen.getByText("2 participants")).toBeDefined();
  });

  it("renders event state, unplaced time, and causality summaries", () => {
    render(
      <CampaignTimeline
        campaignId="c1"
        candidates={candidates}
        events={[
          {
            id: "ev-secret",
            title: "Secret locked scene",
            summary: null,
            time: timeInfo(),
            orderKey: 0,
            rank: "a0",
            secret: true,
            locked: true,
            source: "AI",
            participants: [],
            causedBy: [{ id: "cause", title: "Earlier scene", linkId: "link1" }],
            causes: [{ id: "effect", title: "Later scene", linkId: "link2" }],
            effects: [],
          },
        ]}
      />,
    );

    expect(screen.getByText("Unplaced")).toBeDefined();
    expect(screen.getByText("secret")).toBeDefined();
    expect(screen.getByText("Locked")).toBeDefined();
    expect(screen.getByText("0 participants")).toBeDefined();
    expect(screen.getByText("Caused by Earlier scene")).toBeDefined();
    expect(screen.getByText("Causes Later scene")).toBeDefined();
  });

  it("submits a multi-participant event", async () => {
    createCampaignEventAction.mockResolvedValue(undefined);
    render(<CampaignTimeline campaignId="c1" events={[]} candidates={candidates} />);

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    fireEvent.change(screen.getByPlaceholderText("What happened?"), {
      target: { value: "Arena cascade" },
    });
    fireEvent.change(screen.getByPlaceholderText("Search participant..."), {
      target: { value: "Carl" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Carl/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add participant" }));
    fireEvent.change(screen.getByPlaceholderText("Search participant..."), {
      target: { value: "Donut" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Donut/ }));
    fireEvent.change(screen.getAllByLabelText("Participant role")[1], {
      target: { value: "TARGET" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Log event/ }));

    await waitFor(() => expect(createCampaignEventAction).toHaveBeenCalledTimes(1));
    const [, , submitted] = createCampaignEventAction.mock.calls[0];
    expect(submitted.get("participantCount")).toBe("2");
    expect(submitted.get("participantId_0")).toBe("e1");
    expect(submitted.get("participantRole_0")).toBe("ACTOR");
    expect(submitted.get("participantId_1")).toBe("e2");
    expect(submitted.get("participantRole_1")).toBe("TARGET");
  });

  it("surfaces action errors and lets the DM cancel", async () => {
    createCampaignEventAction.mockResolvedValue({ error: "Choose at least one participant." });
    render(<CampaignTimeline campaignId="c1" events={[]} candidates={candidates} />);

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    fireEvent.change(screen.getByPlaceholderText("What happened?"), {
      target: { value: "No witness" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Log event/ }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Choose at least one participant.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByPlaceholderText("What happened?")).toBeNull();
  });

  it("edits an event from the timeline: prefilled scalars + participants, submits", async () => {
    updateCampaignEventAction.mockResolvedValue(undefined);
    render(
      <CampaignTimeline campaignId="c1" events={[...events]} candidates={candidates} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit event" }));

    // scalar fields prefilled from the event
    expect((screen.getByLabelText("Event title") as HTMLInputElement).value).toBe(
      "Boss fight",
    );
    expect((screen.getByLabelText("Floor") as HTMLInputElement).value).toBe("9");
    // participant rows prefilled from the event's participants
    const form = screen.getByLabelText("Event title").closest("form")!;
    expect(
      (form.querySelector('input[name="participantCount"]') as HTMLInputElement).value,
    ).toBe("2");
    expect(
      Array.from(form.querySelectorAll('input[name^="participantId_"]')).map(
        (i) => (i as HTMLInputElement).value,
      ),
    ).toEqual(["e1", "e2"]);

    fireEvent.change(screen.getByLabelText("Event title"), {
      target: { value: "Boss fight (revised)" },
    });
    fireEvent.submit(form);

    await waitFor(() => expect(updateCampaignEventAction).toHaveBeenCalledTimes(1));
    const [, eventId, , submitted] = updateCampaignEventAction.mock.calls[0];
    expect(eventId).toBe("ev1");
    expect(submitted.get("title")).toBe("Boss fight (revised)");
    expect(submitted.get("participantRole_0")).toBe("ACTOR");
    expect(submitted.get("participantRole_1")).toBe("TARGET");
  });

  it("adds, re-roles, and removes participant rows in the edit form", () => {
    render(
      <CampaignTimeline campaignId="c1" events={[...events]} candidates={candidates} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit event" }));
    const form = screen.getByLabelText("Event title").closest("form")!;
    const q = within(form);

    // starts with the two prefilled participant rows
    expect(q.getAllByLabelText("Participant role")).toHaveLength(2);

    // add a third row, pick an entity, and re-role it
    fireEvent.click(q.getByRole("button", { name: "Add participant" }));
    expect(q.getAllByLabelText("Participant role")).toHaveLength(3);
    fireEvent.change(q.getByPlaceholderText("Search participant..."), {
      target: { value: "Donut" },
    });
    fireEvent.click(q.getByRole("button", { name: /Donut/ }));
    fireEvent.change(q.getAllByLabelText("Participant role")[2], {
      target: { value: "WITNESS" },
    });

    // remove the third row again
    fireEvent.click(q.getAllByTitle("Remove participant row")[2]);
    expect(q.getAllByLabelText("Participant role")).toHaveLength(2);
  });

  it("hides the edit control for locked events", () => {
    render(
      <CampaignTimeline
        campaignId="c1"
        candidates={candidates}
        events={[{ ...events[0], locked: true }]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Edit event" })).toBeNull();
  });

  it("removes added participant rows", () => {
    render(<CampaignTimeline campaignId="c1" events={[]} candidates={candidates} />);

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    fireEvent.click(screen.getByRole("button", { name: "Add participant" }));
    expect(screen.getAllByLabelText("Participant role")).toHaveLength(2);

    fireEvent.click(screen.getAllByTitle("Remove participant row")[1]);

    expect(screen.getAllByLabelText("Participant role")).toHaveLength(1);
  });

  it("renders and applies event effects from the campaign timeline", async () => {
    applyCampaignEventEffectsAction.mockResolvedValue(undefined);
    render(
      <CampaignTimeline
        campaignId="c1"
        candidates={candidates}
        events={[
          {
            ...events[0],
            effects: [
              {
                id: "fx1",
                kind: "SET_STAT",
                targetId: "e1",
                stat: "currentFloor",
                delta: null,
                valueNumber: 1,
                value: null,
                note: "Entered the crawl",
                applied: false,
                appliedChangeSetId: null,
                pendingChangeSetId: null,
                pendingOperationId: null,
                reviewStatus: null,
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Floor = 1")).toBeDefined();
    expect(screen.getByText("unapplied")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Send to review/ }));

    await waitFor(() =>
      expect(applyCampaignEventEffectsAction).toHaveBeenCalledWith("c1", "ev1"),
    );
  });

  it("prefills effect rows in the edit form and keeps it open on save errors", async () => {
    updateCampaignEventAction.mockResolvedValue({ error: "Effect target is locked." });
    render(
      <CampaignTimeline
        campaignId="c1"
        candidates={candidates}
        events={[
          {
            ...events[0],
            effects: [
              {
                id: "fx-unknown",
                kind: "SET_STAT",
                targetId: "missing-crawler",
                stat: "currentFloor",
                delta: null,
                valueNumber: 1,
                value: null,
                note: "Entered the crawl",
                applied: false,
                appliedChangeSetId: null,
                pendingChangeSetId: null,
                pendingOperationId: null,
                reviewStatus: null,
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit event" }));
    const form = screen.getByLabelText("Event title").closest("form")!;

    expect(
      (form.querySelector('input[name="effectId_0"]') as HTMLInputElement).value,
    ).toBe("fx-unknown");
    expect(screen.getAllByText("Unknown crawler").length).toBeGreaterThan(0);
    expect((form.querySelector('input[name="effectValueNumber_0"]') as HTMLInputElement).value).toBe(
      "1",
    );

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("locked");
    });
    expect(screen.getByLabelText("Event title")).toBeDefined();
  });

  it("shows the no-candidate state in the new-event participant picker", () => {
    render(<CampaignTimeline campaignId="c1" events={[]} candidates={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    expect(
      (screen.getByRole("button", { name: "Add participant" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getAllByLabelText("Participant role")).toHaveLength(1);
  });

  it("reorders an event within its floor by drag and refreshes", async () => {
    reorderEventAction.mockResolvedValue(undefined);
    const floorEvents = floor9Trio();
    render(
      <CampaignTimeline campaignId="c1" events={floorEvents} candidates={candidates} />,
    );

    expect(screen.getByText(/Drag events to reorder/)).toBeDefined();

    // Drag the top event (ev-a) onto the bottom event (ev-c): it moves below it.
    const top = screen.getByText("Alpha").closest("article") as HTMLElement;
    const bottom = screen.getByText("Charlie").closest("article") as HTMLElement;
    fireEvent.dragStart(top);
    fireEvent.dragOver(bottom);
    fireEvent.drop(bottom);

    await waitFor(() => {
      expect(reorderEventAction).toHaveBeenCalledWith("c1", "ev-a", {
        aboveId: "ev-c",
        belowId: null,
      });
    });
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
  });

  it("surfaces a reorder error and does not refresh", async () => {
    reorderEventAction.mockResolvedValue({ error: "This event is locked." });
    render(
      <CampaignTimeline campaignId="c1" events={floor9Trio()} candidates={candidates} />,
    );

    const top = screen.getByText("Alpha").closest("article") as HTMLElement;
    const middle = screen.getByText("Bravo").closest("article") as HTMLElement;
    fireEvent.dragStart(top);
    fireEvent.dragOver(middle);
    fireEvent.drop(middle);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("locked");
    });
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("tracks and clears the drop affordance on drag over, leave, and end", () => {
    render(
      <CampaignTimeline campaignId="c1" events={floor9Trio()} candidates={candidates} />,
    );
    const top = screen.getByText("Alpha").closest("article") as HTMLElement;
    const bottom = screen.getByText("Charlie").closest("article") as HTMLElement;

    fireEvent.dragStart(top);
    fireEvent.dragOver(bottom);
    fireEvent.dragLeave(bottom);
    fireEvent.dragEnd(top);

    // No action runs from hovering alone.
    expect(reorderEventAction).not.toHaveBeenCalled();
    // After drag end the grip handles are back (dragging state cleared).
    expect(top.getAttribute("draggable")).toBe("true");
  });

  it("ignores a drop onto an event on another floor", () => {
    reorderEventAction.mockResolvedValue(undefined);
    const mixed: CampaignTimelineEvent[] = [
      makeEvent("ev-a", "Alpha", 9, "a2"),
      makeEvent("ev-x", "Xenon", 2, "a0"),
    ];
    render(<CampaignTimeline campaignId="c1" events={mixed} candidates={candidates} />);

    const floor9 = screen.getByText("Alpha").closest("article") as HTMLElement;
    const floor2 = screen.getByText("Xenon").closest("article") as HTMLElement;
    fireEvent.dragStart(floor9);
    fireEvent.drop(floor2);

    expect(reorderEventAction).not.toHaveBeenCalled();
  });
});

describe("computeReorderNeighbors", () => {
  const list = [
    { id: "a", orderKey: 9 },
    { id: "b", orderKey: 9 },
    { id: "c", orderKey: 9 },
    { id: "x", orderKey: 2 },
  ];

  it("returns null for a self drop", () => {
    expect(computeReorderNeighbors(list, "a", "a")).toBeNull();
  });

  it("returns null across floors", () => {
    expect(computeReorderNeighbors(list, "a", "x")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(computeReorderNeighbors(list, "missing", "a")).toBeNull();
  });

  it("moving down past the last drops below it", () => {
    expect(computeReorderNeighbors(list, "a", "c")).toEqual({
      aboveId: "c",
      belowId: null,
    });
  });

  it("moving down one slot lands between the target and its next", () => {
    expect(computeReorderNeighbors(list, "a", "b")).toEqual({
      aboveId: "b",
      belowId: "c",
    });
  });

  it("moving up past the first drops above it", () => {
    expect(computeReorderNeighbors(list, "c", "a")).toEqual({
      aboveId: null,
      belowId: "a",
    });
  });

  it("moving up one slot lands between the target and its previous", () => {
    expect(computeReorderNeighbors(list, "c", "b")).toEqual({
      aboveId: "a",
      belowId: "b",
    });
  });
});
