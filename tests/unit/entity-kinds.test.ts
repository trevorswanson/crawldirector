import { describe, expect, it } from "vitest";

import { FLOOR_KIND, floorDataSchema } from "@/lib/entity-kinds/floor";
import { ITEM_KIND, itemDataSchema } from "@/lib/entity-kinds/item";
import {
  allKindDataKeys,
  allKindDataShape,
  dataKeysFor,
  kindDataDefaults,
  kindFor,
} from "@/lib/entity-kinds";

describe("entity-kind registry (ADR 0009)", () => {
  it("resolves the FLOOR and ITEM descriptors by type", () => {
    expect(kindFor("FLOOR")).toBe(FLOOR_KIND);
    expect(FLOOR_KIND.dataSchema).toBe(floorDataSchema);
    expect(kindFor("ITEM")).toBe(ITEM_KIND);
    expect(ITEM_KIND.dataSchema).toBe(itemDataSchema);
  });

  it("returns undefined for a type with no bespoke kind", () => {
    expect(kindFor("NPC")).toBeUndefined();
    expect(kindFor("CRAWLER")).toBeUndefined();
  });

  it("derives each type's data keys from its descriptor schema", () => {
    expect(dataKeysFor("FLOOR")).toEqual([
      "floorNumber",
      "theme",
      "startDay",
      "collapseDay",
    ]);
    expect(dataKeysFor("ITEM")).toEqual([
      "itemTypeId",
      "divine",
      "unique",
      "fleeting",
      "aiDescription",
    ]);
  });

  it("returns an empty key list for a type with no kind", () => {
    expect(dataKeysFor("LOCATION")).toEqual([]);
  });

  it("unions every registered kind's data keys (ITEM then FLOOR)", () => {
    expect(allKindDataKeys()).toEqual([
      "itemTypeId",
      "divine",
      "unique",
      "fleeting",
      "aiDescription",
      "floorNumber",
      "theme",
      "startDay",
      "collapseDay",
    ]);
  });

  it("merges every kind's data shape for the write schemas", () => {
    expect(Object.keys(allKindDataShape()).sort()).toEqual(
      [...dataKeysFor("ITEM"), ...dataKeysFor("FLOOR")].sort(),
    );
  });

  it("declares boolean-flag defaults for ITEM and none for FLOOR", () => {
    expect(kindDataDefaults("ITEM")).toEqual({
      divine: false,
      unique: false,
      fleeting: false,
    });
    expect(kindDataDefaults("FLOOR")).toEqual({});
    expect(kindDataDefaults("LOCATION")).toEqual({});
  });

  it("normalizes ITEM flags and trims text through the descriptor schema", () => {
    const parsed = itemDataSchema.parse({
      itemTypeId: "  weapon-1  ",
      divine: "true",
      unique: "on",
      fleeting: "",
      aiDescription: "A blade of legend.",
    });
    expect(parsed).toEqual({
      itemTypeId: "weapon-1",
      divine: true,
      unique: true,
      fleeting: undefined,
      aiDescription: "A blade of legend.",
    });
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
