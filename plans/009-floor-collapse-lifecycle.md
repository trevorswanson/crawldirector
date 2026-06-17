# Plan 009: Floor lifecycle — `startDay=1` default + a `COLLAPSE_FLOOR` event effect

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything under "STOP conditions" occurs, stop and report — do not improvise.
> Branch **from `main`**. The unit suite (`npm run test:coverage`) runs against
> the local Postgres (db `dcc`) and **wipes tables**; coverage floors
> (95% stmts / 85% branches / 95% funcs / 95% lines) are a hard gate. Do not
> push or open a PR unless the operator says so.

## Status

- **DELIVERED** (2026-06-17). Both parts implemented; full coverage gate green
  (1391 tests; 95.23 / 88.44 / 97.45 / 97.12). Operator decisions baked in:
  same-day open (`startDay(N+1) = collapseDay(N) = D`), auto-create the floor to
  close it, and `COLLAPSE_FLOOR` modelled as a true `effects[]` row via a new
  extensible **event-effect kind registry** ([`src/lib/event-effect-kinds.ts`](../src/lib/event-effect-kinds.ts)),
  documented in [ADR 0010](../docs/adr/0010-event-effect-kind-registry-and-floor-collapse.md).
  Trigger uses the existing declare→apply→review effect flow (not DM-auto-approve —
  see ADR 0010 "Trigger / approval" for why; that refinement is a scoped follow-up).
- **Priority**: P2 (DM-facing feature; unblocks accurate day math per floor)
- **Effort**: Part A = S, Part B = L
- **Risk**: Part A LOW, Part B MEDIUM (touches the review materialization path)
- **Depends on**: the `createCampaignFloorEntityAction` added for the timeline
  "Create floor" button (already on this branch) — Part B reuses its create
  path to ensure the next floor exists.
- **Category**: feature / world-model correctness
- **Decided with operator**: a **single "Collapse" effect** (not separate
  open/close): one effect closes the current floor, creates the next floor if
  missing, opens it, and advances the campaign's current floor — modelled as a
  *collapse* because a crawler can descend before the floor transitions.

## Why this matters

Two gaps in the floor day-model (ADR 0008):

1. **Floor 1 has no implicit origin.** A FLOOR entity's `data.startDay` anchors
   `FLOOR_START`-relative event times onto the absolute-day axis. Floor 1
   almost always starts on day 1, but unless the DM sets `startDay` by hand,
   floor-1 events that say "FLOOR_START + 3 days" can't resolve — so the global
   "Day N" chip and the per-floor day-range read blank or wrong out of the box.

2. **Floor transitions are all manual.** Closing a floor and opening the next
   means: editing the current FLOOR's `collapseDay`, creating the next FLOOR
   entity, setting its `startDay`, and re-pointing the campaign's current floor
   — four hand steps the DM does on a collapse that the system has all the
   information to do from one event.

## Current state (verify before changing)

Effect model and pipeline (all confirmed at branch tip):

- Effect kinds: `eventEffectKindValues = ["ADJUST_STAT","SET_STAT","SET_ALIVE"]`
  in `src/lib/validation.ts` (~line 429); per-kind validation in
  `eventEffectSchema.superRefine` (~line 443). `targetEntityId` is currently
  **required** (`.min(1, "Effect target is required.")`).
- UI: `src/components/entities/effect-rows.tsx` — `kindLabels` map (~line 30),
  the kind `<select>` iterates `eventEffectKindValues` (~line 129); stat/value
  inputs are gated on `row.kind`.
- Compact label: `describeEffect` in `src/lib/event-effects.ts`.
- Projection to the client: `projectEventEffects` / `EventEffectView` in
  `src/server/services/events.ts` (~lines 76, 93).
- Apply trigger: `applyEventEffects` in `events.ts` (~line 1397) builds a
  **pending** change set with one `OpKind.APPLY_EVENT_EFFECTS` op and marks the
  event's effects pending-review.
- **Materialization on approval**: `effectEntityPatch` (`review.ts` ~line 3321)
  turns each effect into a `crawler.*` `ReviewPatch` against **one crawler**
  target; `buildEffectPreviews` (~line 3372) builds the diff preview; the
  allowed-kinds guard `eventEffectKinds` is a `Set` (~line 3166); the
  reviewed-effect roundtrip is near `review.ts:4174`. **This whole path assumes
  the effect targets a single CRAWLER and writes `crawler.*` fields.**
