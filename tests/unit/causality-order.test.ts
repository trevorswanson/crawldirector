import { describe, expect, it } from "vitest";

import { orderFromCausality, type OrderableEvent } from "@/lib/causality-order";

// Helper: an event at a floor (`orderKey`) + intra-floor `rank`, movable by
// default, optionally causing the named effects.
function ev(
  id: string,
  orderKey: number,
  rank: string,
  causes: string[] = [],
  movable = true,
): OrderableEvent {
  return { id, orderKey, rank, movable, causes: causes.map((effectId) => ({ id: effectId })) };
}

// Apply the returned rank updates to a copy and return the resulting fiction
// order (ascending rank, earliest first) for a single floor.
function fictionOrderAfter(events: OrderableEvent[], floor: number): string[] {
  const updates = new Map(orderFromCausality(events).map((u) => [u.id, u.rank]));
  return events
    .filter((event) => event.orderKey === floor)
    .map((event) => ({ id: event.id, rank: updates.get(event.id) ?? event.rank }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    .map((event) => event.id);
}

describe("orderFromCausality", () => {
  it("returns no updates when the floor is already causally ordered", () => {
    // a (rank "a0", earlier) causes b (rank "a1", later) — consistent.
    const events = [ev("a", 1, "a0", ["b"]), ev("b", 1, "a1")];
    expect(orderFromCausality(events)).toEqual([]);
  });

  it("reorders an inverted pair so the cause precedes its effect", () => {
    // c (rank "a1", later in fiction) causes a (rank "a0", earlier) — the effect
    // is currently before its cause. After ordering, c must come before a.
    const events = [ev("a", 1, "a0"), ev("c", 1, "a1", ["a"])];
    const updates = orderFromCausality(events);
    expect(updates.length).toBeGreaterThan(0);
    expect(fictionOrderAfter(events, 1)).toEqual(["c", "a"]);
  });

  it("honours a causal chain across three events on a floor", () => {
    // Current order a, b, c; links force c → b → a, so the result reverses them.
    const events = [
      ev("a", 1, "a0"),
      ev("b", 1, "a1", ["a"]),
      ev("c", 1, "a2", ["b"]),
    ];
    expect(fictionOrderAfter(events, 1)).toEqual(["c", "b", "a"]);
  });

  it("only rewrites ranks of movable events, never pinned ones", () => {
    // b is pinned (locked or system-derived order). a (movable) causes b, but a
    // currently sorts after b — a must move before b, and b's rank is untouched.
    const a = ev("a", 1, "a1", ["b"]);
    const b = ev("b", 1, "a0", [], false); // pinned, rank "a0"
    const updates = orderFromCausality([a, b]);
    expect(updates.map((u) => u.id)).toEqual(["a"]); // only a moved
    expect(updates.find((u) => u.id === "b")).toBeUndefined();
    // a's new rank sorts before the pinned b's fixed "a0".
    const aRank = updates.find((u) => u.id === "a")!.rank;
    expect(aRank < "a0").toBe(true);
  });

  it("keeps pinned events in their current relative order", () => {
    // Two pinned events p1 (rank "a0") and p2 (rank "a2") bracket a movable m
    // (rank "a3") that p2 causes — m flows into the gap after p2.
    const p1 = ev("p1", 1, "a0", [], false);
    const p2 = ev("p2", 1, "a2", ["m"], false);
    const m = ev("m", 1, "a3");
    expect(fictionOrderAfter([p1, p2, m], 1)).toEqual(["p1", "p2", "m"]);
  });

  it("leaves a floor untouched when the contradiction is between two pinned events", () => {
    // Pinned q (later) causes pinned p (earlier): an inversion the reorder can't
    // fix without moving a pinned event, so nothing changes (the warning stands).
    const p = ev("p", 1, "a0", [], false);
    const q = ev("q", 1, "a1", ["p"], false);
    expect(orderFromCausality([p, q])).toEqual([]);
  });

  it("orders each floor independently (no cross-floor moves)", () => {
    // Floor 1 inverted, floor 2 already fine. Only floor 1's ranks change.
    const events = [
      ev("a1", 1, "a0"),
      ev("c1", 1, "a1", ["a1"]),
      ev("x2", 2, "a0", ["y2"]),
      ev("y2", 2, "a1"),
    ];
    const updates = orderFromCausality(events);
    const movedIds = new Set(updates.map((u) => u.id));
    expect(movedIds.has("x2")).toBe(false);
    expect(movedIds.has("y2")).toBe(false);
    expect(fictionOrderAfter(events, 1)).toEqual(["c1", "a1"]);
    expect(fictionOrderAfter(events, 2)).toEqual(["x2", "y2"]);
  });

  it("ignores causal edges to events outside the set / on another floor", () => {
    // a's only causal edge points to a missing/cross-floor effect; nothing to do.
    const events = [ev("a", 1, "a1", ["gone"]), ev("b", 1, "a0")];
    expect(orderFromCausality(events)).toEqual([]);
  });

  it("is a no-op for a single-event floor", () => {
    expect(orderFromCausality([ev("solo", 7, "a0", ["solo"])])).toEqual([]);
  });
});
