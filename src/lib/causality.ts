// Causality-consistency checks (ADR 0004 slice 3, the "warn" half). The
// `EventCausality` DAG already encodes a partial order — a cause must precede its
// effect in fiction. The timeline's mechanical sort (floor `orderKey`, then the
// intra-floor fractional `rank`) is a *separate* order the DM controls by anchors
// and dragging. When the two disagree — an effect sorted earlier in fiction than
// its own cause — that's a coherence problem worth surfacing, but never one we
// block on (the DM may be mid-edit, or modelling something deliberately odd). So
// we detect the contradicting causal links and let the UI flag them inline.
//
// This is intentionally pure and UI-agnostic: it works off the same shape the
// timeline already holds in memory, so the warning stays live as the DM drags,
// re-anchors, or removes links without a round-trip.

// The minimal event shape the check needs: its mechanical sort position
// (`orderKey` = floor, `rank` = intra-floor fractional key) and the outgoing
// causal edges (this event is the cause; each item names an effect it causes).
export type CausalityCheckEvent = {
  id: string;
  orderKey: number;
  rank: string;
  causes: { id: string; linkId: string }[];
};

// Fiction order, earliest first: lower floor is earlier; within a floor the
// lexicographically-smaller `rank` is earlier (the timeline sorts rank
// descending, i.e. later-in-fiction first, so a smaller rank sorts later in the
// list = earlier in fiction). Mirrors the service's `(orderKey, rank)` ordering.
//
// `rank` is compared with **raw** lexicographic operators, not `localeCompare`:
// the fractional-index alphabet (src/lib/rank.ts) spans both letter cases and is
// sorted bytewise — the DB column is `TEXT COLLATE "C"` and Prisma orders it that
// way. Locale collation disagrees across the upper/lowercase boundary (e.g.
// `"a0".localeCompare("Zz") < 0`, but bytewise `"Zz" < "a0"`), which would miss a
// real inversion. Raw `<`/`>` on JS strings is UTF-16 code-unit order = bytewise
// for the ASCII rank alphabet, matching the canonical sort.
function compareFictionOrder(
  a: { orderKey: number; rank: string },
  b: { orderKey: number; rank: string },
): number {
  if (a.orderKey !== b.orderKey) return a.orderKey - b.orderKey;
  if (a.rank < b.rank) return -1;
  if (a.rank > b.rank) return 1;
  return 0;
}

// Return the set of causality `linkId`s whose effect is ordered *strictly before*
// its cause in fiction — a contradiction of cause-before-effect. Edges to an
// event not present in `events` (e.g. filtered out by visibility) can't be
// evaluated and are skipped; an effect sharing the cause's exact position is a
// tie, not a contradiction, so it does not warn.
export function findCausalityWarnings(events: CausalityCheckEvent[]): Set<string> {
  const positionById = new Map<string, { orderKey: number; rank: string }>();
  for (const event of events) {
    positionById.set(event.id, { orderKey: event.orderKey, rank: event.rank });
  }

  const warnings = new Set<string>();
  for (const cause of events) {
    for (const edge of cause.causes) {
      const effect = positionById.get(edge.id);
      if (!effect) continue;
      // Cause strictly later than its effect ⇒ the effect precedes its cause.
      if (compareFictionOrder(cause, effect) > 0) {
        warnings.add(edge.linkId);
      }
    }
  }
  return warnings;
}
