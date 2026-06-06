# ADR 0008 — Floor model unification and absolute-day time inference

- **Status:** accepted — slice 1 (floor time anchors + absolute-day inference)
  delivered 2026-06-06; slices 2 (floor-number key) and 3 (retire duplicate
  paths) pending
- **Date:** 2026-06-06
- **Milestone:** M3 (events, timeline, causality) — cleanup + follow-up to
  [ADR 0004](./0004-event-time-model-and-ordering.md) and
  [ADR 0005](./0005-campaign-current-floor.md)

## Context

"Floor" is the macro-clock of a DCC crawl, and it accreted **five** disconnected
representations as M3 grew. They overlap, none is authoritative, and the numeric
ones aren't tied to the FLOOR entity:

| # | Where | Shape | Means | Tied to FLOOR entity? |
| - | ----- | ----- | ----- | --------------------- |
| 1 | `Entity` (`type = FLOOR`) + `data.floorNumber` / `data.theme` | entity + JSON | the floor's identity, name, theme ([ADR 0005](./0005-campaign-current-floor.md)) | **is** the entity |
| 2 | `Event.inGameTime.floor` (`timeRef.floor`) | number | which floor an event is on | by number only (no FK) |
| 3 | `Event.orderKey` | number (= floor) | derived macro-sort key ([ADR 0004](./0004-event-time-model-and-ordering.md)) | by number only |
| 4 | `Crawler.currentFloor` | number | where a crawler currently is | **no** — loose int |
| 5 | `LOCATED_ON` relationship → FLOOR entity | edge | "X is on this floor" (time-bounded via `sinceDay`/`untilDay`) | by FK |

Plus `Campaign.currentFloorId` (FK to a FLOOR entity — the "ON AIR" floor), which
is fine and *is* entity-based.

The concrete pain (DM-reported):

1. **Events take a floor number that may or may not match a FLOOR entity.**
   `timeRef.floor` / `orderKey` are raw ints matched to a FLOOR entity by
   `data.floorNumber`, which is **not unique-constrained** ("first wins" — ADR
   0005) and can have no entity at all.
2. **Floors can also be attached to an event as a participant** (a FLOOR entity
   in the `LOCATION` role) — redundant with `timeRef.floor`. "Why bother if we're
   doing floor number?"
3. **Crawlers have a `currentFloor` int that isn't tied to the entities — and you
   can *also* relate them to FLOOR entities via `LOCATED_ON`.** Two ways to say
   the same thing, neither authoritative.

