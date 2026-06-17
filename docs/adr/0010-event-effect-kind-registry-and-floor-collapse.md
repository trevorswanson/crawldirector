# ADR 0010 — Event-effect kind registry + the `COLLAPSE_FLOOR` lifecycle effect

- **Status:** accepted (delivered 2026-06-17)
- **Date:** 2026-06-17
- **Milestone:** post-M5 (timeline polish)
- **Relates to:** [ADR 0004](./0004-event-time-model-and-ordering.md) (time model),
  [ADR 0005](./0005-campaign-current-floor.md) (current floor),
  [ADR 0008](./0008-floor-model-unification-and-time-inference.md) (floor day anchors),
  [ADR 0009](./0009-entity-kind-registry.md) (the entity-kind registry this mirrors)

## Context

An event can declare structured **effects** that materialize onto canon when the
event's change set is approved. Historically every effect targeted a **crawler**
and nudged a `crawler.*` stat (`ADJUST_STAT` / `SET_STAT` / `SET_ALIVE`), and that
assumption was hard-wired across five places: the Zod schema
(`targetEntityId` required), `parseEventEffects` (3-kind allow-list, target
required), the declared-effect validation, the apply path
(`loadEffectTargetCrawler` → `effectEntityPatch` → a single `crawler.*` patch),
and the preview builder.

Two new needs broke that mold:

1. **Floor day origin.** Floor 1 almost always starts on day 1, but unless the DM
   set `data.startDay` by hand, floor-1 `FLOOR_START`-relative events couldn't be
   placed on the absolute-day axis (ADR 0008).
2. **A floor-collapse effect.** The DM wanted to mark, on an event, that the floor
   collapses there — closing the current floor, opening the next, and advancing
   the campaign's current floor. That acts on FLOOR entities and the campaign, not
   a crawler, so it doesn't fit the `crawler.*` effect shape at all.

## Decision

### 1. Floor-1 `startDay` defaults to day 1 — at the resolution layer only

`effectiveFloorStartDay(floorNumber, startDay)` ([`src/lib/floor.ts`](../../src/lib/floor.ts))
returns `startDay ?? (floorNumber === 1 ? 1 : null)`. It is applied where
`FloorAnchors` maps are assembled for day resolution (the timeline projection in
`events.ts`, the header status in `campaigns.ts`, and the order-derivation in
`review.ts`) — **not** in `readFloorData`, which stays a faithful parser so the
FLOOR edit form still shows an unset start as blank. Deeper floors with no anchor
stay unresolved.

### 2. An event-effect kind registry

[`src/lib/event-effect-kinds.ts`](../../src/lib/event-effect-kinds.ts) is the seam
for adding effect kinds without re-deriving per-kind branching. Each kind has
metadata: a `label`, a `target` (`"CRAWLER"` | `"NONE"` — future non-crawler
entity targets extend this), and `usesStat` / `usesAlive` flags the editor reads.
`eventEffectRequiresTarget(kind)` drives the now-**optional** `targetEntityId`
across the schema, parse/serialize, declared-effect validation, projection, and
the editor UI. The existing three crawler kinds are unchanged in behavior; their
materialization path (`effectEntityPatch`/`buildEffectPreviews`) is untouched.

### 3. `COLLAPSE_FLOOR` materializes via a dispatch, not a `crawler.*` patch

On apply, `applyApplyEventEffects` dispatches by kind: crawler kinds take the
existing single-crawler patch path; `COLLAPSE_FLOOR` calls
`applyFloorCollapseEffect`, which (operator decisions baked in):

- resolves the event's floor **N** and absolute day **D** (rejects if either is
  unresolvable — an UNSCHEDULED or anchorless event can't drive a collapse);
- closes floor N (`data.collapseDay = D`), **auto-creating** the FLOOR entity if
  it was never modelled, so the close always has a subject;
- opens floor N+1 **the same day** (`data.startDay = D`), auto-creating it if
  missing;
- advances `Campaign.currentFloorId` to floor N+1.

Floor writes route through the same lock-aware `applyCreateEntity` /
`applyUpdateEntity` apply path as any op, so they carry provenance, enforce
floor-number uniqueness, and re-derive floor anchoring (ADR 0008). The
current-floor advance is a direct campaign write (ADR 0005), kept atomic inside
the apply transaction.

### Trigger / approval

`COLLAPSE_FLOOR` rides the **existing declare → apply → review** effect flow: the
DM declares it on an event, applies it (queueing a change set), and approves it —
identical to how stat effects work today. The "DM edits auto-approve" invariant
applies to entity/event **edits**; effects are deliberately a declare-then-apply
flow even for the DM. An AI-origin collapse uses the same op via the pending path.

A future refinement — auto-approving a DM-triggered collapse without a queue stop
— is intentionally **not** done here: the auto-approve change-set helpers only
support "apply all unmarked effects," not a single selected effect (effect→
operation binding needs an operation id that doesn't exist until the change set is
created). Selecting one effect to auto-apply would need new binding plumbing; it
was scoped out to keep this change consistent with the existing effect lifecycle.

### Robustness: validate early, fail gracefully, preview honestly

A collapse can only resolve if its event is on a floor *and* has a resolvable
in-game day. To keep that from surfacing as an opaque failure deep in the approve
transaction:

- **Apply-time pre-flight** (`applyEventEffects`): before any change set is
  queued, a collapse's event is checked for a floor and a resolvable day. If it
  fails, the DM gets an actionable inline message ("…can't be resolved yet; give
  it an absolute day…") on the timeline and nothing is queued.
- **Single-sourced resolver** (`event-resolve-context.ts`): the apply-time
  validator and the approve-time materializer share one `buildCampaignResolveContext`,
  so "resolvable at apply" can't disagree with "resolves at approve."
- **Graceful approve** (`approveChangeSetAction`): the approve transaction is
  wrapped so a `ServiceError` (or anything else) becomes a banner on the Review
  Queue (`?error=`), never an unhandled error page. The change set rolls back and
  stays pending.
- **Honest preview**: the Review Queue renders a description for target-less
  effects (`readEffectSeeds` / `EffectOperationEditor` no longer drop non-crawler
  kinds), so a collapse op reads "Floor collapses — closes the current floor and
  opens the next the same day" instead of an empty operation.

## Consequences

- Adding an effect kind is now: a value + a `eventEffectKindMeta` entry + a
  `superRefine` branch + an apply branch + a `describeEffect` phrase. Non-crawler
  and campaign-scoped kinds are first-class.
- `EventEffectView.targetId` and the stored effect's `targetEntityId` are nullable;
  consumers render the target only when present.
- `readFloorData` stays pure; the floor-1 default is a resolution-time concern.
