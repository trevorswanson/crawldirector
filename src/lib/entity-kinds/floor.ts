import { z } from "zod";

import { optionalInt, optionalText } from "@/lib/zod-field-helpers";

import type { EntityKind } from "./types";

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
};
