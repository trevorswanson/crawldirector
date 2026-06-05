import { describe, expect, it } from "vitest";

import { findCausalityWarnings, type CausalityCheckEvent } from "@/lib/causality";

// Helper: an event at a floor (`orderKey`) + intra-floor `rank`, optionally
// causing the named effects.
function ev(
  id: string,
  orderKey: number,
  rank: string,
  causes: { id: string; linkId: string }[] = [],
): CausalityCheckEvent {
  return { id, orderKey, rank, causes };
}

describe("findCausalityWarnings", () => {
  it("returns no warnings when every cause precedes its effect", () => {
    const events = [
      // cause on Floor 1, effect on Floor 2 — consistent (cause earlier).
      ev("a", 1, "m", [{ id: "b", linkId: "l1" }]),
      ev("b", 2, "m"),
    ];
    expect(findCausalityWarnings(events).size).toBe(0);
  });

  it("flags a link whose effect is on an earlier floor than its cause", () => {
    const events = [
      ev("a", 3, "m", [{ id: "b", linkId: "l1" }]), // cause on Floor 3
      ev("b", 1, "m"), // effect on Floor 1 — before its cause
    ];
    const warnings = findCausalityWarnings(events);
    expect(warnings.has("l1")).toBe(true);
    expect(warnings.size).toBe(1);
  });

  it("flags an intra-floor inversion via rank (same floor, effect ranks earlier)", () => {
    // Timeline sorts rank descending (later-in-fiction first), so a smaller rank
    // is earlier in fiction. Cause "z" > effect "a" ⇒ effect precedes cause.
    const events = [
      ev("a", 5, "z", [{ id: "b", linkId: "l1" }]),
      ev("b", 5, "a"),
    ];
    expect(findCausalityWarnings(events).has("l1")).toBe(true);
  });

  it("does not warn when cause and effect share the exact position (a tie)", () => {
    const events = [
      ev("a", 5, "m", [{ id: "b", linkId: "l1" }]),
      ev("b", 5, "m"),
    ];
    expect(findCausalityWarnings(events).size).toBe(0);
  });

  it("skips edges whose effect is not in the provided set (e.g. filtered out)", () => {
    const events = [ev("a", 9, "m", [{ id: "missing", linkId: "l1" }])];
    expect(findCausalityWarnings(events).size).toBe(0);
  });

  it("flags only the inconsistent link in a mixed chain", () => {
    const events = [
      ev("a", 1, "m", [{ id: "b", linkId: "ok" }]), // a → b, consistent
      ev("b", 2, "m", [{ id: "c", linkId: "bad" }]), // b → c, inconsistent
      ev("c", 1, "m"), // c is on an earlier floor than its cause b
    ];
    const warnings = findCausalityWarnings(events);
    expect(warnings.has("bad")).toBe(true);
    expect(warnings.has("ok")).toBe(false);
    expect(warnings.size).toBe(1);
  });
});
