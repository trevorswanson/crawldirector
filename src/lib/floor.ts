import { readKindData } from "@/lib/entity-kinds";

// FLOOR entity data shape (ADR 0005 + 0008). A FLOOR-type entity carries its
// floor number, optional theme, and the absolute days-since-collapse it opened /
// collapses in `Entity.data`. This reader is the typed facade over the FLOOR kind,
// shared by the timeline projection (events.ts) and the order-derivation in the
// review pipeline (review.ts) so the two can't drift.

export type FloorData = {
  floorNumber: number | null;
  theme: string | null;
  // Absolute days-since-collapse the floor opened / collapses (ADR 0008). These
  // anchor FLOOR_START / FLOOR_COLLAPSE event times onto the absolute-day axis.
  startDay: number | null;
  collapseDay: number | null;
};

// Delegates to the versioned `readKindData` read seam (ADR 0011) so every floor
// consumer upgrades a stored row through the same path; the per-field coercion
// below is a typed narrowing of `readKindData`'s already-normalized output.
export function readFloorData(value: unknown): FloorData {
  const data = readKindData("FLOOR", value);
  return {
    floorNumber: typeof data.floorNumber === "number" ? data.floorNumber : null,
    theme: typeof data.theme === "string" && data.theme.length > 0 ? data.theme : null,
    startDay: typeof data.startDay === "number" ? data.startDay : null,
    collapseDay: typeof data.collapseDay === "number" ? data.collapseDay : null,
  };
}

// Floor 1 is the crawl's origin: absent an explicit `startDay`, it opens on day
// 1 so FLOOR_START-relative event times resolve out of the box (ADR 0008). This
// default is applied only at the day-resolution / anchor layer — `readFloorData`
// stays a faithful parser so the FLOOR edit form still shows an unset start as
// blank. Deeper floors with no anchor stay `null` (unresolvable until set).
export function effectiveFloorStartDay(
  floorNumber: number | null,
  startDay: number | null,
): number | null {
  return startDay ?? (floorNumber === 1 ? 1 : null);
}