A second, related defect (same DM report, issue #4): **inferred floor day-ranges
barely work.** [ADR 0005](./0005-campaign-current-floor.md) shipped a client-side
range that only places events whose basis is `COLLAPSE` / `ABSOLUTE_DAY`
(`resolveAbsoluteDay` in [`campaign-timeline.tsx`](../../src/components/timeline/campaign-timeline.tsx)).
So:

- An event timed **"2 days after Event A"** (`EVENT` basis) never resolves to an
  absolute day, even when Event A is `ABSOLUTE_DAY 0`. The floor it sits on shows
  only `Day 0`, not `Day 0–2`.
- There is **no way to say when a floor opened**, so `FLOOR_START` /
  `FLOOR_COLLAPSE` offsets can never become absolute days, and a floor with no
  absolute-dated event shows no range.

ADR 0005 already named the fix as a deferred follow-up: *"a `data.startDay`
('floor opens' anchor) on FLOOR entities … would let `FLOOR_START` offsets
resolve to absolute days and the floor-1→N chain fill in."* This ADR delivers it
and the structural cleanup together, because they are one problem: **the floor
model has no single source of truth, and time can't be reasoned about across
floors without one.**

### Constraints carried from prior ADRs

- **Floor stays the macro-clock; ordering stays derived, never authored** (ADR
  0004). This ADR does **not** re-derive `orderKey`/`rank` from absolute days —
  cross-floor *ordering* by wall-clock remains explicitly deferred (ADR 0004).
  Absolute-day resolution here is for **display ranges and inference only**.
- **Vague/unscheduled time is first-class** (ADR 0004). Inference must degrade
  gracefully: an event that can't be placed contributes nothing and still renders.
- **Floor metadata lives in `Entity.data`** via the existing `dataFields`
  pipeline plumbing (ADR 0005) — no new typed sub-model.
- **Effects can move a crawler's floor.** `currentFloor` is a targetable
  `ADJUST_STAT` / `SET_STAT` effect stat (`effectStatLabels.currentFloor`,
  [`event-effects.ts`](../../src/lib/event-effects.ts)) — "Carl descends to floor
  10" is an event effect. Any change to `Crawler.currentFloor` ripples into the
  effects DSL, the Review Queue effect editor, and the apply path.

## Decision

**One principle: the floor *number* is the campaign-unique canonical key for a
floor; the FLOOR entity owns it; every "which floor" reference stores the number
and resolves to the entity by number.** We pick one field per concept and delete
the duplicates.

### 1. Floor number becomes a real key (ties numbers ↔ entity)

- **`data.floorNumber` is unique per campaign**, enforced in the entity
  create/update appliers ([`review.ts`](../../src/server/services/review.ts)) — a
  second FLOOR entity claiming a taken number is a validation error, not
  "first wins" (reversing the soft behavior accepted in ADR 0005). It cannot be
  a DB unique constraint (it lives in JSON), so the service enforces it.
- A shared resolver, **`resolveFloorEntity(campaignId, floorNumber)`**, is the
  single way code maps a number → FLOOR entity. The timeline, entity detail, and
  graph all render the *resolved entity* (name/theme, linked) wherever a bare
  number is shown today.
- A floor number with no FLOOR entity still renders a number-only band (unchanged
  from ADR 0005) — the entity is optional, the number is the key.

### 2. An event's floor is `timeRef.floor` only

- The event's floor is its `timeRef.floor` (→ `orderKey`, derived). **A FLOOR
  entity is never an event participant for the purpose of saying "this happened
  on floor N."** The `LOCATION` participant role is reserved for *sub-floor*
  locations / neighborhoods (a LOCATION/NEIGHBORHOOD entity), never a FLOOR.
- Enforcement is a soft guard, not a hard DB rule (invariant #7 keeps
  participants any-to-any): the event forms stop offering FLOOR entities in the
  participant typeahead and steer the floor to the time picker; the apply path
  does not reject a FLOOR participant (back-compat) but the timeline reads floor
  from `timeRef`, so an attached FLOOR is cosmetic and discouraged.

### 3. A crawler's floor is `Crawler.currentFloor` — `LOCATED_ON` is retired for crawler→floor

We keep `Crawler.currentFloor` as the **single source of truth for a crawler's
current position**, because it is load-bearing for event effects ("descend a
floor") and gives an O(1) "where is Carl now" without an edge join. We remove the
*second* path:

- **`LOCATED_ON` is no longer used to express a crawler's floor.** The
  relationship type stays in the schema (invariant #7; it remains valid for
  non-crawler spatial edges — a BOSS/LOCATION/NEIGHBORHOOD tied to a floor that
  has no `currentFloor` field), but the crawler UI and relationship-create
  suggestions stop offering crawler `LOCATED_ON` FLOOR. "Where is this crawler"
  reads `currentFloor`, resolved to its FLOOR entity and shown as a link.
- **`currentFloor` is entity-resolved everywhere it surfaces** (campaign roster,
  entity detail): render the resolved FLOOR entity's name + link, not a bare int.
- History of a crawler's movement is the **event log** — each floor change is an
  `ADJUST_STAT`/`SET_STAT currentFloor` effect on a timed event, which already
  carries when and why. We do not separately maintain time-bounded location
  edges for crawlers.

> **Considered and deferred — Option B: make `LOCATED_ON` edges the model of
> record and drop `Crawler.currentFloor`.** This matches
> [`01-domain-model.md`](../01-domain-model.md) ("movement is modeled as
> `LOCATED_ON` edges that change over time") and gives free time-bounded history.
> Rejected for now because it requires rewriting the effects DSL (floor moves
> stop being a stat), the Review Queue effect editor, seeding, and every
> "current floor" read, for a history capability the event log already provides.
> Revisit if per-crawler spatial history (neighborhoods within a floor, multiple
> simultaneous locations) becomes a product need. **Confirmed by the DM
> (2026-06-06): keep `currentFloor`; do not take Option B now.**

### 4. Campaign current floor — unchanged

`Campaign.currentFloorId` (FK → FLOOR entity, `onDelete: SetNull`) stays as-is.
It is already entity-based and correct (ADR 0005).

### 5. Floor time anchors (enables inference, issue #4)

FLOOR entities gain two optional `data.*` time anchors, plumbed exactly like
`floorNumber`/`theme` (registered in `dataFields`, in the create/update appliers,
and on the FLOOR entity form):

- **`data.startDay`** — the absolute day-since-collapse the floor *opened*.
- **`data.collapseDay`** — the absolute day the floor *collapses* (optional;
  enables `FLOOR_COLLAPSE` resolution and bounds the floor's close).

Both are reviewable, lockable canon (same as any `data.*` field). Neither is
required — a floor with no anchors still infers its range from its events
(below).

### 6. An absolute-day resolver (the inference engine)

A new pure module, **`src/lib/time-resolve.ts`**, computes an event's absolute
day-since-collapse by walking the basis graph, given the campaign's floor anchors:

| basis | resolved absolute day |
| ----- | --------------------- |
| `ABSOLUTE_DAY`, `COLLAPSE` | `offset` |
| `EVENT` | `resolve(anchorEvent) + offset` (recursive) |
| `FLOOR_START` | `floor.startDay + offset` (if the floor has `startDay`) |
| `FLOOR_COLLAPSE` | `floor.collapseDay − offset` (if the floor has `collapseDay`) |
| `UNSCHEDULED` / unresolvable | `null` (contributes nothing) |

- **Memoized + cycle-guarded.** `EVENT` chains are resolved depth-first with a
  visited set; a cycle (or an anchor that itself can't resolve) yields `null` for
  that event, never an exception.
- This directly fixes the DM's case: Event A `ABSOLUTE_DAY 0`, Event B `EVENT
  +2 days after A` → B resolves to day 2, so floor 1's range becomes **Day 0–2**.

### 7. Smarter floor day-ranges

`dayRangeByFloor` (today a min/max over only absolute-dated events) is recomputed
per floor as the union of:

1. the floor's own `data.startDay` (if set) as a lower bound,
2. the floor's own `data.collapseDay` (if set) as an upper bound,
3. every resolvable event's absolute day on that floor (via the resolver), and
4. a derived **close bound = `nextFloor.startDay − 1`** when the next floor down
   has a known `startDay` (so floor N visibly runs until floor N+1 opens — the
   "floor 1 → N chain fills in" behavior ADR 0005 anticipated).

A floor with nothing resolvable still shows no range (graceful, unchanged). The
computation stays client-side over the full event set (as today), now fed the
floor anchors from `listCampaignFloors`.

### Migration

- **Schema:** no new columns. `data.startDay` / `data.collapseDay` are JSON on the
  existing `Entity.data`, like `floorNumber`/`theme`. (No migration file needed
  for the JSON additions; the `dataFields` registry + appliers are the change.)
- **Data backfill (one-off, idempotent):** none required to *function*. An
  optional convenience pass can seed `data.floorNumber` uniqueness conflicts to
  the surface (report duplicates for the DM to fix) rather than silently
  renumber. Crawler `LOCATED_ON`→FLOOR edges are **left in place** (not
  destroyed); they simply stop being authored/offered and stop being read for
  "current floor." A later cleanup can archive them.
- **`Crawler.currentFloor`** is unchanged in the schema (kept, per decision #3).

### Phased delivery (each a shippable, tested slice)

1. **Floor anchors + inference (issue #4, highest user value, lowest risk).**
   ✅ **Delivered (2026-06-06).** `data.startDay`/`data.collapseDay` are plumbed
   through validation → `entities` patch builders → the `review` `dataFields`
   registry + create/update appliers, with "Opens on day" / "Collapses on day"
   fields on the FLOOR entity form (reviewable, lockable, provenance-tracked).
   `listCampaignFloors` surfaces the anchors per floor (`FloorDescriptor`).
   `src/lib/time-resolve.ts` resolves any event to an absolute day-since-collapse
   (ABSOLUTE_DAY/COLLAPSE direct, EVENT recursive + cycle-guarded, FLOOR_START/
   FLOOR_COLLAPSE via the anchors) and `computeFloorDayRanges` unions per floor,
   bounding each close at the next floor's open day. The campaign timeline's
   `dayRangeByFloor` now uses it, so an `EVENT`-relative time ("2 days after
   Event A") resolves and the floor-1→N chain fills in. No behavior removed.
2. **Floor-number key (issue #2a).** Enforce per-campaign `floorNumber`
   uniqueness in the appliers; add `resolveFloorEntity`; render resolved
   FLOOR-entity links wherever a bare number shows.
3. **Retire duplicate floor paths (issue #2b).** Stop offering FLOOR entities in
   the event participant typeahead; stop offering crawler `LOCATED_ON` FLOOR;
   surface `Crawler.currentFloor` as a resolved entity link.

## Consequences

- **One source of truth per concept.** Floor identity = FLOOR entity (unique
  number); event floor = `timeRef.floor`; crawler floor = `currentFloor`; current
  broadcast floor = `currentFloorId`. The redundant paths (FLOOR-as-participant,
  crawler `LOCATED_ON`) are retired, and every numeric reference resolves to the
  entity, so numbers and entities can no longer drift apart.
- **Inference actually works.** `EVENT`-relative and floor-relative times resolve
  to absolute days; floors show real ranges that fill in as the DM dates the
  crawl or sets floor open/collapse anchors. The DM's Event-A/Event-B case is
  fixed.
- **No schema churn, no destructive migration.** Additions are JSON `data.*`
  fields; `Crawler.currentFloor` and the `LOCATED_ON` type both stay. The change
  is mostly service-layer enforcement + UI steering + one new pure lib.
- **Ordering is untouched.** `orderKey`/`rank` derivation and the deferred
  cross-floor *ordering* question (ADR 0004) are unchanged; absolute days drive
  only display ranges, so we don't destabilize the timeline's sort.
- **A soft guard, not a hard constraint.** Discouraging FLOOR participants /
  crawler `LOCATED_ON` is UI + suggestion-level, preserving invariant #7
  (relationships and participants stay any-to-any in the DB).
- **Crawler-position decision is settled for this cleanup:** keep
  `Crawler.currentFloor` as the source of truth and retire crawler
  `LOCATED_ON`→FLOOR as an authoring/read path. Option B remains only a deferred
  future design if per-crawler spatial history becomes worth the effects-DSL
  rewrite.

### Deferred (explicitly out of scope)

- **Cross-floor ordering by wall-clock** (still ADR 0004's deferral). Absolute
  days here inform *ranges*, not the event sort order.
- **Per-crawler spatial history beyond the event log** (Option B above).
- **Sub-floor position** (neighborhood/zone as current location) — `PART_OF`
  edges already cover structure; "current zone" is a later refinement.
- **Floor-duration uncertainty / ranges** ("floor 9 lasted ~5 days") — the
  start/collapse anchors are points; fuzzy durations are a later refinement.

## References

- [ADR 0004](./0004-event-time-model-and-ordering.md) — derived ordering, typed
  `timeRef`, the cross-floor reconciliation deferral this ADR honors.
- [ADR 0005](./0005-campaign-current-floor.md) — FLOOR-entity metadata,
  `currentFloorId`, and the `data.startDay` follow-up this ADR delivers.
- [ADR 0003](./0003-relationship-create-ux-and-inverse-labels.md) — `LOCATED_ON`
  semantics and create-UX suggestions (where crawler→floor is steered away).
- [`01-domain-model.md`](../01-domain-model.md) — Floor entity, `LOCATED_ON` as
  movement-over-time (the Option B model), events & time.
- [`09-data-schema.md`](../09-data-schema.md) — `Entity.data`, `Event`,
  `Crawler`.
- [`src/lib/time-ref.ts`](../../src/lib/time-ref.ts) — `TimeRef`, `phraseTimeRef`,
  `floorRelativeSortKey` (the resolver complements these).
- [`src/server/services/events.ts`](../../src/server/services/events.ts) —
  `listCampaignFloors` (feeds floor anchors to the timeline).
- [`src/components/timeline/campaign-timeline.tsx`](../../src/components/timeline/campaign-timeline.tsx)
  — `resolveAbsoluteDay`, `dayRangeByFloor` (rewritten to use the resolver).
- [`src/server/services/review.ts`](../../src/server/services/review.ts) —
  `dataFields`, FLOOR `data.*` appliers, `floorNumber` uniqueness enforcement.
