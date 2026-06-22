// Event-effect kind registry. An event can declare structured effects that
// materialize onto canon when the event's change set is approved. Historically
// every effect targeted a CRAWLER and nudged a `crawler.*` stat; this registry
// is the seam that lets new kinds — including ones that act on other entity
// types or the campaign itself — be added without re-deriving the per-kind
// branching in five places.
//
// To add a new effect kind:
//   1. add its value to `eventEffectKindValues`,
//   2. add a `eventEffectKindMeta` entry (label + what it targets + which
//      crawler-stat inputs, if any, it shows),
//   3. add its declared-effect validation to `eventEffectSchema` (validation.ts),
//   4. add its materialization branch to the apply dispatch (review.ts), and
//   5. add its phrasing to `describeEffect` (event-effects.ts).
// The UI (effect-rows.tsx) and projection read the meta, so they need no change.

export const eventEffectKindValues = [
  "ADJUST_STAT",
  "SET_STAT",
  "SET_ALIVE",
  "COLLAPSE_FLOOR",
  "PERSONA_SHIFT",
] as const;
export type EventEffectKind = (typeof eventEffectKindValues)[number];

// Crawler numeric fields a stat effect can update — these map to the review
// service's `crawler.*` patch fields.
export const eventEffectStatValues = [
  "gold",
  "hp",
  "mp",
  "level",
  "killCount",
  "currentFloor",
] as const;
export type EventEffectStat = (typeof eventEffectStatValues)[number];

// What an effect points at. CRAWLER kinds carry a hand-picked crawler
// `targetEntityId` and mutate `crawler.*`. NONE kinds derive their subject from
// the event (e.g. COLLAPSE_FLOOR acts on the event's own floor) and need no
// target. PERSONA kinds carry a hand-picked SYSTEM_AI `targetEntityId` and drift
// its active persona snapshot's dials (PERSONA_SHIFT). Future non-crawler entity
// targets would add their EntityType here.
export type EffectTargetKind = "CRAWLER" | "NONE" | "PERSONA";

export type EventEffectKindMeta = {
  label: string;
  target: EffectTargetKind;
  // Shows the stat selector + numeric input (delta for ADJUST_STAT, absolute
  // value for SET_STAT).
  usesStat: boolean;
  // Shows the alive/dead selector (SET_ALIVE).
  usesAlive: boolean;
  // Shows the per-dial delta inputs (PERSONA_SHIFT).
  usesDials: boolean;
};

export const eventEffectKindMeta: Record<EventEffectKind, EventEffectKindMeta> = {
  ADJUST_STAT: { label: "Adjust stat", target: "CRAWLER", usesStat: true, usesAlive: false, usesDials: false },
  SET_STAT: { label: "Set stat", target: "CRAWLER", usesStat: true, usesAlive: false, usesDials: false },
  SET_ALIVE: { label: "Set alive/dead", target: "CRAWLER", usesStat: false, usesAlive: true, usesDials: false },
  COLLAPSE_FLOOR: { label: "Collapse floor", target: "NONE", usesStat: false, usesAlive: false, usesDials: false },
  PERSONA_SHIFT: { label: "Persona shift", target: "PERSONA", usesStat: false, usesAlive: false, usesDials: true },
};

// Whether a kind needs a hand-picked target entity (vs deriving it from the event).
export function eventEffectRequiresTarget(kind: EventEffectKind): boolean {
  return eventEffectKindMeta[kind].target !== "NONE";
}
