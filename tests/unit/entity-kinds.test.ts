import { describe, expect, it } from "vitest";

import { FLOOR_KIND, floorDataSchema } from "@/lib/entity-kinds/floor";
import {
  allKindDataKeys,
  dataKeysFor,
  kindFor,
} from "@/lib/entity-kinds";

describe("entity-kind registry (ADR 0009)", () => {
  it("resolves the FLOOR descriptor by type", () => {
    expect(kindFor("FLOOR")).toBe(FLOOR_KIND);
    expect(FLOOR_KIND.dataSchema).toBe(floorDataSchema);
  });

  it("returns undefined for a type with no bespoke kind", () => {
    expect(kindFor("NPC")).toBeUndefined();
    expect(kindFor("CRAWLER")).toBeUndefined();
  });

  it("derives FLOOR's data keys from the descriptor schema", () => {
    expect(dataKeysFor("FLOOR")).toEqual([
      "floorNumber",
      "theme",
      "startDay",
      "collapseDay",
    ]);
  });

  it("returns an empty key list for a type with no kind", () => {
    expect(dataKeysFor("LOCATION")).toEqual([]);
  });

  it("unions every registered kind's data keys", () => {
    // FLOOR is the only registered kind in slice 1.
    expect(allKindDataKeys()).toEqual([
      "floorNumber",
      "theme",
      "startDay",
      "collapseDay",
    ]);
  });

  it("validates bespoke FLOOR fields through the descriptor schema", () => {
    const parsed = floorDataSchema.parse({
      floorNumber: "9",
      theme: "  Castle siege  ",
      startDay: "0",
      collapseDay: "12",
    });
    expect(parsed).toEqual({
      floorNumber: 9,
      theme: "Castle siege",
      startDay: 0,
      collapseDay: 12,
    });
  });

  it("rejects a floor number below 1", () => {
    expect(() => floorDataSchema.parse({ floorNumber: "0" })).toThrow();
  });
});
