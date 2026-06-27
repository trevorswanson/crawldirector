# ADR 0004 — Event time model: derived ordering, intra-floor rank, and structured time references

- **Status:** accepted (slices 1–3 delivered; slices 1–2 on 2026-06-04, slice 3
  on 2026-06-05 — causality-consistency warnings, then "order from causality")
- **Date:** 2026-06-04
- **Milestone:** M3 (events, timeline, causality)

> **Amended by [ADR 0008](./0008-floor-model-unification-and-time-inference.md)
> (2026-06-07).** "Derived rank where the time is concrete" (below) originally
> covered only floor-relative bases, and EVENT-basis order was left to causality.
> Intra-floor `rank` now also derives from a resolved **absolute day** when one is
> known (ADR 0008), so an `EVENT`-anchored time sorts by its resolved day even
> without a causal link. Cross-floor reconciliation stays deferred.

## Context

DCC has no calendar. In-fiction time is expressed in several irregular,
overlapping ways — *days since the collapse*, *time after a floor opened*, *time
until a floor collapses*, *before/after some other event* — and the books switch
between them freely. [`01-domain-model.md`](../01-domain-model.md) embraced that
with a deliberately flexible model: a JSON `inGameTime` structure plus an integer
ordering key, annotated with a free-text label. The intent — never force calendar
dates, keep narrative phrasing flexible — is still right.

In practice the flexibility collapsed into one weak shape, and the implementation
fused three separate concerns into two fields:

- **`Event.inGameTime`** is JSON but only ever holds `{ floor?, label? }`.
  `buildInGameTime` ([`events.ts`](../../src/server/services/events.ts)) never
  writes the `dayInFloor` / `absoluteDay` the doc promised.
- **`Event.orderKey`** is an `Int` set **equal to the floor**
  (`orderKey: { to: floor }` in `createEvent`/`updateEvent`). The timeline sorts
  by `(orderKey desc, createdAt desc)`.
- The free **`label`** is the only place any of the DCC time *flavors* can live,
  so it carries both the in-fiction coordinate and its human phrasing at once.

Three problems follow:

1. **No real intra-floor order.** Every event on a given floor ties on `orderKey`
   and falls back to `createdAt` — i.e. *the order the DM happened to log them*,
   not the order they happened. A DM can't say "this came before that" within a
   floor without rewriting labels.
2. **The label is overloaded.** Because one free-text field is doing both anchor
   duty and phrasing duty, it can't be sorted, filtered, or rendered
   consistently. "3 days after the collapse" and "Day 3" and "post-collapse d3"
   are the same instant but three unorderable strings.
3. **`orderKey` leaks into the Review Queue.** `createEvent`/`updateEvent` put
   `orderKey: { to: floor }` into the *reviewable patch*. The Review Queue has a
   structured renderer for `inGameTime` but none for `orderKey`, so it falls
   through to a raw `ORDERKEY` field row — a derived implementation detail
   presented to the DM as if it were editable canon. It should not be a field at
   all.

### Constraint from the domain model

`01-domain-model.md` is explicit that we **never force real calendar dates** and
that DMs "sort the timeline by the ordering key and annotate with human-readable
labels." Any redesign must keep vague/unscheduled time first-class (an event can
have *no* usable timestamp and still belong on the timeline) and must keep
narrative phrasing flexible. The causality DAG (`EventCausality`) already encodes
a partial order — a cause precedes its effect — and that is a coherence signal we
under-use today.

## Decision

Separate the three concerns the current model fuses — **order**, **anchor**, and
**label** — and let each be coherent on its own:

| Concept   | Job                                   | User-facing? | New home |
| --------- | ------------------------------------- | ------------ | -------- |
| **Order** | total sort key, mechanical            | **Never** raw | derived `orderKey` + intra-floor `rank` |
| **Anchor**| structured in-fiction coordinate      | yes, as pickers | typed `timeRef` |
| **Label** | narrative phrasing                    | yes, display | generated from `timeRef`, with optional override |

### 1. Order — derived, hidden, with intra-floor resolution

`orderKey` becomes a value the DM never types and never sees as a field.

