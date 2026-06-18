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
  // converge to numbers before the descriptor's final normalization step.
  schemaVersion: 2,
  migrations: [
    (data) => ({
      ...data,
      floorNumber: numericStringToNumber(data.floorNumber),
      startDay: numericStringToNumber(data.startDay),
      collapseDay: numericStringToNumber(data.collapseDay),
    }),
  ],
};
