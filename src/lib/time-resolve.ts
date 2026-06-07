// Absolute-day resolution for event times (ADR 0008). DCC has no calendar, but
// when enough anchors exist we can place an event on a single "days since the
// collapse" axis and infer per-floor day-ranges for the timeline. This is a pure
// module: it takes event time references plus per-floor open/collapse anchors and
// computes absolute days. It powers two things: the inferred per-floor day-ranges
// shown on the timeline, and — when an event resolves to a concrete day — its
// intra-floor `rank` derivation (review.ts), so a time-anchored event sorts by
// *when it happens*, not when it was logged. The coarse order (the floor /
// `orderKey`) stays floor-derived (ADR 0004); this only refines the within-floor
// order, and an event that can't be placed keeps its manual rank.
//
// Resolution walks the basis graph:
//   ABSOLUTE_DAY / COLLAPSE  → the offset is the day directly
//   EVENT                    → resolve(anchor event) + offset   (recursive)
//   FLOOR_START              → floor.startDay   + offset         (needs anchor)
//   FLOOR_COLLAPSE           → floor.collapseDay − offset        (needs anchor)
//   UNSCHEDULED / unresolved → null (contributes nothing)
// EVENT chains are cycle-guarded and memo-free recursion with a visited set; an
// anchor that itself can't resolve yields null rather than throwing.

import type { TimeBasis, TimeUnit } from "@/lib/time-ref";

// The minimal shape the resolver reads — satisfied by both `TimeRef`
// (time-ref.ts) and the projected `EventTimeInfo` (events.ts), so callers pass
// either without adapting.
export type ResolvableTime = {
  basis: TimeBasis;
  floor?: number | null;
  offset?: number | null;
  unit?: TimeUnit | null;
  anchorEventId?: string | null;
};

export type FloorAnchors = {
  startDay: number | null;
  collapseDay: number | null;
};

export type ResolveContext = {
  // The time reference of an EVENT-basis anchor, by event id.
  eventTimeById: (eventId: string) => ResolvableTime | undefined;
  // Open/collapse anchors for a floor number.
  floorAnchors: (floor: number) => FloorAnchors | undefined;
};

// Day-granularity offset. We infer day *ranges*, so a sub-day offset
// (HOUR/MINUTE) resolves to the same day as its basis.
function dayOffset(time: ResolvableTime): number {
  if (typeof time.offset !== "number") return 0;
  if (time.unit === "HOUR" || time.unit === "MINUTE") return 0;
  return time.offset;
}

function resolve(
  time: ResolvableTime,
  ctx: ResolveContext,
  visited: ReadonlySet<string>,
): number | null {
  switch (time.basis) {
    case "ABSOLUTE_DAY":
    case "COLLAPSE":
      return typeof time.offset === "number" ? time.offset : null;
    case "FLOOR_START": {
      if (time.floor == null) return null;
      const anchors = ctx.floorAnchors(time.floor);
      if (!anchors || anchors.startDay == null) return null;
      return anchors.startDay + dayOffset(time);
    }
    case "FLOOR_COLLAPSE": {
      if (time.floor == null) return null;
      const anchors = ctx.floorAnchors(time.floor);
      if (!anchors || anchors.collapseDay == null) return null;
      return anchors.collapseDay - dayOffset(time);
    }
    case "EVENT": {
      const anchorId = time.anchorEventId;
      // Missing anchor or a cycle (A→B→A) is unresolvable, not an error.
      if (!anchorId || visited.has(anchorId)) return null;
      const anchorTime = ctx.eventTimeById(anchorId);
      if (!anchorTime) return null;
      const next = new Set(visited);
      next.add(anchorId);
      const base = resolve(anchorTime, ctx, next);
      if (base == null) return null;
      return base + dayOffset(time);
    }
    case "UNSCHEDULED":
    default:
      return null;
  }
}

// Resolve an event time to an absolute day-since-collapse, or null when it can't
// be placed on the absolute axis with the anchors available.
export function resolveAbsoluteDay(
  time: ResolvableTime,
  ctx: ResolveContext,
): number | null {
  return resolve(time, ctx, new Set());
}

export type DayRange = { min: number; max: number };

// Compute each floor's inferred absolute day-range from its events plus its own
// open/collapse anchors, bounding the close at the next floor's open day so the
// floor-1→N chain fills in (ADR 0008). A floor with nothing resolvable is absent
// from the result (no range shown).
export function computeFloorDayRanges(
  events: ReadonlyArray<{ id: string; floor: number; time: ResolvableTime }>,
  floorAnchorsByNumber: ReadonlyMap<number, FloorAnchors>,
): Map<number, DayRange> {
  const timeById = new Map<string, ResolvableTime>();
  for (const event of events) timeById.set(event.id, event.time);

  const ctx: ResolveContext = {
    eventTimeById: (id) => timeById.get(id),
    floorAnchors: (floor) => floorAnchorsByNumber.get(floor),
  };

  // Collect the resolvable days each floor can claim from its own anchors and
  // events. The next-floor bound is applied afterward so it never *creates* a
  // range for an otherwise-empty floor.
  const daysByFloor = new Map<number, number[]>();
  const push = (floor: number, day: number | null) => {
    if (day == null) return;
    const list = daysByFloor.get(floor);
    if (list) list.push(day);
    else daysByFloor.set(floor, [day]);
  };

  for (const [floor, anchors] of floorAnchorsByNumber) {
    push(floor, anchors.startDay);
    push(floor, anchors.collapseDay);
  }
  for (const event of events) {
    push(event.floor, resolveAbsoluteDay(event.time, ctx));
  }

  const ranges = new Map<number, DayRange>();
  for (const [floor, days] of daysByFloor) {
    let min = days[0];
    let max = days[0];
    for (const day of days) {
      if (day < min) min = day;
      if (day > max) max = day;
    }
    // The floor runs until the next floor opens, if that's known and later.
    const nextStart = floorAnchorsByNumber.get(floor + 1)?.startDay;
    if (nextStart != null && nextStart - 1 > max) max = nextStart - 1;
    ranges.set(floor, { min, max });
  }
  return ranges;
}
