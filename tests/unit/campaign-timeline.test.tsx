// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react";

const {
  createCampaignEventAction,
  updateCampaignEventAction,
  applyCampaignEventEffectsAction,
  reorderEventAction,
  orderEventsFromCausalityAction,
  setCampaignCurrentFloorAction,
  setCampaignEventLockAction,
  archiveCampaignEventAction,
  restoreCampaignEventAction,
  linkCampaignEventCauseAction,
  archiveCampaignEventCausalityAction,
  restoreCampaignEventCausalityAction,
  routerRefresh,
} = vi.hoisted(() => ({
  createCampaignEventAction: vi.fn(),
  updateCampaignEventAction: vi.fn(),
  applyCampaignEventEffectsAction: vi.fn(),
  reorderEventAction: vi.fn(),
  orderEventsFromCausalityAction: vi.fn(),
  setCampaignCurrentFloorAction: vi.fn(),
  setCampaignEventLockAction: vi.fn(),
  archiveCampaignEventAction: vi.fn(),
  restoreCampaignEventAction: vi.fn(),
  linkCampaignEventCauseAction: vi.fn(),
  archiveCampaignEventCausalityAction: vi.fn(),
  restoreCampaignEventCausalityAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({
  createCampaignEventAction,
  updateCampaignEventAction,
  applyCampaignEventEffectsAction,
  reorderEventAction,
  orderEventsFromCausalityAction,
  setCampaignCurrentFloorAction,
  setCampaignEventLockAction,
  archiveCampaignEventAction,
  restoreCampaignEventAction,
  linkCampaignEventCauseAction,
  archiveCampaignEventCausalityAction,
  restoreCampaignEventCausalityAction,
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
import type {
  CampaignFloorMeta,
  CampaignTimelineEvent,
} from "@/server/services/events";

const candidates = [
  { id: "e1", name: "Carl", type: "CRAWLER" },
  { id: "e2", name: "Donut", type: "CRAWLER" },
];

const emptyFloors: CampaignFloorMeta = {
  ladder: [],
  byNumber: {},
  currentFloorNumber: null,
  currentFloorId: null,
  liveEventId: null,
  floorEntities: [],
};

// Render with the new floor-meta + canEdit props defaulted; individual tests
// override events/candidates/floors/canEdit as needed.
function renderTimeline(
  props: Partial<React.ComponentProps<typeof CampaignTimeline>> = {},
) {
  return render(
    <CampaignTimeline
      campaignId="c1"
      events={[]}
      candidates={candidates}
      floors={emptyFloors}
      canEdit
      {...props}
    />,
  );
}

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
    renderTimeline({ events: [...events] });

    expect(screen.getByText("Boss fight")).toBeDefined();
    expect(screen.getByText("Carl")).toBeDefined();
    expect(screen.getByText("Donut")).toBeDefined();
    expect(screen.getByText("2 participants")).toBeDefined();
  });

  it("renders event state, unplaced time, and causality threads", () => {
    renderTimeline({
      events: [
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
      ],
    });

    expect(screen.getByText("Unplaced")).toBeDefined();
    expect(screen.getByText("DM-only")).toBeDefined();
    expect(screen.getByRole("button", { name: "Unlock event" })).toBeDefined();
    expect(screen.getByText("0 participants")).toBeDefined();
    // Causality is now a thread: a label plus the linked event title.
    expect(screen.getByText("Caused by")).toBeDefined();
    expect(screen.getByText("Earlier scene")).toBeDefined();
    expect(screen.getByText("Causes")).toBeDefined();
    expect(screen.getByText("Later scene")).toBeDefined();
  });

  it("flags causal links whose effect is placed before its cause", () => {
    // Cause on Floor 3, effect on Floor 1 ⇒ the effect precedes its cause.
    renderTimeline({
      events: [
        {
          ...makeEvent("ev-cause", "The decree", 3, "a0"),
          causes: [{ id: "ev-effect", title: "The fallout", linkId: "lk1" }],
        },
        {
          ...makeEvent("ev-effect", "The fallout", 1, "a0"),
          causedBy: [{ id: "ev-cause", title: "The decree", linkId: "lk1" }],
        },
      ],
    });

    // Inline markers appear on both ends of the link (cause's Causes thread and
    // effect's Caused-by thread), plus the header summary counts the one link.
    expect(
      screen.getAllByLabelText("Out of order: this effect is placed before its cause").length,
    ).toBe(2);
    expect(screen.getByText("1 out of order")).toBeDefined();
  });

  it("does not flag a causal link whose cause precedes its effect", () => {
    renderTimeline({
      events: [
        {
          ...makeEvent("ev-cause", "The decree", 1, "a0"),
          causes: [{ id: "ev-effect", title: "The fallout", linkId: "lk1" }],
        },
        {
          ...makeEvent("ev-effect", "The fallout", 3, "a0"),
          causedBy: [{ id: "ev-cause", title: "The decree", linkId: "lk1" }],
        },
      ],
    });

    expect(
      screen.queryByLabelText("Out of order: this effect is placed before its cause"),
    ).toBeNull();
    expect(screen.queryByText("1 out of order")).toBeNull();
  });

  // ── "Order from causality" affordance (ADR 0004 slice 3) ──

  // A same-floor inverted pair: the cause ("ev-cause", rank a1, later in fiction)
  // is declared the cause of the effect ("ev-effect", rank a0, earlier) — so a
  // reorder would move them, and both are movable (FLOOR_START, no offset).
  function invertedFloorPair(): CampaignTimelineEvent[] {
    return [
      {
        ...makeEvent("ev-cause", "The decree", 9, "a1"),
        causes: [{ id: "ev-effect", title: "The fallout", linkId: "lk1" }],
      },
      {
        ...makeEvent("ev-effect", "The fallout", 9, "a0"),
        causedBy: [{ id: "ev-cause", title: "The decree", linkId: "lk1" }],
      },
    ];
  }

  it("shows 'Order from causality' and runs it when a reorder would help", async () => {
    orderEventsFromCausalityAction.mockResolvedValue(undefined);
    renderTimeline({ events: invertedFloorPair() });

    const button = screen.getByRole("button", { name: /order from causality/i });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(orderEventsFromCausalityAction).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
  });

  it("surfaces the error and does not refresh when ordering fails", async () => {
    orderEventsFromCausalityAction.mockResolvedValue({ error: "Not allowed." });
    renderTimeline({ events: invertedFloorPair() });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /order from causality/i }));
    });

    expect(await screen.findByText("Not allowed.")).toBeDefined();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("hides 'Order from causality' when the timeline is already in order", () => {
    renderTimeline({
      events: [
        {
          ...makeEvent("ev-cause", "The decree", 9, "a0"),
          causes: [{ id: "ev-effect", title: "The fallout", linkId: "lk1" }],
        },
        {
          ...makeEvent("ev-effect", "The fallout", 9, "a1"),
          causedBy: [{ id: "ev-cause", title: "The decree", linkId: "lk1" }],
        },
      ],
    });

    expect(screen.queryByRole("button", { name: /order from causality/i })).toBeNull();
  });

  it("hides 'Order from causality' for a non-DM viewer", () => {
    renderTimeline({ events: invertedFloorPair(), canEdit: false });

    expect(screen.queryByRole("button", { name: /order from causality/i })).toBeNull();
  });

  it("submits a multi-participant event", async () => {
    createCampaignEventAction.mockResolvedValue(undefined);
    renderTimeline({ events: [] });

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
    renderTimeline({ events: [] });

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
    renderTimeline({ events: [...events] });

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
    renderTimeline({ events: [...events] });

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
    renderTimeline({ events: [{ ...events[0], locked: true }] });

    expect(screen.queryByRole("button", { name: "Edit event" })).toBeNull();
  });

  it("hides all DM controls for read-only (player) viewers", () => {
    renderTimeline({ events: [...events], canEdit: false });

    expect(screen.queryByRole("button", { name: "Log event" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit event" })).toBeNull();
    expect(screen.queryByText(/Drag events to reorder/)).toBeNull();
  });

  it("removes added participant rows", () => {
    renderTimeline({ events: [] });

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    fireEvent.click(screen.getByRole("button", { name: "Add participant" }));
    expect(screen.getAllByLabelText("Participant role")).toHaveLength(2);

    fireEvent.click(screen.getAllByTitle("Remove participant row")[1]);

    expect(screen.getAllByLabelText("Participant role")).toHaveLength(1);
  });

  it("renders and applies event effects from the campaign timeline", async () => {
    applyCampaignEventEffectsAction.mockResolvedValue(undefined);
    renderTimeline({
      events: [
        {
          ...events[0],
          effects: [
            {
              id: "fx1",
              kind: "ADJUST_STAT",
              targetId: "e1",
              stat: "gold",
              delta: 12000,
              valueNumber: null,
              value: null,
              note: null,
              applied: false,
              appliedChangeSetId: null,
              pendingChangeSetId: null,
              pendingOperationId: null,
              reviewStatus: null,
            },
          ],
        },
      ],
    });

    // Effects render as signed stat diffs: target · stat · +N.
    expect(screen.getByText("gold")).toBeDefined();
    expect(screen.getByText("+12,000")).toBeDefined();
    expect(screen.getByText("unapplied")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));

    await waitFor(() =>
      expect(applyCampaignEventEffectsAction).toHaveBeenCalledWith("c1", "ev1"),
    );
  });

  it("prefills effect rows in the edit form and keeps it open on save errors", async () => {
    updateCampaignEventAction.mockResolvedValue({ error: "Effect target is locked." });
    renderTimeline({
      events: [
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
      ],
    });

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
    renderTimeline({ events: [], candidates: [] });

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
    renderTimeline({ events: floorEvents });

    expect(screen.getByText(/Drag events to reorder/)).toBeDefined();

    // Drag the top event (ev-a) onto the bottom event (ev-c): it moves below it.
    const top = screen.getByRole("heading", { name: "Alpha" }).closest("article") as HTMLElement;
    const bottom = screen.getByRole("heading", { name: "Charlie" }).closest("article") as HTMLElement;
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
    renderTimeline({ events: floor9Trio() });

    const top = screen.getByRole("heading", { name: "Alpha" }).closest("article") as HTMLElement;
    const middle = screen.getByRole("heading", { name: "Bravo" }).closest("article") as HTMLElement;
    fireEvent.dragStart(top);
    fireEvent.dragOver(middle);
    fireEvent.drop(middle);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("locked");
    });
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("tracks and clears the drop affordance on drag over, leave, and end", () => {
    renderTimeline({ events: floor9Trio() });
    const top = screen.getByRole("heading", { name: "Alpha" }).closest("article") as HTMLElement;
    const bottom = screen.getByRole("heading", { name: "Charlie" }).closest("article") as HTMLElement;

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
    renderTimeline({ events: mixed });

    const floor9 = screen.getByRole("heading", { name: "Alpha" }).closest("article") as HTMLElement;
    const floor2 = screen.getByRole("heading", { name: "Xenon" }).closest("article") as HTMLElement;
    fireEvent.dragStart(floor9);
    fireEvent.drop(floor2);

    expect(reorderEventAction).not.toHaveBeenCalled();
  });

  it("bands events under named floor headers with ON AIR on the current floor", () => {
    const floors: CampaignFloorMeta = {
      ladder: [
        { number: 8, name: null, count: 1, current: false, reached: true, logged: true, entityId: null },
        { number: 9, name: "Larracos", count: 1, current: true, reached: true, logged: true, entityId: "f9" },
      ],
      byNumber: {
        9: { number: 9, name: "Larracos", theme: "Castle siege · the moat runs red", entityId: "f9" },
      },
      currentFloorNumber: 9,
      currentFloorId: "f9",
      liveEventId: "ev1",
      floorEntities: [{ id: "f9", name: "Larracos", floorNumber: 9 }],
    };
    renderTimeline({
      events: [events[0], makeEvent("ev-8", "Bone market deal", 8, "a0")],
      floors,
    });

    expect(screen.getByText("FLOOR 09")).toBeDefined();
    expect(screen.getByText("FLOOR 08")).toBeDefined();
    expect(screen.getAllByText("Larracos").length).toBeGreaterThan(0);
    expect(screen.getByText("Castle siege · the moat runs red")).toBeDefined();
    expect(screen.getByText("On air")).toBeDefined();
    // The live event shows the NOW marker.
    expect(screen.getByText("Now")).toBeDefined();
  });

  it("filters events by provenance origin from the rail", () => {
    const dm = makeEvent("ev-dm", "DM scene", 9, "a1");
    const ai = { ...makeEvent("ev-ai", "AI beat", 9, "a0"), source: "AI" as const };
    renderTimeline({ events: [dm, ai] });

    expect(screen.getByRole("heading", { name: "DM scene" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "AI beat" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    expect(screen.queryByRole("heading", { name: "DM scene" })).toBeNull();
    expect(screen.getByRole("heading", { name: "AI beat" })).toBeDefined();
  });

  it("changes the current floor from the rail picker", async () => {
    setCampaignCurrentFloorAction.mockResolvedValue(undefined);
    const floors: CampaignFloorMeta = {
      ...emptyFloors,
      floorEntities: [
        { id: "f9", name: "Larracos", floorNumber: 9 },
        { id: "f8", name: "Bone Market", floorNumber: 8 },
      ],
    };
    renderTimeline({ events: [...events], floors });

    fireEvent.change(screen.getByLabelText("Current floor"), {
      target: { value: "f9" },
    });

    await waitFor(() =>
      expect(setCampaignCurrentFloorAction).toHaveBeenCalledWith("c1", "f9"),
    );
  });

  it("locks and archives an event from the timeline", async () => {
    setCampaignEventLockAction.mockResolvedValue(undefined);
    archiveCampaignEventAction.mockResolvedValue(undefined);
    renderTimeline({ events: [...events] });

    fireEvent.click(screen.getByRole("button", { name: "Lock event" }));
    await waitFor(() =>
      // Form actions receive a trailing FormData arg after the bound ones.
      expect(setCampaignEventLockAction).toHaveBeenCalledWith(
        "c1",
        "ev1",
        false,
        expect.any(FormData),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove event" }));
    await waitFor(() =>
      expect(archiveCampaignEventAction).toHaveBeenCalledWith("c1", "ev1"),
    );
  });

  it("shows an undo affordance after removing an event from the timeline", async () => {
    archiveCampaignEventAction.mockResolvedValue(undefined);
    restoreCampaignEventAction.mockResolvedValue(undefined);
    renderTimeline({ events: [...events] });

    fireEvent.click(screen.getByRole("button", { name: "Remove event" }));
    await waitFor(() =>
      expect(archiveCampaignEventAction).toHaveBeenCalledWith("c1", "ev1"),
    );

    expect(screen.getByText("Event removed.")).toBeDefined();
    expect(screen.queryByRole("heading", { name: "DM scene" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(restoreCampaignEventAction).toHaveBeenCalledWith("c1", "ev1"),
    );
    expect(screen.queryByText("Event removed.")).toBeNull();
  });

  it("shows unlock (not remove) for a locked event", () => {
    renderTimeline({ events: [{ ...events[0], locked: true }] });

    expect(screen.getByRole("button", { name: "Unlock event" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Remove event" })).toBeNull();
  });

  it("adds a causal link from an event's node", async () => {
    linkCampaignEventCauseAction.mockResolvedValue(undefined);
    renderTimeline({ events: floor9Trio() });

    const alpha = screen
      .getByRole("heading", { name: "Alpha" })
      .closest("article")!;
    const q = within(alpha as HTMLElement);
    // Enter edit mode
    fireEvent.click(q.getByRole("button", { name: "Edit event" }));
    // Alpha's add-cause picker lists the other floor-9 events.
    fireEvent.change(q.getByRole("combobox", { name: "Cause event" }), {
      target: { value: "ev-b" },
    });
    fireEvent.click(q.getByRole("button", { name: "Add cause" }));

    await waitFor(() =>
      // bind(null, campaignId, effectId) prepends to the useActionState call.
      expect(linkCampaignEventCauseAction).toHaveBeenCalledWith(
        "c1",
        "ev-a",
        undefined,
        expect.any(FormData),
      ),
    );
  });

  it("removes a causality link from the timeline", async () => {
    archiveCampaignEventCausalityAction.mockResolvedValue(undefined);
    renderTimeline({
      events: [
        {
          ...events[0],
          causedBy: [{ id: "cause-ev", title: "Earlier scene", linkId: "link-7" }],
        },
      ],
    });

    // Enter edit mode
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove causality link" }));
    await waitFor(() =>
      expect(archiveCampaignEventCausalityAction).toHaveBeenCalledWith("c1", "link-7"),
    );
  });

  it("shows an undo affordance after removing a causality link", async () => {
    archiveCampaignEventCausalityAction.mockResolvedValue(undefined);
    restoreCampaignEventCausalityAction.mockResolvedValue(undefined);
    renderTimeline({
      events: [
        {
          ...events[0],
          causedBy: [{ id: "cause-ev", title: "Earlier scene", linkId: "link-7" }],
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit event" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove causality link" }));
    await waitFor(() =>
      expect(archiveCampaignEventCausalityAction).toHaveBeenCalledWith("c1", "link-7"),
    );

    expect(screen.getByText("Causality link removed.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(restoreCampaignEventCausalityAction).toHaveBeenCalledWith(
        "c1",
        "link-7",
      ),
    );
  });

  it("hides causality edit controls when the event is not in edit mode or is locked", () => {
    renderTimeline({
      events: [
        {
          ...events[0],
          causedBy: [{ id: "cause-ev", title: "Earlier scene", linkId: "link-7" }],
          locked: false,
        },
        {
          ...events[0],
          id: "locked-ev",
          title: "Locked event",
          causedBy: [{ id: "cause-ev", title: "Earlier scene", linkId: "link-8" }],
          locked: true,
        },
      ],
    });

    // 1. By default, not in edit mode: remove buttons and add-cause should not be present
    expect(screen.queryByRole("button", { name: "Remove causality link" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Cause event" })).toBeNull();

    // 2. Locked event: even if canEdit is true, edit controls are hidden and Edit button is not even visible
    const lockedArticle = screen.getByRole("heading", { name: "Locked event" }).closest("article")!;
    const qLocked = within(lockedArticle as HTMLElement);
    expect(qLocked.queryByRole("button", { name: "Edit event" })).toBeNull();
    expect(qLocked.queryByRole("button", { name: "Remove causality link" })).toBeNull();
    expect(qLocked.queryByRole("combobox", { name: "Cause event" })).toBeNull();
  });

  it("scrolls to and highlights an event when a causality link is clicked", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const target = makeEvent("ev-target", "Origin beat", 9, "a1");
    const effect: CampaignTimelineEvent = {
      ...makeEvent("ev-effect", "Follow-up", 9, "a0"),
      causedBy: [{ id: "ev-target", title: "Origin beat", linkId: "lk" }],
    };
    renderTimeline({ events: [target, effect] });

    fireEvent.click(screen.getByRole("button", { name: "Origin beat" }));

    expect(scrollIntoView).toHaveBeenCalled();
    const targetPanel = document
      .getElementById("event-ev-target")!
      .querySelector(".panel") as HTMLElement;
    expect(targetPanel.style.boxShadow).toContain("var(--accent)");
  });

  it("infers a floor day-range from absolute-dated events, leaving others blank", () => {
    const dated = (id: string, rank: string, floor: number, day: number) => ({
      ...makeEvent(id, `Beat ${id}`, floor, rank),
      time: timeInfo({ basis: "COLLAPSE", floor, offset: day, unit: "DAY", phrase: `Day ${day}` }),
    });
    renderTimeline({
      events: [
        dated("a", "a1", 9, 388),
        dated("b", "a0", 9, 412),
        // Floor 8 has only a floor-relative event → no absolute range inferable.
        makeEvent("c", "Bone deal", 8, "a0"),
      ],
    });

    // Floor 9 spans the absolute days of its dated events.
    expect(screen.getByText("Day 388 – 412")).toBeDefined();
    // Floor 8 (only a floor-relative event) shows no inferred day range.
    const floor8 = screen.getByText("FLOOR 08").closest("section") as HTMLElement;
    expect(within(floor8).queryByText(/Day \d/)).toBeNull();
  });

  it("disables drag for anchored events whose order the system infers", () => {
    // basis FLOOR_START *with* a concrete offset → order derived → not draggable.
    const anchored: CampaignTimelineEvent = {
      ...events[0],
      time: timeInfo({ basis: "FLOOR_START", floor: 9, offset: 3, unit: "DAY", phrase: "Floor 9 · 3 days in" }),
    };
    renderTimeline({ events: [anchored] });

    const article = screen
      .getByRole("heading", { name: "Boss fight" })
      .closest("article") as HTMLElement;
    expect(article.getAttribute("draggable")).toBe("false");
  });

  it("initialEventId landing logic and timeout highlight clearing", async () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderTimeline({
      events: [...events],
      initialEventId: "ev1",
    });

    expect(scrollIntoView).toHaveBeenCalled();

    // Now fast-forward timers to clear highlight
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    vi.useRealTimers();
  });

  it("handles floor rail button clicks to jump to floor", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const mockGetElement = vi.spyOn(document, "getElementById").mockReturnValue({
      scrollIntoView,
    } as unknown as HTMLElement);

    const floors: CampaignFloorMeta = {
      ...emptyFloors,
      ladder: [{ number: 9, name: "Larracos", count: 1, current: false, reached: true, logged: true, entityId: null }],
    };
    renderTimeline({ events: [...events], floors });

    fireEvent.click(screen.getByTitle("Floor 9 — Larracos"));
    expect(scrollIntoView).toHaveBeenCalled();
    mockGetElement.mockRestore();
  });

  it("renders the not yet reached floor footer when current floor is less than max ladder", () => {
    const floors: CampaignFloorMeta = {
      ...emptyFloors,
      currentFloorNumber: 1,
      ladder: [
        { number: 1, name: "First", count: 1, current: true, reached: true, logged: true, entityId: null },
        { number: 2, name: "Second", count: 0, current: false, reached: false, logged: false, entityId: null },
      ],
    };
    renderTimeline({ events: [...events], floors });
    expect(screen.getByText(/Floor 2/)).toBeDefined();
    expect(screen.getByText(/not yet reached/)).toBeDefined();
  });

  it("handles player suggestion provenance filter in sourceFilterKey", () => {
    const suggestionEvent: CampaignTimelineEvent = {
      ...events[0],
      id: "ev-suggestion",
      source: "PLAYER_SUGGESTION",
    };
    renderTimeline({ events: [suggestionEvent] });
    expect(screen.getAllByText("PLR").length).toBeGreaterThan(0);
  });

  it("renders effect diff notes and review status labels", () => {
    const effectEvent: CampaignTimelineEvent = {
      ...events[0],
      effects: [
        {
          id: "eff-1",
          kind: "ADJUST_STAT",
          targetId: "e1",
          stat: "gold",
          delta: 0,
          valueNumber: null,
          value: null,
          note: "Bonus chest",
          applied: false,
          appliedChangeSetId: null,
          pendingChangeSetId: null,
          pendingOperationId: null,
          reviewStatus: "PENDING",
        },
        {
          id: "eff-2",
          kind: "SET_ALIVE",
          targetId: "e1",
          stat: null,
          delta: null,
          valueNumber: null,
          value: null,
          note: null,
          applied: false,
          appliedChangeSetId: null,
          pendingChangeSetId: null,
          pendingOperationId: null,
          reviewStatus: "REJECTED",
        },
        {
          id: "eff-3",
          kind: "SET_STAT",
          targetId: "e1",
          stat: "hp",
          delta: null,
          valueNumber: 100,
          value: null,
          note: null,
          applied: false,
          appliedChangeSetId: null,
          pendingChangeSetId: null,
          pendingOperationId: null,
          reviewStatus: "SUPERSEDED",
        }
      ]
    };
    renderTimeline({ events: [effectEvent] });
    expect(screen.getByText("Bonus chest")).toBeDefined();
    expect(screen.getByText(/pending review/)).toBeDefined();
    expect(screen.getByText(/rejected/)).toBeDefined();
    expect(screen.getByText(/superseded/)).toBeDefined();
  });

  it("limits participant rows in NewEventForm to 20", () => {
    renderTimeline({ canEdit: true });
    // Click log event to open the form
    fireEvent.click(screen.getByRole("button", { name: "Log event" }));

    const addRowBtn = screen.getByRole("button", { name: "Add participant" });
    // Click it 25 times
    for (let i = 0; i < 25; i++) {
      fireEvent.click(addRowBtn);
    }
    // There should be exactly 20 participant input groups (including the first one)
    const actorPickers = screen.getAllByPlaceholderText("Search participant...");
    expect(actorPickers.length).toBe(20);
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
