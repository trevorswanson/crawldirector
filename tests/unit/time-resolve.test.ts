import { describe, expect, it } from "vitest";

import {
  computeFloorDayRanges,
  resolveAbsoluteDay,
  type FloorAnchors,
  type ResolvableTime,
  type ResolveContext,
} from "@/lib/time-resolve";

const noContext: ResolveContext = {
  eventTimeById: () => undefined,
  floorAnchors: () => undefined,
};

function ctxFrom(
  events: Record<string, ResolvableTime>,
  floors: Record<number, FloorAnchors>,
): ResolveContext {
  return {
    eventTimeById: (id) => events[id],
    floorAnchors: (floor) => floors[floor],
  };
}

describe("resolveAbsoluteDay", () => {
  it("reads COLLAPSE offsets directly", () => {
    expect(resolveAbsoluteDay({ basis: "COLLAPSE", offset: 0 }, noContext)).toBe(0);
    expect(resolveAbsoluteDay({ basis: "COLLAPSE", offset: 47 }, noContext)).toBe(47);
  });

  it("returns null for UNSCHEDULED and for an offsetless COLLAPSE", () => {
    expect(resolveAbsoluteDay({ basis: "UNSCHEDULED" }, noContext)).toBeNull();
    expect(resolveAbsoluteDay({ basis: "COLLAPSE" }, noContext)).toBeNull();
  });

  it("resolves FLOOR_START against the floor's open day", () => {
    const ctx = ctxFrom({}, { 9: { startDay: 40, collapseDay: 47 } });
    expect(resolveAbsoluteDay({ basis: "FLOOR_START", floor: 9, offset: 3 }, ctx)).toBe(43);
    // No offset → the floor's open day itself.
    expect(resolveAbsoluteDay({ basis: "FLOOR_START", floor: 9 }, ctx)).toBe(40);
  });

  it("resolves FLOOR_COLLAPSE by counting down from the collapse day", () => {
    const ctx = ctxFrom({}, { 9: { startDay: 40, collapseDay: 47 } });
    expect(resolveAbsoluteDay({ basis: "FLOOR_COLLAPSE", floor: 9, offset: 2 }, ctx)).toBe(45);
  });

  it("returns null for floor bases when the anchor is missing", () => {
    const ctx = ctxFrom({}, { 9: { startDay: null, collapseDay: null } });
    expect(resolveAbsoluteDay({ basis: "FLOOR_START", floor: 9, offset: 3 }, ctx)).toBeNull();
    expect(resolveAbsoluteDay({ basis: "FLOOR_COLLAPSE", floor: 5, offset: 1 }, ctx)).toBeNull();
  });

  it("treats sub-day (hour/minute) offsets as the same day", () => {
    const ctx = ctxFrom({}, { 9: { startDay: 40, collapseDay: null } });
    expect(
      resolveAbsoluteDay({ basis: "FLOOR_START", floor: 9, offset: 12, unit: "HOUR" }, ctx),
    ).toBe(40);
  });

  it("resolves an EVENT anchor recursively", () => {
    const ctx = ctxFrom(
      { a: { basis: "COLLAPSE", offset: 0 } },
      {},
    );
    // "2 days after event A" → 0 + 2 (the DM's reported scenario).
    expect(
      resolveAbsoluteDay({ basis: "EVENT", anchorEventId: "a", offset: 2 }, ctx),
    ).toBe(2);
  });

  it("chains EVENT anchors", () => {
    const ctx = ctxFrom(
      {
        a: { basis: "COLLAPSE", offset: 10 },
        b: { basis: "EVENT", anchorEventId: "a", offset: 3 },
      },
      {},
    );
    expect(
      resolveAbsoluteDay({ basis: "EVENT", anchorEventId: "b", offset: 1 }, ctx),
    ).toBe(14);
  });

  it("returns null on a missing anchor or a cycle", () => {
    expect(
      resolveAbsoluteDay({ basis: "EVENT", anchorEventId: "ghost", offset: 1 }, noContext),
    ).toBeNull();

    const cyclic = ctxFrom(
      {
        a: { basis: "EVENT", anchorEventId: "b", offset: 1 },
        b: { basis: "EVENT", anchorEventId: "a", offset: 1 },
      },
      {},
    );
    expect(
      resolveAbsoluteDay({ basis: "EVENT", anchorEventId: "a", offset: 0 }, cyclic),
    ).toBeNull();
  });
});

describe("computeFloorDayRanges", () => {
  it("infers a floor range from an absolute event and an EVENT-relative one", () => {
    // The DM's case: A on day 0, B "2 days after A", both on floor 1.
    const ranges = computeFloorDayRanges(
      [
        { id: "a", floor: 1, time: { basis: "COLLAPSE", offset: 0 } },
        { id: "b", floor: 1, time: { basis: "EVENT", anchorEventId: "a", offset: 2 } },
      ],
      new Map(),
    );
    expect(ranges.get(1)).toEqual({ min: 0, max: 2 });
  });

  it("bounds a floor's close at the next floor's open day", () => {
    const anchors = new Map<number, FloorAnchors>([
      [1, { startDay: 0, collapseDay: null }],
      [2, { startDay: 5, collapseDay: null }],
    ]);
    const ranges = computeFloorDayRanges(
      [{ id: "a", floor: 1, time: { basis: "COLLAPSE", offset: 1 } }],
      anchors,
    );
    // Floor 1 opens day 0, has an event on day 1, and runs until floor 2 opens
    // (day 5) → it spans days 0–4.
    expect(ranges.get(1)).toEqual({ min: 0, max: 4 });
  });

  it("uses floor anchors even when a floor has no events", () => {
    const anchors = new Map<number, FloorAnchors>([
      [9, { startDay: 40, collapseDay: 47 }],
    ]);
    const ranges = computeFloorDayRanges([], anchors);
    expect(ranges.get(9)).toEqual({ min: 40, max: 47 });
  });

  it("omits floors with nothing resolvable", () => {
    const ranges = computeFloorDayRanges(
      [{ id: "a", floor: 3, time: { basis: "UNSCHEDULED" } }],
      new Map(),
    );
    expect(ranges.has(3)).toBe(false);
    // The next-floor bound never *creates* a range for an empty floor.
    const withNext = computeFloorDayRanges(
      [],
      new Map<number, FloorAnchors>([[2, { startDay: 5, collapseDay: null }]]),
    );
    expect(withNext.has(1)).toBe(false);
  });
});