- FLOOR data contract: `readFloorData` in `src/lib/floor.ts` →
  `{ floorNumber, theme, startDay, collapseDay }` (a pure parser — keep it pure).
- Day resolution: `src/lib/time-resolve.ts` — `resolveAbsoluteDay` (~line 95),
  `computeFloorDayRanges` (~line 108), `FloorAnchors` (~line 34); `FLOOR_START`
  / `FLOOR_COLLAPSE` bases resolve off `startDay` / `collapseDay`.
- `FloorAnchors` maps are assembled in **three** places — keep them consistent:
  1. `buildCampaignFloorMeta` in `events.ts` (the timeline projection),
  2. `getCampaignHeaderStatus` in `src/server/services/campaigns.ts` (~line 130,
     the global-shell floor/day chip),
  3. the order-derivation in `review.ts`.
- On approving a FLOOR `UPDATE_ENTITY` touching `data.startDay` /
  `data.collapseDay` / `data.floorNumber`, `review.ts` (~line 2536) already
  re-derives the affected floors' event anchoring and enforces floor-number
  uniqueness (`assertFloorNumberAvailable`). **Reuse this — don't reinvent it.**
- Advancing the current floor: `setCampaignCurrentFloor` in `campaigns.ts` is a
  **direct write** (ADR 0005), *not* routed through review. There is **no**
  `UPDATE_CAMPAIGN` `OpKind` (enum: CREATE/UPDATE/DELETE_ENTITY,
  *_RELATIONSHIP, CREATE/UPDATE_EVENT, *_EVENT_CAUSALITY, APPLY_EVENT_EFFECTS).

## Part A — Floor 1 `startDay = 1` default (ship first, independently)

**Decision**: apply the default at the **resolution layer**, not in
`readFloorData`. Keep the parser honest (an unset `startDay` stays `null` so the
edit UI shows it blank); only the day-math treats floor 1's missing start as 1.

Steps:

1. Add a tiny shared helper, e.g. in `src/lib/floor.ts`:
   ```ts
   // Floor 1 is the crawl's origin: absent an explicit start, it opens on day 1
   // so FLOOR_START-relative times resolve out of the box (plan 009 / ADR 0008).
   export function effectiveFloorStartDay(
     floorNumber: number | null,
     startDay: number | null,
   ): number | null {
     return startDay ?? (floorNumber === 1 ? 1 : null);
   }
   ```
2. Use it at all three `FloorAnchors`-assembly sites listed above, when
   populating each floor's `startDay` for resolution (NOT when echoing the value
   back to an edit form).
3. Tests (`tests/unit/`): a floor-1 event with `FLOOR_START + N days` and no
   explicit `startDay` resolves to day `1 + N`; the global header chip reports
   the right "Day N"; a floor-2 floor with no `startDay` still resolves to
   `null` (no spurious default).

**STOP** if any existing time-resolution test changes meaning in a way the plan
didn't predict — surface it; a campaign may rely on floor-1 currently reading
blank.

## Part B — `COLLAPSE_FLOOR` effect

### Chosen architecture (recommended): a dedicated collapse change set

Do **not** extend `effectEntityPatch` / `buildEffectPreviews`. Those are the
crawler-stat materialization core (the review god-file is explicitly flagged as
high-risk to touch in `plans/README.md`), and their single-crawler-target,
`crawler.*`-only assumption is baked deep. Instead:

- `COLLAPSE_FLOOR` lives in the event's `effects[]` for **intent + display**
  (so the DM declares "this event collapses the floor" on the event, exactly the
  affordance requested), but it **materializes through its own change set** of
  standard ops, analogous to how `applyEventEffects` assembles one — not as a
  `crawler.*` patch.

### Materialization (on apply, from the event's resolved day **D**)

Let `N` = the event's floor (`event.inGameTime.floor` / its `orderKey`); `D` =
`resolveAbsoluteDay(event.time, ctx)`.

1. **Guard**: if `D` is `null` (UNSCHEDULED event, or unresolved chain), reject
   with a clear `ServiceError` — a collapse needs a day to anchor.
