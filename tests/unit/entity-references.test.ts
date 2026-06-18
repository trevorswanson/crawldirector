import { describe, expect, it } from "vitest";

import { RESERVED_DATA_KEY } from "@/lib/entity-kinds";
import {
  entityReferences,
  reverseReferenceFields,
} from "@/lib/entity-references";

describe("entity-references (ADR 0011 Part B)", () => {
  describe("entityReferences", () => {
    it("returns the set reference fields for a type that declares them", () => {
      const refs = entityReferences("ITEM", {
        itemTypeId: "it1",
        [RESERVED_DATA_KEY]: 1,
      });
      expect(refs).toEqual([
        {
          field: "itemTypeId",
          patchKey: "data.itemTypeId",
          targetType: "ITEM_TYPE",
          targetId: "it1",
        },
      ]);
    });

    it("omits an unset / empty / null reference field", () => {
      expect(entityReferences("ITEM", { itemTypeId: null })).toEqual([]);
      expect(entityReferences("ITEM", { itemTypeId: "" })).toEqual([]);
      expect(entityReferences("ITEM", {})).toEqual([]);
    });

    it("omits a non-string reference value (corrupt data)", () => {
      expect(entityReferences("ITEM", { itemTypeId: 42 })).toEqual([]);
    });

    it("returns [] for a type with no reference fields", () => {
      expect(entityReferences("FLOOR", { floorNumber: 9 })).toEqual([]);
      expect(entityReferences("NPC", { itemTypeId: "it1" })).toEqual([]);
    });

    it("reads through the versioned seam (off-schema keys ignored)", () => {
      const refs = entityReferences("ITEM", {
        itemTypeId: "it1",
        bogusKey: "x",
      });
      expect(refs.map((r) => r.field)).toEqual(["itemTypeId"]);
    });
  });

  describe("reverseReferenceFields", () => {
    it("finds the fields that point at a given target type", () => {
      expect(reverseReferenceFields("ITEM_TYPE")).toEqual([
        { type: "ITEM", field: "itemTypeId" },
      ]);
    });

    it("returns [] for a type nothing references", () => {
      expect(reverseReferenceFields("ITEM")).toEqual([]);
      expect(reverseReferenceFields("NPC")).toEqual([]);
    });
  });
});
