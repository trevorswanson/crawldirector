// FLOOR entity data shape (ADR 0005 + 0008). A FLOOR-type entity carries its
// floor number, optional theme, and the absolute days-since-collapse it opened /
// collapses in `Entity.data`. This reader is the single place that contract is
// parsed, shared by the timeline projection (events.ts) and the order-derivation
// in the review pipeline (review.ts) so the two can't drift.

export type FloorData = {
  floorNumber: number | null;
  theme: string | null;
  // Absolute days-since-collapse the floor opened / collapses (ADR 0008). These
  // anchor FLOOR_START / FLOOR_COLLAPSE event times onto the absolute-day axis.
  startDay: number | null;
  collapseDay: number | null;
};

export function readFloorData(value: unknown): FloorData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { floorNumber: null, theme: null, startDay: null, collapseDay: null };
  }
  const record = value as Record<string, unknown>;
  return {
    floorNumber: typeof record.floorNumber === "number" ? record.floorNumber : null,
    theme: typeof record.theme === "string" && record.theme.length > 0 ? record.theme : null,
    startDay: typeof record.startDay === "number" ? record.startDay : null,
    collapseDay: typeof record.collapseDay === "number" ? record.collapseDay : null,
  };
}
