// "Order from causality" (ADR 0004 slice 3, the reorder half). The
// `EventCausality` DAG encodes a partial order — a cause precedes its effect.
// `findCausalityWarnings` (src/lib/causality.ts) *detects* when the timeline's
// mechanical sort contradicts that; this is the one-click *fix*: rewrite the
// intra-floor `rank` of the events the DM hasn't pinned so causes sort before
// their effects.
//
// Scope, deliberately narrow (mirrors what the timeline lets a DM drag):
//   - Floor is the macro-clock, so we only reorder *within* a floor (`orderKey`).
//   - Only **movable** events are reordered: an event whose intra-floor order is
//     system-derived (a floor-relative anchor with a concrete offset, ADR 0004)
//     or that is locked is **pinned** — its `rank` is never rewritten. Pinned
//     events keep their exact rank and their current relative order; movable
//     events flow into the gaps between them to satisfy causality.
//   - Causal edges that can't be satisfied by moving movable events (e.g. a link
//     between two pinned events in the wrong order, or a genuine cycle) leave the
//     floor untouched — the existing non-blocking warning still flags them.
//
// Pure and self-contained (rank generation included) so it can be unit-tested and
// run identically on the client — to decide whether to show the affordance — and
// on the server, where it is recomputed from canon and applied.

import { generateRankBetween } from "@/lib/rank";

// The minimal shape the reorder needs. `movable` is `!locked && order not
// system-derived`; `causes` lists the effect ids this event causes (the outgoing
// causal edges). `rank` is the current intra-floor fractional key.
export type OrderableEvent = {
  id: string;
  orderKey: number;
  rank: string;
  movable: boolean;
  causes: { id: string }[];
};

export type RankUpdate = { id: string; rank: string };

// Bytewise rank order, ascending = earliest-in-fiction first. Matches the DB
// column (`TEXT COLLATE "C"`) and src/lib/causality.ts — never localeCompare,
// which disagrees across the upper/lowercase boundary of the rank alphabet.
function rankAsc(a: { rank: string }, b: { rank: string }): number {
  if (a.rank < b.rank) return -1;
  if (a.rank > b.rank) return 1;
  return 0;
}

// Stable topological order (earliest first) for one floor's events, honouring
// both the causal DAG and the pinned events' current relative order (synthetic
// chain edges keep pinned events in place). Ties break by current position, so an
// already-consistent floor comes back unchanged. Returns null on an unsatisfiable
// constraint (a cycle once the pinned chain is added) — the caller leaves that
// floor alone.
function topoOrderFloor(fictionOrder: OrderableEvent[]): OrderableEvent[] | null {
  const indexById = new Map<string, number>();
  fictionOrder.forEach((event, index) => indexById.set(event.id, index));

  // Adjacency + in-degree over edges *internal* to this floor.
  const outgoing = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  for (const event of fictionOrder) {
    outgoing.set(event.id, new Set());
    inDegree.set(event.id, 0);
  }
  const addEdge = (from: string, to: string) => {
    if (from === to) return;
    if (!indexById.has(from) || !indexById.has(to)) return;
    const set = outgoing.get(from)!;
    if (set.has(to)) return;
    set.add(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  };

  // Causal edges: cause → effect (cause must come first).
  for (const event of fictionOrder) {
    for (const effect of event.causes) addEdge(event.id, effect.id);
  }
  // Pinned chain: consecutive pinned events keep their current relative order, so
  // the sort can never reshuffle them (their ranks are fixed reference points).
  let previousPinned: string | null = null;
  for (const event of fictionOrder) {
    if (event.movable) continue;
    if (previousPinned) addEdge(previousPinned, event.id);
    previousPinned = event.id;
  }

  // Kahn's algorithm, always taking the ready node with the smallest current
  // index (stable: minimises movement and leaves an in-order floor as-is).
  const result: OrderableEvent[] = [];
  const ready = fictionOrder.filter((event) => inDegree.get(event.id) === 0);
  const remaining = new Set(fictionOrder.map((event) => event.id));
  while (ready.length > 0) {
    ready.sort((a, b) => indexById.get(a.id)! - indexById.get(b.id)!);
    const next = ready.shift()!;
    result.push(next);
    remaining.delete(next.id);
    for (const effectId of outgoing.get(next.id)!) {
      const degree = (inDegree.get(effectId) ?? 0) - 1;
      inDegree.set(effectId, degree);
      if (degree === 0) {
        ready.push(fictionOrder[indexById.get(effectId)!]);
      }
    }
  }
  if (remaining.size > 0) return null; // cycle — unsatisfiable, leave the floor
  return result;
}

// Fresh ranks for the movable events, placed in the gaps between pinned events'
// fixed ranks. A movable run is bounded by the pinned ranks on either side (or an
// open end), and ranks within it ascend, so the resulting `(orderKey, rank)` sort
// matches the target fiction order. Pinned events keep their existing rank.
function assignRanks(target: OrderableEvent[]): RankUpdate[] {
  const updates: RankUpdate[] = [];
  let i = 0;
  while (i < target.length) {
    if (!target[i].movable) {
      i += 1;
      continue;
    }
    // The maximal run of consecutive movable events [i, j).
    let j = i;
    while (j < target.length && target[j].movable) j += 1;
    const lo = i > 0 ? target[i - 1].rank : null; // pinned before (or start)
    const hi = j < target.length ? target[j].rank : null; // pinned after (or end)
    let previous = lo;
    for (let k = i; k < j; k += 1) {
      const rank = generateRankBetween(previous, hi);
      if (rank !== target[k].rank) updates.push({ id: target[k].id, rank });
      previous = rank;
    }
    i = j;
  }
  return updates;
}

/**
 * The `rank` rewrites that put every floor's movable events into an order
 * consistent with the causality DAG. Empty when nothing needs to move (the
 * timeline is already causally ordered, or every out-of-order link is between
 * pinned events the reorder can't touch). Each returned id is a movable event
 * whose rank changes; pinned (locked / system-derived-order) events are never in
 * the result.
 */
export function orderFromCausality(events: OrderableEvent[]): RankUpdate[] {
  // Group by floor; reorder each floor independently.
  const byFloor = new Map<number, OrderableEvent[]>();
  for (const event of events) {
    const list = byFloor.get(event.orderKey);
    if (list) list.push(event);
    else byFloor.set(event.orderKey, [event]);
  }

  const updates: RankUpdate[] = [];
  for (const floorEvents of byFloor.values()) {
    if (floorEvents.length < 2) continue;
    // Current fiction order: ascending rank (the timeline shows rank-descending).
    const fictionOrder = [...floorEvents].sort(rankAsc);
    const target = topoOrderFloor(fictionOrder);
    if (!target) continue; // unsatisfiable — leave this floor
    const unchanged = target.every((event, index) => event.id === fictionOrder[index].id);
    if (unchanged) continue;
    updates.push(...assignRanks(target));
  }
  return updates;
}
