import { describe, expect, it } from "vitest";

import { z } from "zod";

import { FLOOR_KIND, floorDataSchema } from "@/lib/entity-kinds/floor";
import { ITEM_KIND, itemDataSchema } from "@/lib/entity-kinds/item";
import {
  allKindDataKeys,
  allKindDataShape,
  applyDataMigrations,
  assertKindInvariants,
  buildKindData,
  dataKeysFor,
  kindDataDefaults,
  kindFor,
  normalizeKindFieldValue,
  readKindData,
  RESERVED_DATA_KEY,
  schemaVersionFor,
} from "@/lib/entity-kinds";
import type { EntityKind } from "@/lib/entity-kinds";

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

  describe("canonical data normalization (slice 3)", () => {
    it("normalizes a string field, defaulting empty/wrong-typed to null", () => {
      expect(normalizeKindFieldValue("itemTypeId", "weapon-1")).toBe("weapon-1");
      expect(normalizeKindFieldValue("itemTypeId", "")).toBeNull();
      expect(normalizeKindFieldValue("itemTypeId", undefined)).toBeNull();
      expect(normalizeKindFieldValue("aiDescription", 42)).toBeNull();
      expect(normalizeKindFieldValue("theme", "Castle")).toBe("Castle");
    });

    it("normalizes a number field, defaulting empty/wrong-typed to null", () => {
      expect(normalizeKindFieldValue("floorNumber", 9)).toBe(9);
      expect(normalizeKindFieldValue("floorNumber", "9")).toBeNull();
      expect(normalizeKindFieldValue("startDay", 0)).toBe(0);
      expect(normalizeKindFieldValue("collapseDay", undefined)).toBeNull();
    });

    it("normalizes a boolean flag, defaulting empty/wrong-typed to false", () => {
      expect(normalizeKindFieldValue("divine", true)).toBe(true);
      expect(normalizeKindFieldValue("unique", false)).toBe(false);
      expect(normalizeKindFieldValue("fleeting", undefined)).toBe(false);
      expect(normalizeKindFieldValue("divine", "true")).toBe(false);
    });

    it("returns null for a field no kind declares", () => {
      expect(normalizeKindFieldValue("nonexistent", "x")).toBeNull();
    });

    it("builds the full data object for a type, normalizing each field", () => {
      const read = (key: string) =>
        ({ itemTypeId: "weapon-1", divine: true, aiDescription: "Legend." }[key]);
      expect(buildKindData("ITEM", read)).toEqual({
        itemTypeId: "weapon-1",
        divine: true,
        unique: false,
        fleeting: false,
        aiDescription: "Legend.",
        [RESERVED_DATA_KEY]: 1,
      });
    });

    it("builds only a FLOOR's own fields (no spurious ITEM keys)", () => {
      const data = buildKindData("FLOOR", (key) =>
        ({ floorNumber: 9, theme: "Siege" }[key]),
      );
      expect(data).toEqual({
        floorNumber: 9,
        theme: "Siege",
        startDay: null,
        collapseDay: null,
        [RESERVED_DATA_KEY]: 1,
      });
      expect(data).not.toHaveProperty("divine");
    });

    it("builds an empty (unstamped) data object for a type with no kind", () => {
      expect(buildKindData("NPC", () => "ignored")).toEqual({});
    });
  });

  describe("schema versioning + read seam (ADR 0011)", () => {
    it("reports each kind's schema version (1 for a type with no kind)", () => {
      expect(schemaVersionFor("FLOOR")).toBe(1);
      expect(schemaVersionFor("ITEM")).toBe(1);
      expect(schemaVersionFor("LOCATION")).toBe(1);
    });

    it("stamps the reserved _v on every write but never as a declared field", () => {
      expect(buildKindData("ITEM", () => undefined)[RESERVED_DATA_KEY]).toBe(1);
      expect(dataKeysFor("ITEM")).not.toContain(RESERVED_DATA_KEY);
      expect(dataKeysFor("FLOOR")).not.toContain(RESERVED_DATA_KEY);
      expect(allKindDataKeys()).not.toContain(RESERVED_DATA_KEY);
    });

    it("reads a stored blob back to its canonical shape, dropping _v", () => {
      const stored = {
        floorNumber: 9,
        theme: "Siege",
        startDay: 0,
        collapseDay: 12,
        [RESERVED_DATA_KEY]: 1,
      };
      expect(readKindData("FLOOR", stored)).toEqual({
        floorNumber: 9,
        theme: "Siege",
        startDay: 0,
        collapseDay: 12,
      });
    });

    it("normalizes missing/wrong-typed fields and a legacy (unstamped) row", () => {
      // No _v stamp (a pre-versioning row) is treated as v1; absent/wrong-typed
      // fields fall to their canonical empty default, never throwing on read.
      expect(readKindData("ITEM", { divine: "true", itemTypeId: 42 })).toEqual({
        itemTypeId: null,
        divine: false,
        unique: false,
        fleeting: false,
        aiDescription: null,
      });
    });

    it("drops stale/off-schema keys not declared by the descriptor", () => {
      const out = readKindData("FLOOR", { floorNumber: 3, retired: "gone" });
      expect(out).not.toHaveProperty("retired");
      expect(out.floorNumber).toBe(3);
    });

    it("returns {} for a non-object blob or a type with no kind", () => {
      expect(readKindData("FLOOR", null)).toEqual({
        floorNumber: null,
        theme: null,
        startDay: null,
        collapseDay: null,
      });
      expect(readKindData("FLOOR", [1, 2, 3])).toEqual({
        floorNumber: null,
        theme: null,
        startDay: null,
        collapseDay: null,
      });
      expect(readKindData("NPC", { anything: 1 })).toEqual({});
    });
  });

  describe("migration chaining (ADR 0011)", () => {
    const bumpX: (d: Record<string, unknown>) => Record<string, unknown> = (d) => ({
      ...d,
      x: ((d.x as number) ?? 0) + 1,
    });

    it("applies each step in order from the stored version up to the target", () => {
      const result = applyDataMigrations({ x: 0 }, [bumpX, bumpX], 1, 3);
      expect(result.x).toBe(2);
    });

    it("is a no-op when already at or above the target version", () => {
      expect(applyDataMigrations({ x: 5 }, [bumpX], 2, 2)).toEqual({ x: 5 });
      expect(applyDataMigrations({ x: 5 }, [bumpX], 3, 2)).toEqual({ x: 5 });
    });

    it("starts from the stored version, skipping already-applied steps", () => {
      // from v2 → v3 of a 3-version chain applies only migrations[1].
      const result = applyDataMigrations({ x: 9 }, [bumpX, bumpX], 2, 3);
      expect(result.x).toBe(10);
    });

    it("coerces a step's non-object return back to a record", () => {
      const drop = () => undefined as unknown as Record<string, unknown>;
      expect(applyDataMigrations({ x: 1 }, [drop], 1, 2)).toEqual({});
    });
  });

  describe("descriptor invariants (ADR 0011)", () => {
    it("accepts a well-formed v1 descriptor", () => {
      expect(() => assertKindInvariants(FLOOR_KIND)).not.toThrow();
      expect(() => assertKindInvariants(ITEM_KIND)).not.toThrow();
    });

    it("rejects a version bump that forgot its migration", () => {
      const bad: EntityKind = {
        type: "BAD",
        dataSchema: z.object({ a: z.string().optional() }),
        schemaVersion: 2,
      };
      expect(() => assertKindInvariants(bad)).toThrow(/requires 1 migration/);
    });

    it("rejects a descriptor that shadows the reserved _v key", () => {
      const bad: EntityKind = {
        type: "BAD",
        dataSchema: z.object({ [RESERVED_DATA_KEY]: z.string().optional() }),
      };
      expect(() => assertKindInvariants(bad)).toThrow(/reserved data key/);
    });
  });
});
