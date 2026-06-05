import { describe, expect, it } from "vitest";

import {
  FIRST_RANK,
  generateRankBetween,
  generateRanksAfter,
} from "@/lib/rank";

describe("generateRankBetween", () => {
  it("seeds the first rank from two open ends", () => {
    expect(generateRankBetween(null, null)).toBe(FIRST_RANK);
  });

  it("appends after the last rank in increasing order", () => {
    const a = generateRankBetween(null, null);
    const b = generateRankBetween(a, null);
    const c = generateRankBetween(b, null);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it("prepends before the first rank in decreasing order", () => {
    const a = generateRankBetween(null, null);
    const before = generateRankBetween(null, a);
    expect(before < a).toBe(true);
  });

  it("inserts strictly between two adjacent ranks", () => {
    const a = generateRankBetween(null, null);
    const b = generateRankBetween(a, null);
    const mid = generateRankBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  it("supports repeated midpoint inserts without collision", () => {
    let low = generateRankBetween(null, null);
    let high = generateRankBetween(low, null);
    const seen = new Set([low, high]);
    for (let i = 0; i < 50; i++) {
      const mid = generateRankBetween(low, high);
      expect(low < mid).toBe(true);
      expect(mid < high).toBe(true);
      expect(seen.has(mid)).toBe(false);
      seen.add(mid);
      // Alternate which side we keep so we exercise both halves.
      if (i % 2 === 0) high = mid;
      else low = mid;
    }
  });

  it("keeps a long appended sequence globally sorted", () => {
    const ranks: string[] = [];
    let previous: string | null = null;
    for (let i = 0; i < 200; i++) {
      previous = generateRankBetween(previous, null);
      ranks.push(previous);
    }
    const sorted = [...ranks].sort();
    expect(ranks).toEqual(sorted);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("prepends below the first integer bucket and stays sorted", () => {
    // Dropping repeatedly to the very top of a floor walks below "a0", which
    // exercises the integer-decrement / upper-case-head path.
    const ranks: string[] = [];
    let smallest: string | null = generateRankBetween(null, null);
    ranks.push(smallest);
    for (let i = 0; i < 80; i++) {
      smallest = generateRankBetween(null, smallest);
      ranks.push(smallest);
    }
    const sorted = [...ranks].sort();
    // The list was built smallest-last, so reversing gives ascending order.
    expect([...ranks].reverse()).toEqual(sorted);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("returns an integer key when one fits in the gap", () => {
    // a and b two integers apart: the midpoint is the integer between them.
    const a = generateRankBetween(null, null); // "a0"
    const c = generateRankBetween(generateRankBetween(a, null), null); // "a2"
    const between = generateRankBetween(a, c);
    expect(a < between).toBe(true);
    expect(between < c).toBe(true);
  });

  it("inserts between two deeply-nested adjacent ranks", () => {
    let a = generateRankBetween(null, null);
    let b = generateRankBetween(a, null);
    // Collapse the gap repeatedly so the fractional parts grow long.
    for (let i = 0; i < 30; i++) {
      const mid = generateRankBetween(a, b);
      a = mid;
      b = generateRankBetween(mid, b);
    }
    expect(a < b).toBe(true);
    expect(generateRankBetween(a, b)).not.toBe(a);
  });

  it("picks a single-digit midpoint when first digits are consecutive", () => {
    const between = generateRankBetween("a01", "a021");
    expect("a01" < between).toBe(true);
    expect(between < "a021").toBe(true);
  });

  it("appends past an exhausted upper-case integer bucket", () => {
    const exhausted = `A${"z".repeat(26)}`;
    const next = generateRankBetween(exhausted, null);
    expect(exhausted < next).toBe(true);
  });

  it("prepends below a multi-length integer bucket", () => {
    const below = generateRankBetween(null, "b00");
    expect(below < "b00").toBe(true);
  });

  it("throws when the bounds are out of order", () => {
    const a = generateRankBetween(null, null);
    const b = generateRankBetween(a, null);
    expect(() => generateRankBetween(b, a)).toThrow();
    expect(() => generateRankBetween(a, a)).toThrow();
  });

  it("rejects a malformed rank input", () => {
    expect(() => generateRankBetween("", null)).toThrow();
    expect(() => generateRankBetween(null, "")).toThrow();
    // Bad integer head character.
    expect(() => generateRankBetween("!x", null)).toThrow();
    // Integer part shorter than its head declares.
    expect(() => generateRankBetween("z", null)).toThrow();
    // Fractional part ending in a zero digit is not a canonical rank.
    expect(() => generateRankBetween("a00", null)).toThrow();
  });
});

describe("generateRanksAfter", () => {
  it("returns the requested count in ascending order", () => {
    const ranks = generateRanksAfter(null, 5);
    expect(ranks).toHaveLength(5);
    expect([...ranks].sort()).toEqual(ranks);
    expect(new Set(ranks).size).toBe(5);
  });

  it("continues past an existing rank", () => {
    const first = generateRanksAfter(null, 3);
    const more = generateRanksAfter(first.at(-1) ?? null, 3);
    expect(more[0] > (first.at(-1) ?? "")).toBe(true);
    expect([...first, ...more].sort()).toEqual([...first, ...more]);
  });

  it("returns an empty array for a non-positive count", () => {
    expect(generateRanksAfter(null, 0)).toEqual([]);
  });
});