2. **Close current floor**: `UPDATE_ENTITY` on floor `N`'s FLOOR entity →
   `data.collapseDay = D`. (If floor `N` has no entity, create it first via the
   same path as step 3 so there is something to close — or reject; see open
   decision #2.)
3. **Ensure next floor exists**: if floor `N+1` has no live FLOOR entity, create
   one (`CREATE_ENTITY`, `data.floorNumber = N+1`, stub) — reuse the create path
   behind `createCampaignFloorEntityAction`.
4. **Open next floor**: `UPDATE_ENTITY` on floor `N+1` → `data.startDay = D + 1`
   (contiguous, no overlap; see open decision #1).
5. **Advance current floor**: on approval, call `setCampaignCurrentFloor` for
   floor `N+1`'s entity (direct write per ADR 0005 — keep it out of the review
   ops, mirror how current-floor changes already work).

All of steps 2–4 are ordinary `CREATE_ENTITY` / `UPDATE_ENTITY` ops, so they
ride the existing approval, provenance, floor-number-uniqueness, and FLOOR-anchor
re-derivation logic (`review.ts:~2536`) for free.

### Schema + validation (`src/lib/validation.ts`)

- Add `"COLLAPSE_FLOOR"` to `eventEffectKindValues`.
- In `eventEffectSchema`: make `targetEntityId` **optional for COLLAPSE_FLOOR**
  (the floor is derived from the event, not picked) — relax the `.min(1)` via a
  branch in `superRefine`, or make the field optional and require it for the
  stat/alive kinds in `superRefine`. COLLAPSE needs no `stat`/`delta`/`value`.

### Display

- `describeEffect` (`event-effects.ts`): `COLLAPSE_FLOOR` → e.g.
  `"Floor collapses → opens Floor N+1"` (target-agnostic; the floor number can
  come from the `EventEffectView` if we thread it, else a generic phrasing).
- `effect-rows.tsx`: add a `kindLabels` entry ("Collapse floor") and, when the
  row kind is `COLLAPSE_FLOOR`, hide the stat/value inputs (like `SET_ALIVE`
  hides the stat selector) — the row needs no extra fields.
- `projectEventEffects` / `EventEffectView`: carry the new kind through; the
  timeline's `TimelineEffects` and the review effect preview render it as a
  structural note rather than a crawler before/after.

### ADRs

- **Amend ADR 0008** (floor model + time inference): document the floor-1
  `startDay` default and the collapse-driven anchoring of `collapseDay`(N) /
  `startDay`(N+1).
- **New ADR 0010** (or amend 0005): the `COLLAPSE_FLOOR` effect — why it
  materializes as a dedicated change set instead of through `effectEntityPatch`,
  and why current-floor advance stays a direct write.

### Tests (Part B)

- `COLLAPSE_FLOOR` on a day-`D` event closes floor `N` (`collapseDay = D`),
  creates floor `N+1` when absent with `startDay = D+1`, and updates it in place
  when present.
- Current floor advances to `N+1` on approval.
- UNSCHEDULED / unresolved-day collapse is rejected with the guard message.
- Floor-number uniqueness still holds (no duplicate `N+1` if a stub already
  exists).
- Player visibility: a secret collapse event doesn't leak the new floor to
  players via the header/ladder.
- Validation: COLLAPSE row needs no target/stat; stat kinds still require theirs.

## Open decisions for the operator (pre-build sign-off)

1. **Day boundary** — next floor `startDay = D + 1` (contiguous, recommended) vs
   `= D` (same-day overlap, "the stairs open as it falls"). DCC canon leans
   same-day-ish; the plan defaults to `D+1` for clean, non-overlapping ranges.
2. **Collapsing a floor that has no FLOOR entity** — auto-create it to close it
   (recommended, symmetric with step 3) vs reject and tell the DM to create the
   floor first (via the timeline "Create floor" button).
3. **Apply path** — go through the **review queue** like other effects
   (recommended: auditable, reversible, consistent) vs auto-approve the collapse
   change set (faster, but skips review for a structural mutation).

## STOP conditions

- Any change to `effectEntityPatch` / `buildEffectPreviews` becomes necessary —
  stop; the chosen architecture is specifically to avoid touching them. Re-plan
  before editing the crawler-effect core.
- Coverage drops below the gate, or an existing time-resolution / review test
  changes meaning — stop and report with the diff.
- The collapse needs an `UPDATE_CAMPAIGN` review op (it must not — current floor
  is a direct write).
