import { describe, expect, it } from "vitest";

import {
  buildTimeRef,
  floorRelativeSortKey,
  phraseTimeRef,
  readTimeRef,
} from "@/lib/time-ref";

describe("buildTimeRef", () => {
  it("infers FLOOR_START from a bare floor (pre-slice-2 forms)", () => {
    expect(buildTimeRef({ floor: 9 })).toEqual({ basis: "FLOOR_START", floor: 9 });
  });

  it("infers UNSCHEDULED when there is no floor or basis", () => {
    expect(buildTimeRef({ label: "someday" })).toEqual({
      basis: "UNSCHEDULED",
      label: "someday",
    });
  });

  it("keeps an offset + unit for offset-bearing bases, defaulting the unit", () => {
    expect(buildTimeRef({ basis: "FLOOR_START", floor: 9, offset: 3 })).toEqual({
      basis: "FLOOR_START",
      floor: 9,
      offset: 3,
      unit: "DAY",
    });
    expect(
      buildTimeRef({ basis: "FLOOR_COLLAPSE", floor: 9, offset: 12, unit: "HOUR" }),
    ).toEqual({ basis: "FLOOR_COLLAPSE", floor: 9, offset: 12, unit: "HOUR" });
  });

  it("drops the offset for UNSCHEDULED and the anchor unless EVENT", () => {
    expect(buildTimeRef({ basis: "UNSCHEDULED", offset: 3 })).toEqual({
      basis: "UNSCHEDULED",
    });
    expect(
      buildTimeRef({ basis: "FLOOR_START", anchorEventId: "ev1" }),
    ).toEqual({ basis: "FLOOR_START" });
    expect(
      buildTimeRef({ basis: "EVENT", anchorEventId: "ev1", offset: -2 }),
    ).toEqual({ basis: "EVENT", anchorEventId: "ev1", offset: -2, unit: "DAY" });
  });

  it("trims and preserves a label override", () => {
    expect(buildTimeRef({ basis: "COLLAPSE", offset: 47, label: "  d47  " })).toEqual(
      { basis: "COLLAPSE", offset: 47, unit: "DAY", label: "d47" },
    );
  });
});

describe("readTimeRef", () => {
  it("reads a typed row back", () => {
    expect(readTimeRef({ basis: "FLOOR_COLLAPSE", floor: 9, offset: 12, unit: "HOUR" })).toEqual(
      { basis: "FLOOR_COLLAPSE", floor: 9, offset: 12, unit: "HOUR" },
    );
  });

  it("infers a basis for a legacy { floor, label } row", () => {
    expect(readTimeRef({ floor: 3, label: "Day 1" })).toEqual({
      basis: "FLOOR_START",
      floor: 3,
      label: "Day 1",
    });
  });

  it("treats junk / empty as UNSCHEDULED", () => {
    expect(readTimeRef(null)).toEqual({ basis: "UNSCHEDULED" });
    expect(readTimeRef([])).toEqual({ basis: "UNSCHEDULED" });
    expect(readTimeRef({})).toEqual({ basis: "UNSCHEDULED" });
  });

  it("upgrades a legacy ABSOLUTE_DAY row to COLLAPSE, keeping the offset", () => {
    // ABSOLUTE_DAY was merged into COLLAPSE (collapse = day 0), so stored rows
    // are normalized on read — no data migration needed, offset preserved.
    expect(readTimeRef({ basis: "ABSOLUTE_DAY", offset: 52, unit: "DAY" })).toEqual({
      basis: "COLLAPSE",
      offset: 52,
      unit: "DAY",
    });
    // A label override on a legacy row survives the upgrade (the terse "Day N"
    // wording the old basis produced lives on as a label).
    expect(readTimeRef({ basis: "ABSOLUTE_DAY", offset: 52, label: "Day 52" })).toEqual({
      basis: "COLLAPSE",
      offset: 52,
      unit: "DAY",
      label: "Day 52",
    });
  });
});