- **Remove it from the reviewable patch.** `createEventFromPatch` /
  `updateEventFromPatch` ([`review.ts`](../../src/server/services/review.ts))
  compute `orderKey` server-side from the event's anchor at apply time; the
  patches built in `events.ts` no longer carry an `orderKey` entry. This alone
  removes the `ORDERKEY` row from the Review Queue and stops treating a derived
  value as editable canon.
- **Add an intra-floor `rank`.** Floor remains the correct macro-clock (DCC
  descends floor by floor, monotonically), but events within a floor need a
  stable, DM-controllable order. Store a **fractional rank** (a lexicographically
  sortable string, fractional-indexing / LexoRank style). Dragging an event
  between two neighbours sets its rank to a value between theirs — O(1), no
  renumbering of siblings. The timeline sorts by **`(floor, rank, createdAt)`**.

`orderKey` stays on the row as a denormalized coarse sort hint (= floor) for
cheap DB ordering and indexing, but it is derived, never user-authored, and never
a review field. `rank` is the tiebreaker that makes within-floor order real.

### 2. Anchor — a typed `timeRef` replacing the free label

The four DCC flavors are not four text styles; they are all **an offset from a
basis**. Model `inGameTime` as a small typed structure:

```ts
type TimeBasis =
  | "COLLAPSE"        // days since the apocalypse / start of the crawl
  | "FLOOR_START"     // time after a floor opened
  | "FLOOR_COLLAPSE"  // time until a floor collapses (counts down)
  | "EVENT"           // before/after another event
  | "ABSOLUTE_DAY"    // [retired 2026-06-27] merged into COLLAPSE — both are
                      //   bare days-since-collapse (collapse = day 0), so they
                      //   were redundant; legacy rows read as COLLAPSE.
  | "UNSCHEDULED";    // no usable timestamp (label-only / manual order)

type TimeRef = {
  basis: TimeBasis;
  floor?: number;          // for floor-relative bases and general context
  anchorEventId?: string;  // required for EVENT basis
  offset?: number;         // signed magnitude (e.g. +3, -12)
  unit?: "DAY" | "HOUR" | "MINUTE";
  label?: string;          // optional human override of the generated phrase
};
```

This buys, from one structure:

- **Generated phrasing.** The app renders a consistent string from the structure
  — "Floor 9 · 3 days in", "12h before Floor 9 falls", "after *Carl's stunt*",
  "Day 47 since the collapse". Narrative flavor is preserved but *generated*, not
  retyped; `label` overrides it only when a DM wants a one-off phrasing.
- **Derived rank where the time is concrete.** When the basis is floor-relative
  with an offset, the intra-floor `rank` can be derived automatically
  (`FLOOR_START` sorts ascending by offset; `FLOOR_COLLAPSE` sorts so larger
  "time remaining" is earlier). `UNSCHEDULED` / label-only events fall back to the
  manual drag-rank. So the DM gets automatic ordering when they give structure,
  and manual control when they don't.
- **EVENT basis ties into causality.** "Before/after event X" references a real
  event id, not a guessed number, and stays consistent if X moves.

The Review Queue's existing structured `inGameTime` editor is extended to render
`basis` + `offset` + `unit` (+ anchor-event picker for `EVENT`) instead of a bare
floor + free label. There is still **no** `orderKey`/`rank` field in the queue —
those are derived.

### 3. Causality as a coherence check

The `EventCausality` DAG already constrains order: a cause must precede its
effect. We use it as a soft consistency signal, not a hard constraint:

- **Warn** when the computed sort order contradicts the DAG (an effect rendered
  above its cause) — surfaced on the timeline, never blocking.
- Offer **"order from causality"**: topologically sort stretches of events that
  have no concrete `timeRef`, using the DAG to settle ambiguous adjacency.

This is the "coherent enough for the app" half, and it is nearly free given the
DAG already exists.

### Migration

A Prisma migration plus a data backfill:

- Schema: keep `Event.inGameTime` as `Json` (shape changes, type does not); keep
  `Event.orderKey Int`; **add `Event.rank String`** (fractional index, indexed
  with `(campaignId, orderKey, rank)`).
