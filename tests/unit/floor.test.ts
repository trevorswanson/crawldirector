import { describe, expect, it } from "vitest";

import { effectiveFloorStartDay, readFloorData } from "@/lib/floor";

describe("readFloorData", () => {
  it("parses a well-formed FLOOR data blob", () => {
    expect(
      readFloorData({ floorNumber: 3, theme: "Neon bazaar", startDay: 12, collapseDay: 20 }),
    ).toEqual({ floorNumber: 3, theme: "Neon bazaar", startDay: 12, collapseDay: 20 });
  });

  it("normalizes missing / wrong-typed fields to null", () => {
    expect(readFloorData(null)).toEqual({
      floorNumber: null,
      theme: null,
      startDay: null,
      collapseDay: null,
    });
    expect(readFloorData({ floorNumber: "1", theme: "", startDay: "x" })).toEqual({
      floorNumber: null,
      theme: null,
      startDay: null,
      collapseDay: null,
    });
  });

  it("stays a faithful parser: an unset floor-1 startDay reads as null (no default)", () => {
    expect(readFloorData({ floorNumber: 1 }).startDay).toBeNull();
  });
});

describe("effectiveFloorStartDay", () => {
  it("returns an explicit startDay unchanged for any floor", () => {
    expect(effectiveFloorStartDay(1, 5)).toBe(5);
    expect(effectiveFloorStartDay(9, 40)).toBe(40);
    expect(effectiveFloorStartDay(1, 0)).toBe(0);
  });

  it("defaults floor 1 to day 1 only when its startDay is unset", () => {
    expect(effectiveFloorStartDay(1, null)).toBe(1);
  });

  it("leaves deeper floors with no anchor unresolved (null)", () => {
    expect(effectiveFloorStartDay(2, null)).toBeNull();
    expect(effectiveFloorStartDay(null, null)).toBeNull();
  });
});
