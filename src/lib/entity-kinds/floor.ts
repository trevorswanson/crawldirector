import { z } from "zod";

import { optionalInt, optionalText } from "@/lib/zod-field-helpers";

import type { EntityKind } from "./types";

function numericStringToNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return value;
  return Number(trimmed);
}

/**
 * FLOOR-entity bespoke fields, stored in Entity.data (docs/adr/0005, 0008).
 *
 * floorNumber links a FLOOR entity to the events on that floor (Event.orderKey)
 * and powers the timeline's floor-band header + rail; theme is the one-line
 * flavour shown under the header. startDay/collapseDay are the absolute
 * days-since-collapse the floor opened / collapses — the anchors that let
 * FLOOR_START / FLOOR_COLLAPSE event times resolve to absolute days (ADR 0008).
 */
export const floorDataSchema = z.object({
  floorNumber: optionalInt("Floor number", 1),
  theme: optionalText(160),
  startDay: optionalInt("Floor start day"),
  collapseDay: optionalInt("Floor collapse day"),
});

export const FLOOR_KIND: EntityKind = {
  type: "FLOOR",
  dataSchema: floorDataSchema,
  // v1 stored the numeric floor anchors as the same semantic fields, but legacy
  // imports/direct JSON could leave them as strings. v2 makes the stored shape
  // converge to numbers before the descriptor's final normalization step. v3
  // (ADR 0011 Part C) relocates all four fields from Entity.data into the 1:1
  // Floor satellite — the genuine `data → satellite` migration (see below).
  schemaVersion: 3,
  migrations: [
    // v1 → v2: coerce legacy string anchors to numbers.
    (data) => ({
      ...data,
      floorNumber: numericStringToNumber(data.floorNumber),
      startDay: numericStringToNumber(data.startDay),
      collapseDay: numericStringToNumber(data.collapseDay),
    }),
    // v2 → v3: the fields move from Entity.data to the Floor satellite. Moving a
    // field to a satellite column IS a version migration (ADR 0011's unifying
    // insight), but the *relocation* is a storage concern enacted by the
    // satellite-aware apply path (review.ts: floor.upsert writes the satellite,
    // entityUpdateData drops the keys from the blob), not a value transform. So
    // the pure data upgrade is the identity — preserving the values so the read
    // seam returns them for the migration patch; bumping the version is what
    // marks legacy `_v:2` rows stale for MIGRATE_ENTITY_DATA to re-apply through
    // the satellite path.
    (data) => data,
  ],
  // All four fields physically live in the Floor satellite table (keyed by
  // Entity.id); Entity.data converges to `{_v:3}`. See model Floor in
  // prisma/schema.prisma and EntityKind.satellite.
  satellite: {
    relation: "floor",
    fields: ["floorNumber", "theme", "startDay", "collapseDay"],
  },
};
