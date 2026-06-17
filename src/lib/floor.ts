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