describe("phraseTimeRef", () => {
  it("lets a label override win", () => {
    expect(
      phraseTimeRef({ basis: "FLOOR_START", floor: 9, offset: 3, unit: "DAY", label: "Day 3" }),
    ).toBe("Day 3");
  });

  it("phrases floor-relative anchors", () => {
    expect(
      phraseTimeRef({ basis: "FLOOR_START", floor: 9, offset: 3, unit: "DAY" }),
    ).toBe("Floor 9 · 3 days in");
    expect(phraseTimeRef({ basis: "FLOOR_START", floor: 9 })).toBe("Floor 9");
    expect(
      phraseTimeRef({ basis: "FLOOR_COLLAPSE", floor: 9, offset: 12, unit: "HOUR" }),
    ).toBe("12 hours before Floor 9 falls");
  });

  it("phrases collapse anchors", () => {
    expect(phraseTimeRef({ basis: "COLLAPSE", offset: 47, unit: "DAY" })).toBe(
      "Day 47 since the collapse",
    );
  });

  it("phrases EVENT anchors with direction and the resolved title", () => {
    expect(
      phraseTimeRef(
        { basis: "EVENT", anchorEventId: "ev1", offset: -2, unit: "DAY" },
        { anchorTitle: "Carl's stunt" },
      ),
    ).toBe("2 days before Carl's stunt");
    expect(
      phraseTimeRef({ basis: "EVENT", anchorEventId: "ev1", offset: 3, unit: "HOUR" }),
    ).toBe("3 hours after another event");
    expect(
      phraseTimeRef({ basis: "EVENT", anchorEventId: "ev1" }, { anchorTitle: "the duel" }),
    ).toBe("after the duel");
  });

  it("covers floor-less and offset-less fallbacks per basis", () => {
    // FLOOR_START with an offset but no floor.
    expect(phraseTimeRef({ basis: "FLOOR_START", offset: 4, unit: "DAY" })).toBe(
      "4 days in",
    );
    // FLOOR_START with neither floor nor offset.
    expect(phraseTimeRef({ basis: "FLOOR_START" })).toBeNull();
    // FLOOR_COLLAPSE with only a floor, and with nothing.
    expect(phraseTimeRef({ basis: "FLOOR_COLLAPSE", floor: 9 })).toBe(
      "Floor 9 · before collapse",
    );
    expect(phraseTimeRef({ basis: "FLOOR_COLLAPSE" })).toBeNull();
    // COLLAPSE with only a floor for context, and with nothing.
    expect(phraseTimeRef({ basis: "COLLAPSE", floor: 2 })).toBe("Floor 2");
    expect(phraseTimeRef({ basis: "COLLAPSE" })).toBeNull();
    // COLLAPSE in a non-day unit.
    expect(phraseTimeRef({ basis: "COLLAPSE", offset: 6, unit: "HOUR" })).toBe(
      "6 hours since the collapse",
    );
  });

  it("returns null when there is nothing to show", () => {
    expect(phraseTimeRef({ basis: "UNSCHEDULED" })).toBeNull();
    expect(phraseTimeRef({ basis: "UNSCHEDULED", floor: 4 })).toBe("Floor 4");
  });
});

describe("floorRelativeSortKey", () => {
  it("derives a position only for floor-relative bases with an offset", () => {
    expect(floorRelativeSortKey({ basis: "FLOOR_START", floor: 9, offset: 3 })).toEqual({
      basis: "FLOOR_START",
      position: 3,
    });
    // FLOOR_COLLAPSE counts down: more time remaining is earlier => smaller position.
    expect(floorRelativeSortKey({ basis: "FLOOR_COLLAPSE", floor: 9, offset: 12 })).toEqual({
      basis: "FLOOR_COLLAPSE",
      position: -12,
    });
  });

  it("is null for non-derivable bases or a missing offset", () => {
    expect(floorRelativeSortKey({ basis: "FLOOR_START", floor: 9 })).toBeNull();
    expect(floorRelativeSortKey({ basis: "COLLAPSE", offset: 5 })).toBeNull();
    expect(floorRelativeSortKey({ basis: "EVENT", anchorEventId: "x", offset: 1 })).toBeNull();
    expect(floorRelativeSortKey({ basis: "UNSCHEDULED" })).toBeNull();
  });
});