- Backfill existing rows: `{ floor, label }` →
  `{ basis: floor != null ? "FLOOR_START" : "UNSCHEDULED", floor, label }`. The
  old free `label` is preserved verbatim as the override, so nothing reads
  differently on day one.
- Assign initial `rank` per `(campaign, floor)` group by current
  `(orderKey, createdAt)` order, spacing ranks so future inserts have room.
- `buildInGameTime` / `readTimeInfo` in `events.ts` are rewritten to read/write
  the `TimeRef` shape; `orderKey` derivation moves into the review apply path.

## Consequences

- **The `ORDERKEY` leak is gone** the moment ordering leaves the patch — and it
  goes away for the right reason: order is derived, not canon a DM edits.
- **Within-floor order becomes real and direct.** "How a DM would order them" is a
  literal drag (manual rank) or a consequence of the offset they entered (derived
  rank), never reverse-engineered from a number.
- **One field stops doing three jobs.** Anchor (sortable structure), label
  (phrasing), and order (mechanics) are independent, so each can be filtered,
  rendered, and validated coherently. AI/import producers (M4+) can emit a typed
  `timeRef` instead of guessing a label string.
- **Vague time stays first-class.** `UNSCHEDULED` is a real basis; an event with
  no usable timestamp still sorts (by manual rank, refined by causality) and still
  renders a label. We did not force calendar dates.
- **Schema churn is contained.** One additive column (`rank`) plus a JSON-shape
  change behind a backfill. `orderKey` stays for cheap coarse ordering. No change
  to participants, causality, effects, or the review pipeline's invariants — only
  to which fields an event change set carries.
- **Phased delivery.** The three parts are independently shippable:
  1. Derive `orderKey` server-side + strip it from patches (kills the leak), add
     `rank` + intra-floor drag.
  2. Introduce the typed `timeRef` + migration + generated phrasing + derived
     rank.
  3. Causality-consistency warnings (**delivered** — `src/lib/causality.ts`'s
     `findCausalityWarnings` flags causal links whose effect is ordered earlier
     in fiction than its cause; the campaign timeline surfaces them inline next
     to each link and as a header count, non-blocking) and "order from
     causality" (**delivered** — `src/lib/causality-order.ts`'s
     `orderFromCausality` topologically sorts each floor's *movable* events
     (unlocked, non-derived order) from the DAG, leaving locked / system-derived
     events pinned and unsatisfiable contradictions to the warning;
     `orderEventsFromCausality` applies the resulting `rank` rewrites as an
     audited, review-bypassing pass, surfaced as a one-click **Order from
     causality** button on the campaign timeline).

### Deferred (explicitly out of scope)

- **Cross-floor absolute reconciliation.** Converting every basis into a single
  global day index (so Floor-3 and Floor-9 events interleave by true wall-clock)
  needs per-floor duration data we don't model yet. Floor remains the macro-clock;
  revisit if a campaign needs strict cross-floor interleaving.
- **Per-event time precision/uncertainty** ("sometime on Floor 9", ranges). The
  `UNSCHEDULED` basis + label covers the vague case; explicit ranges are a later
  refinement.
- **Recurring / scheduled future events** (broadcast schedules as repeating
  series). One-off `timeRef`s cover current needs.

## References

- [`01-domain-model.md`](../01-domain-model.md) — events, the time model, "never
  force calendar dates," causality DAG.
- [`09-data-schema.md`](../09-data-schema.md) — `Event`, `inGameTime`, `orderKey`.
- [`03-review-pipeline.md`](../03-review-pipeline.md) — change-set patches and
  field semantics (why `orderKey` must not be a reviewable field).
- [`src/server/services/events.ts`](../../src/server/services/events.ts) —
  `buildInGameTime`, `readTimeInfo`, `orderKey` assignment, timeline ordering.
- [`src/server/services/review.ts`](../../src/server/services/review.ts) —
  `createEventFromPatch` / `updateEventFromPatch` (where derived `orderKey` will
  move).
- [`src/app/(dm)/campaigns/[id]/review/page.tsx`](../../src/app/(dm)/campaigns/[id]/review/page.tsx)
  — Review Queue structured `inGameTime` renderer (the `ORDERKEY` leak site).
