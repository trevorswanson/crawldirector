# PROGRESS

Running checklist of milestones/tasks, newest first. See
[`11-roadmap.md`](./11-roadmap.md) for the full plan and
[`12-working-sessions.md`](./12-working-sessions.md) for how to pick up work.

## Open backlog from docs / ADRs (authoritative pickup list)

This section is the first stop for deferred work found outside the newest
milestone entries. Older sections may preserve historical context, but open
items should be mirrored here so agents do not have to rediscover them by
keyword-scanning every doc.

### Active next slices

- [ ] **Entity-kind registry ([ADR 0009](./adr/0009-entity-kind-registry.md),
      accepted).** Consolidate per-type bespoke `data.*` fields into one
      `EntityKind` descriptor per type and derive validation, data-key lists, the
      reviewable/lockable field set, the form, and the detail display from it —
      retiring the `type === "X"` branches in `validation.ts`, `entities.ts`,
      `review.ts`, the entity form, and the detail page. Pure app-layer refactor;
      **no schema change / migration** (bespoke fields already live in
      `Entity.data`). Phased, each behavior-preserving:
      - [x] **Slice 1 — registry scaffold + FLOOR.** ✅ (2026-06-07) — see the
            section below.
      - [x] **Slice 2 — ITEM + derive the reviewable-field set wholesale.** ✅
            (2026-06-07) — see the section below.
      - [ ] **Slice 3 — display slot + next bespoke type as proof.** Add the
            `DisplayPanel` slot, move FLOOR's special display into it, and onboard
            the next bespoke type entirely through a new descriptor file. **Also
            fold in the apply-path data assembly** still hardcoded in
            [`review.ts`](../src/server/services/review.ts) (`applyCreateEntity`,
            the update `buildEntityData`, and `getCurrentValue`'s `data.*` switch),
            plus the ITEM form (`ItemFields` + the `aiDescription` block in
            `CoreFields`) and the entity-detail ITEM display — the remaining
            hardcoded `type === "ITEM"/"FLOOR"` lists, once a `DisplayPanel`/form
            slot + a registry-driven `data` builder exist.
- [ ] **M4 generator expansion.** Add bulk-stub scaffolding, a generation panel
      for bulk runs, a `Job` table + worker for bulk/async runs, and usage/cost
      tracking with spend caps.
- [ ] **Visibility model simplification.** Refactor the visibility enum throughout the codebase (Prisma schema, type validation, forms, and visibility projections) from the three-state model (`DM_ONLY`, `SHARED_WITH_PLAYERS`, `PLAYER_FACING`) to a clean binary model (`DM_ONLY`, `PLAYER_VISIBLE`), mapping any subset access strictly to dynamic `KnowledgeGrant` (fog of war).

### Follow-ups captured from delivered slices

- [ ] **Entity image support (M1 follow-up).** Support uploading or linking a main image (`imageUrl`) for any entity:
      - Add `imageUrl String?` to the `Entity` database model and validate on writes.
      - Add image upload/input to `EntityForm` (fully reviewable, lockable, and provenance-tracked).
      - Render the image/avatar in the entity detail header (avatar size for characters, card/illustration style for items/locations/floors).
- [ ] **Knowledge / reveal grants.** Extend beyond ENTITY→ENTITY to
      field/relationship/event/FACT targets and MEMBERSHIP recipients; wire the
      M7 player "known world" projection and M11 agent fog-of-war context; add a
      reveal undo affordance and source-event linking for M8 session reveals.
- [ ] **Event effects ergonomics.** Deep-link timeline pending-effect badges to
      their Review Queue proposals, and design compensating change sets for
      undo/revert of already-applied effects.
- [ ] **Timeline roster snapshots.** Let the timeline pass an inferred/current day
      into `getGroupRoster({ asOfDay })` when the DM wants a roster snapshot from
      a selected event or floor-day band.
- [ ] **Scale refinements for pickers and graph labels.** Revisit connection /
      timeline target lists with M5 search/typeahead, and revisit relationship
      graph label crowding with M12 graph analytics.
- [ ] **Global current floor & day HUD.** Render the current campaign floor (from `Campaign.currentFloorId`) in the top-right of the global header on all pages (matching the mockup design). If a current day can be inferred (the absolute day of the most recent event using `resolveAbsoluteDay`), render it next to the floor (e.g., "Floor 9 · Day 12").
- [ ] **M8/M12 broadcast HUD chrome.** Add a live broadcast ticker with session
      events/reveals in M8, and at-a-glance audience-rating tickers with M12
      broadcast/fan-economy modeling.

### Deferred design options, not current blockers

- [ ] **Review Queue auto-supersede.** Optional: auto-supersede fully obsolete
      proposals when canon changes underneath. Current design deliberately keeps
      stale proposals pending for DM three-way review.
- [ ] **Relationship per-edge display labels.** Optional schema addition:
      per-edge display/inverse-label overrides. ADR 0003 intentionally defers
      this until real one-off phrasing needs appear.
- [ ] **Time model refinements.** Cross-floor wall-clock ordering, per-event
      time uncertainty/ranges, recurring scheduled events, floor-duration
      uncertainty, sub-floor "current zone," and per-crawler spatial history
      beyond the event log remain intentionally out of scope unless a campaign
      needs them.
- [ ] **Coverage ratchet.** `FxToggle` and `DmNav` render/interaction tests now
      exist. The current gate is 95% statements / 85% branches / 95% functions /
      95% lines; raise the branch floor toward 90% when aggregate branch coverage
      supports it.
- [ ] **Campaign settings page redesign & expansion (M9).** Redesign the settings
      page `/campaigns/[id]/settings` to use the three-pane layout. The middle
      pane will act as a sub-nav with options:
      - **General**: Campaign name, description, and visibility toggle (allow dungeons to be publicly visible if the DM wants).
      - **Crawlers**: Inviting other users to the campaign and managing user memberships/roles.
      - **AI Providers**: BYO API keys configuration.
- [ ] **Game-progression modeling (M7).** Implement:
      - **Event achievement grants**: Allow events to grant achievements to crawlers via a structured `GRANT_ACHIEVEMENT` event effect.
      - **Achievement box rewards**: Model `BOX` as a new `EntityType`. Allow achievements to grant boxes (e.g. via `GRANTS_BOX` relationships).
      - **Box contents**: Support boxes containing items (using `CONTAINS` relationships from box entities to item entities).

## Entity-kind registry — ITEM + derive the reviewable set (ADR 0009 slice 2) ✅ (2026-06-07)

**Goal:** continue [ADR 0009](./adr/0009-entity-kind-registry.md) (accepted) —
port the ITEM type's bespoke `data.*` fields into the registry, **derive the
reviewable/lockable field set wholesale** from all registered descriptors, and
shrink `entityCoreSchema` back to genuinely shared fields. Pure application-layer
refactor: **no schema change, no migration**, behavior preserved (the same fields
validate, persist, review, lock, and render).

- [x] **ITEM descriptor** (`src/lib/entity-kinds/item.ts`): `itemDataSchema` +
      `ITEM_KIND` hold ITEM's five `data.*` fields (`itemTypeId`/`divine`/`unique`/
      `fleeting`/`aiDescription`) once. The boolean flags stay `.optional()` (so the
      input key stays optional — `.default(false)` flips the inferred key to
      *required*); instead the descriptor declares `dataDefaults:
      { divine:false, unique:false, fleeting:false }`, the new optional
      `EntityKind.dataDefaults` slot that tells the patch builders an unset flag
      persists as `false` (everything else defaults to `null`), preserving the
      prior `?? false` / `?? null` handling.
- [x] **Registry** (`src/lib/entity-kinds/index.ts`): registered `ITEM` (before
      `FLOOR`, to match the historical `dataKeys` order). Added `allKindDataShape()`
      (the merged Zod shape for the write schemas) and `kindDataDefaults(type)` (the
      per-field empty-value map). `allKindDataKeys`/`dataKeysFor` unchanged.
- [x] **`entityCoreSchema` is core again** (`validation.ts`): dropped the ITEM
      fields *and* the `...floorDataSchema.shape` spread — it now validates only
      `name`/`summary`/`description`/`visibility`/`tags`/`isStub`. The bespoke
      fields are spread into the **write** schemas
      (`createGenericEntitySchema`/`updateEntitySchema`) via `allKindDataShape()`.
      `itemKeys`/`floorKeys` are now `dataKeysFor("ITEM"|"FLOOR")` and `dataKeys` is
      `allKindDataKeys()` — every key list derives from the descriptors.
- [x] **Deviation from the ADR's "validate for its type only" sketch (noted):** a
      static Zod schema can't know the entity type at parse time, so the write
      schema accepts the *union* of all kinds' fields; the patch builders persist
      only `dataKeysFor(type)`, so off-type fields are validated-then-ignored (the
      exact prior behavior). The ADR's core win — `entityCoreSchema` no longer
      carries every type's attributes, and the key/reviewable sets can't drift —
      holds. The union shape is spread explicitly (`...itemDataSchema.shape,
      ...floorDataSchema.shape`) rather than iterated over the type-erased registry
      so the inferred input types keep each field's precise type.
- [x] **Patch builders fully data-driven** (`entities.ts`): deleted the hardcoded
      ITEM `data.*` lines from the create patch and the ITEM `addPatch` lines from
      the update patch. Both now iterate `dataKeysFor(type)` with
      `kindDataDefaults(type)` for the empty value (booleans → `false`, else
      `null`), so a non-kind type contributes no `data.*` patch entries.
- [x] **Reviewable-field set derived wholesale** (`review.ts`): `dataFields` is now
      just `new Set(allKindDataKeys().map((k) => \`data.${k}\`))` — the hand-listed
      ITEM keys are gone, so a registered kind's fields are automatically
      reviewable/lockable and can't drift from the schema.
- [x] **Behavior preserved; one intentional cleanup.** Stored `data` is unchanged
      (the canonical writer `applyCreateEntity` still composes the JSON). The one
      observable change: a **non-kind** entity (e.g. NPC) no longer records the five
      spurious `data.*` provenance rows on create (its patch carries no `data.*`
      keys) — strictly more correct. ITEM/FLOOR create/update/lock/provenance are
      byte-identical, and the ITEM form DOM is untouched.
- [x] **Tests:** extended `entity-kinds` (ITEM descriptor resolve, per-type +
      unioned data keys, `allKindDataShape`, `kindDataDefaults`, ITEM flag/text
      parse); new `entities` DB-backed case asserting ITEM omitted-flags persist as
      `false` + ITEM records `data.*` provenance while a non-kind NPC records none.
      Existing `entities`/`review`/`events`/`generation`/`entity-forms`/
      `entity-page`/`dm-actions`/`validation` suites pass unchanged. lint (0 errors;
      2 pre-existing settings warnings), typecheck, build, and the full coverage
      gate green (1007 tests; statements 95.27%, branches 88.2%, functions 97.65%,
      lines 97.27%).
- [x] **Verification boundary:** pure, behavior-preserving refactor (no schema/
      migration, untouched form DOM, identical stored data), covered by the
      DB-backed `entities`/`review`/`events` suites and the real-component form/page
      suites (same precedent + port-3000 constraint as prior slices).
- [x] **Remaining (folded into slice 3 / open backlog):** the canonical
      apply-path `data` assembly is still hardcoded in `review.ts`
      (`applyCreateEntity`, the update `buildEntityData`, `getCurrentValue`'s
      `data.*` switch), as is the ITEM form (`ItemFields` + the `aiDescription`
      block) and the entity-detail ITEM display. Slice 3 adds the `DisplayPanel`/
      form slot + a registry-driven `data` builder and retires these last
      hardcoded `type === …` lists.

## Entity-kind registry — registry scaffold + FLOOR (ADR 0009 slice 1) ✅ (2026-06-07)

**Goal:** start [ADR 0009](./adr/0009-entity-kind-registry.md) (accepted) — stand
up a per-type `EntityKind` registry as the single source of truth for a type's
bespoke `data.*` fields, and route FLOOR through it, deleting the scattered
`type === "FLOOR"` branches. Pure application-layer refactor: **no schema change,
no migration**, behavior unchanged (FLOOR's fields validate, persist, review,
lock, and render exactly as before).

- [x] **Pure registry** (`src/lib/entity-kinds/`): `EntityKind` descriptor
      (`types.ts`), `FLOOR_KIND` + `floorDataSchema` (`floor.ts`), and the
      registry (`index.ts`: `kindFor`, `dataKeysFor`, `allKindDataKeys`). The
      descriptor is Zod/TS-only (no React) so server validation/patch/review can
      import it. FLOOR's four fields (`floorNumber`/`theme`/`startDay`/
      `collapseDay`) now live once in `floorDataSchema`.
- [x] **Shared Zod helpers extracted** (`src/lib/zod-field-helpers.ts`):
      `optionalText` / `optionalInt` moved out of `validation.ts` so the
      descriptor reuses the exact field shapes without a circular import.
- [x] **Validation derives from the descriptor** (`validation.ts`):
      `entityCoreSchema` spreads `...floorDataSchema.shape` (one definition; slice
      2 removes it from core), and `floorKeys` is now `dataKeysFor("FLOOR")` so the
      key list can't drift from the schema.
- [x] **Patch builders data-driven** (`entities.ts`): the create + update
      `data.*` builders iterate `dataKeysFor(type)` (`kindDataCreatePatch` +
      an update loop) instead of a duplicated `if (type === FLOOR)` block.
      Empty/absent normalizes to `null`, matching the prior
      `nullIfEmpty` / `?? null` handling.
- [x] **Reviewable-field set derived** (`review.ts`): the FLOOR slice of
      `dataFields` is now `...allKindDataKeys().map((k) => \`data.${k}\`)` (ITEM
      still hand-listed until slice 2), so a registered kind's fields are
      automatically reviewable/lockable.
- [x] **Form routed through the registry**: a client companion
      (`src/components/entities/kind-fields.tsx`, `kindFormFields`) holds the
      per-type `FormFields` (`FloorFields`) keyed by EntityType; `entity-forms.tsx`
      renders `kindFormFields(entity.type)` instead of the inline FLOOR IIFE. The
      rendered DOM (ids/names/locked hidden mirrors) is byte-identical.
- [x] **Deviation from the ADR sketch (noted):** the ADR co-locates `FormFields`
      on the descriptor object. To respect the RSC server/client boundary (server
      validation/patch/review must not import client components), `FormFields`
      lives in a client companion registry keyed by the same EntityType rather
      than on the pure descriptor. `DisplayPanel` (slice 3) will follow the same
      split. The "one logical place per type, no scattered `type ===` branches"
      goal is preserved.
- [x] **Tests:** new `entity-kinds` unit suite (`kindFor`/`dataKeysFor`/
      `allKindDataKeys`, undefined + empty branches, `floorDataSchema` parse +
      reject) and `kind-fields` component suite (FLOOR inputs, locked read-only +
      hidden mirrors, null-data tolerance, undefined for non-kind types). Existing
      `entities`, `review`, `entity-page`, and `entity-forms` suites pass
      unchanged. lint (0 errors; 2 pre-existing settings warnings), typecheck,
      build, and the full coverage gate green (1003 tests; statements 95.26%,
      branches 88.22%, functions 97.65%, lines 97.27%; new files fully covered).
- [x] **Verification boundary:** pure, behavior-preserving refactor with
      byte-identical form DOM, covered by the real-component `kind-fields` /
      `entity-forms` suites and the DB-backed `entities`/`review` suites (same
      precedent + port-3000 constraint as prior slices).
- [x] **Remaining:** slices 2 (ITEM + derive the reviewable set wholesale, shrink
      `entityCoreSchema`) and 3 (`DisplayPanel` slot + next bespoke type) stay in
      the open backlog.

## M4 — Relationship inference generator (slice 4) ✅ (2026-06-07)

**Goal:** add the second concrete generator family from
[`04-ai-integration.md`](./04-ai-integration.md): infer likely typed
relationships involving one existing entity and route them to the Review Queue
as **PENDING `CREATE_RELATIONSHIP` proposals**. Nothing becomes canon until the
DM approves it (invariant #1), and approved relationship fields retain AI
provider/model/prompt provenance (invariant #3).

- [x] **Generator** (`src/server/ai/generators/infer-relationships.ts`): pure
      prompt/schema/operation logic. `buildInferRelationshipsPrompt` scopes the
      task to one target entity, lists candidate canon entities and existing
      target relationships, and tells the model to use only listed ids. The Zod
      output schema bounds proposals to at most 8 relationships with valid
      `RelationshipType`, optional disposition, notes, and secret flag.
      `inferenceToRelationshipOperations` filters unknown/self/non-target edges,
      exact or symmetric duplicates, and the ADR 0008 discouraged
      `CRAWLER —LOCATED_ON→ FLOOR` path before building
      `CREATE_RELATIONSHIP` review operations.
- [x] **Service + provenance:** `inferRelationshipsForEntity`
      (`src/server/services/generation.ts`) is DM/co-DM only, loads the target,
      up to 40 live canon candidates, current target relationships, and the
      campaign style guide; resolves the configured provider; calls structured
      output; refuses no-op/empty usable proposals; and files the results through
      `createPendingRelationshipChangeSet` with `source: AI` plus
      provider/model/prompt metadata. The relationship pending-change-set helper
      now persists those metadata fields so approval copies them onto
      `Provenance` rows for each relationship field.
- [x] **Action + UI:** the entity detail rail's `GeneratePanel` now offers
      **Infer relationships** next to **Flesh out** when the existing provider-key
      gating shows the panel. The action returns a safe success/error state,
      revalidates the entity + Review Queue, and links directly to the created
      proposal set.
- [x] **Tests / verification:** new pure generator suite; DB-backed generation
      suite for pending proposal creation, prompt context, no usable proposal
      refusal, player denial, and AI provenance after approval; action and
      `GeneratePanel` component coverage. Focused generator/action/panel suite
      green (142 tests). lint (0 errors; 2 pre-existing settings-action warnings),
      typecheck, build, and the full coverage gate green (988 tests; statements
      95.3%, branches 87.89%, functions 97.54%, lines 97.27%).
- [x] **Remaining M4 expansion:** bulk-stub scaffolding, bulk-run UX, async
      `Job` worker, and usage/cost tracking with spend caps remain in the open
      backlog. A live provider call still depends on the DM's own BYO key/spend,
      so this slice is verified through mocked-provider service coverage rather
      than a live generation run.

## M3 — Retire duplicate floor authoring paths (ADR 0008 slice 3) ✅ (2026-06-07)

**Goal:** finish [ADR 0008](./adr/0008-floor-model-unification-and-time-inference.md)
§3 — one source of truth per floor concept. Slices 1–2 delivered the time anchors,
inference, the campaign-unique floor-number key, and resolved FLOOR links. This
slice retires the two *redundant* authoring paths the DM flagged: a floor attached
to an event as a participant (redundant with `timeRef.floor`), and a crawler's
floor expressed as a `LOCATED_ON`→FLOOR edge (redundant with `Crawler.currentFloor`).
Both are soft, UI/suggestion-level guards — the DB stays any-to-any (invariant #7).

- [x] **Events no longer offer FLOOR entities as participants.** An event's floor
      is its `timeRef.floor` (set via the time picker, `EventTimeFields`), never a
      FLOOR participant. A shared pure helper `withoutFloorCandidates`
      ([`participant-rows.tsx`](../src/components/entities/participant-rows.tsx))
      drops FLOOR-type candidates from every participant typeahead: the shared
      `ParticipantRows` (entity panel edit form + campaign-timeline edit form), the
      campaign-timeline `NewEventForm`'s local participant editor, the entity
      panel's quick-log "Add participant (optional)" picker (whose section now also
      hides when floors are the only candidates), and the Review Queue's
      `ParticipantsReviewInput`
      ([`operation-diff-editor.tsx`](../src/components/review/operation-diff-editor.tsx)).
      A FLOOR already attached to a legacy event still renders (its row carries the
      resolved value) — it just can't be re-picked. Relationship source/target
      pickers are deliberately untouched (a BOSS/LOCATION `LOCATED_ON` FLOOR stays
      valid).
- [x] **The relationship create UI no longer offers crawler `LOCATED_ON`→FLOOR.**
      A new `isDiscouragedRelationship`
      ([`relationship-types.ts`](../src/lib/relationship-types.ts)) flags exactly
      `CRAWLER —LOCATED_ON→ FLOOR`; `relationshipPickerOptions` excludes discouraged
      types from both the suggested list *and* the "Show all" categories, and
      `rankedSuggestedTypes`/`defaultRelationshipType` never surface it. "Where is
      this crawler" is `Crawler.currentFloor`, resolved to its FLOOR entity link
      (landed with slice 2). `LOCATED_ON` stays in the schema and is still suggested
      for non-crawler spatial edges (BOSS/LOCATION/NEIGHBORHOOD/NPC/MOB_TYPE → FLOOR).
- [x] **Tests:** new `relationship-types` unit suite (discouraged predicate scoping;
      crawler→FLOOR omits LOCATED_ON everywhere incl. "Show all"; BOSS→FLOOR still
      suggests it; default never LOCATED_ON); FLOOR-exclusion assertions added to the
      connections-panel, campaign-timeline, timeline-panel, and operation-diff-editor
      component suites (searching a floor in a participant/relationship picker surfaces
      nothing). lint (0 errors), typecheck, build, and the full coverage gate green
      (971 tests; statements 95.32%, branches 87.97%, functions 97.52%, lines 97.29%).
- [x] **Verification boundary:** this is a pure UI/suggestion steer with no schema,
      service, or migration change. It's covered by the real-component tests above
      (each renders the actual picker with a FLOOR candidate and asserts it isn't
      offered); in-browser spot-check deferred under the usual port-3000 constraint.
- [x] **ADR 0008 is now fully delivered (slices 1–3).** No floor-cleanup follow-up
      remains; Option B (`LOCATED_ON` as the crawler-position model) stays an
      explicitly deferred future design.

## M3 — Floor-number key + resolved FLOOR links (ADR 0008 slice 2) ✅ (2026-06-06)

**Goal:** make the floor *number* a real campaign-unique key tied to its FLOOR
entity, and resolve bare floor numbers to linked entities — the structural half
of [ADR 0008](./adr/0008-floor-model-unification-and-time-inference.md) §1
(slice 1 delivered the time anchors + inference). See ADR 0008 decision #1.

- [x] **Floor-number uniqueness** enforced in the entity create/update appliers
      (`assertFloorNumberAvailable`,
      [`review.ts`](../src/server/services/review.ts)): a second **live** FLOOR
      entity claiming a taken `data.floorNumber` is a `ServiceError` (reversing
      ADR 0005's soft "first wins"); archiving a floor frees its number for
      reuse; uniqueness is scoped per campaign. It can't be a DB constraint
      (the number lives in `Entity.data` JSON), so the service enforces it on
      both the create and update paths (the update path excludes the entity
      being edited so a no-op re-save is fine).
- [x] **Shared resolver** `resolveFloorEntity` / `resolveFloorEntities`
      ([`events.ts`](../src/server/services/events.ts)): the single
      visibility-scoped way code maps a floor number → its FLOOR entity (players
      never resolve a DM-only floor; a number with no live entity is simply
      absent so callers fall back to a number-only render).
- [x] **Resolved FLOOR-entity links** wherever a bare number showed: the
      campaign timeline band-header floor name links to its FLOOR entity; a
      crawler's `currentFloor` resolves to "Floor N · Name" — a link on the
      entity detail **Floor** field row (new optional `href` on `FieldRow`), and
      inline text on the World Browser roster card (the card is itself a `Link`,
      so no nested anchor). All gracefully fall back to the bare number when no
      FLOOR entity resolves.
- [x] **Tests:** DB-backed floor-number uniqueness (distinct ok, dup
      create/update rejected, per-campaign scoping, self re-save ok, archived
      number reuse) in `entities.test.ts`; `resolveFloorEntity(ies)` coverage
      (resolve/miss/batch/empty/player-visibility/non-member) in `events.test.ts`;
      component coverage for the entity-page floor link + bare fallback, the
      roster card resolved name, and the timeline band-header link + plain-text
      fallback. lint (0 errors), typecheck, build, and the full coverage gate
      green (944 tests; statements 95.35%, branches 87.98%, functions 97.46%,
      lines 97.25%).
- [x] **Verified in-browser** against the reseeded Demo Campaign: Carl
      (`currentFloor 9`) shows "Floor 9 · Larracos" linking to the Larracos
      FLOOR entity on his detail page and the roster; the timeline band headers
      (Larracos / The Bone Market / The Iron Choir) link to their FLOOR
      entities. No console errors.
- [x] **Remaining:** ADR 0008 slice 3 (retire the duplicate authoring paths —
      FLOOR-as-event-participant and crawler `LOCATED_ON`→FLOOR) is mirrored in
      the open backlog.

## M3 — Timeline/review quick fixes + floor-model ADR (2026-06-06)

DM-reported polish on the M3 event/timeline + review surfaces, plus a written
plan for the deeper floor cleanup.

- [x] **Review Queue stays a 3-pane layout when empty** (issue #3). Removed the
      early `return` in
      [`review/page.tsx`](../src/app/(dm)/campaigns/[id]/review/page.tsx) that
      replaced the whole page with a centered box; the persistent filter/queue
      rail (Pending/Closed toggle + source facets) now always renders, and the
      "No pending/closed proposals" message shows in the detail column.
- [x] **Effects can be declared while logging a new event** (issue #5), at
      parity with the edit path. `createEventSchema` accepts `effects`;
      `createEvent` carries them in the `CREATE_EVENT` patch (the apply path
      `applyCreateEvent` already persisted declared effects); both create actions
      (`createCampaignEventAction`, `createEventAction`) parse the effect rows;
      and `EffectRows` now renders in both the campaign-timeline `NewEventForm`
      and the entity-panel log form. Effects start **unapplied** — the DM applies
      them via the Review Queue afterward (same as editing).
- [x] **The participant-minimum rule is explained, not silent** (issue #1).
      Removing the *last* participant is intentionally blocked (an event needs
      ≥1 participant); the UI now says so — a dynamic tooltip plus a visible hint
      ("An event needs at least one participant. Add another to remove this one.")
      in the shared `ParticipantRows` and the timeline new-event form. No logic
      change; this was a UX/discoverability gap, not a bug.
- [x] **Tests:** empty-queue rail visibility + closed empty state
      (`review-queue-page`); log-with-effect submission + participant-minimum hint
      (`campaign-timeline`); `createEvent` stores declared effects unapplied +
      rejects a non-crawler effect target (`events`). lint (0 errors), typecheck,
      and the full coverage gate green (912 tests; statements 95.4%, branches
      88.22%, functions 97.44%, lines 97.24%). Browser-verified all three on a
      fresh seed.
- [x] **Floors (issue #4) — slice 1: time anchors + absolute-day inference.**
      [ADR 0008](./adr/0008-floor-model-unification-and-time-inference.md)
      (*accepted*). FLOOR entities gain `data.startDay`/`data.collapseDay`
      ("Opens on day" / "Collapses on day" on the form), plumbed through
      validation → `entities` patch builders → the `review` `dataFields` registry
      + appliers (reviewable, lockable, provenance-tracked) and surfaced per floor
      by `listCampaignFloors`. New pure `src/lib/time-resolve.ts`:
      `resolveAbsoluteDay` walks the bases (ABSOLUTE_DAY/COLLAPSE direct, EVENT
      recursive + cycle-guarded, FLOOR_START/FLOOR_COLLAPSE via anchors) and
      `computeFloorDayRanges` unions per floor, bounding each close at the next
      floor's open day. The campaign timeline's `dayRangeByFloor` uses it, so an
      `EVENT`-relative time ("2 days after Event A") now resolves and the
      floor-1→N chain fills in. Tests: full `time-resolve` unit suite (each basis,
      EVENT chains + cycle/missing-anchor, sub-day units, range + next-floor
      bound + empty-floor), FLOOR anchor persistence + `listCampaignFloors`
      surfacing (`events`), and a real-component timeline render asserting the
      DM's "Day 0 – 2" case. Browser-verified the FLOOR form anchors round-trip
      through the pipeline. 927 tests; coverage above floors. **DM confirmed: keep
      `Crawler.currentFloor`** (not the `LOCATED_ON`-edge model).
- [x] **Floors (issue #2) — slices 2 + 3 remain pending and are mirrored in the
      open backlog above.** Slice 2: enforce campaign-unique `data.floorNumber` +
      a `resolveFloorEntity` helper, render resolved FLOOR-entity links wherever a
      bare number shows. Slice 3: retire the duplicate floor paths
      (FLOOR-as-event-participant, crawler `LOCATED_ON`→FLOOR; surface
      `Crawler.currentFloor` as a resolved link).

## M4 — First generator: entity fleshing → PENDING proposal (slice 3) ✅ (2026-06-06)

**Goal:** the first real generator. A DM with their own key fleshes a thin/stub
entity into a richer summary/description/tags; the result lands in the Review
Queue as a **PENDING** `UPDATE_ENTITY` proposal (never canon — invariant #1),
respecting locks (invariant #2) and carrying AI provenance (invariant #3). The
app stays fully usable with no key. See
[`04-ai-integration.md`](./04-ai-integration.md).

- [x] **Generator** (`src/server/ai/generators/flesh-entity.ts`): pure, UI- and
      SDK-agnostic. `buildFleshEntityPrompt` assembles cacheable framing + an
      optional campaign **style guide** block + a per-entity user message (current
      canon as read-only reference, existing campaign tags offered for reuse,
      locked fields called out as do-not-modify). `fleshEntityOutputSchema` (Zod)
      bounds the writable fields (summary/description/tags). `fleshEntityToPatch`
      turns the model output into a `ReviewPatch` (current→proposed), **dropping
      locked fields** and any unchanged field, and `patchHasChanges` detects a
      no-op. `FLESH_ENTITY_GENERATOR { id, version }` is the versioned identity
      recorded for provenance.
- [x] **Provider resolution** (`src/server/ai/index.ts`): `resolveCampaignProvider`
      returns whichever provider the campaign has a usable key for (registry order,
      Anthropic first) — generators don't ask the DM to pick a vendor per run.
      Exported `describeProviderError` so the generation seam reuses the same safe,
      key-free error translation as the connection test (invariant #6).
- [x] **Service** (`src/server/services/generation.ts`): `fleshOutEntity` — DM/co-DM
      only — loads the entity + campaign style guide + sibling tags, refuses a fully
      locked entity, resolves the provider (graceful `ServiceError` when none), calls
      `generateStructured`, builds the patch (locked fields excluded), and files it
      via `createPendingEntityChangeSet` with `source: AI` + provider/model/promptId/
      promptVersion. Provider failures become safe `ServiceError`s (ProviderError
      message preserved; raw SDK text never reflected). A no-op proposal is refused.
- [x] **Pipeline:** extended `createPendingEntityChangeSet` to persist
      `providerId`/`model`/`promptId`/`promptVersion` on the `ChangeSet`; the existing
      approval path already copies them onto each field's `Provenance` row, so an
      approved AI proposal answers "where did this come from?" (invariant #3).
- [x] **Action + UI:** `fleshOutEntityAction` returns a safe success (with a link to
      the proposed change set) / error state and revalidates the queue + entity. A
      DM-only **GeneratePanel** ("Flesh out") sits on the entity detail rail, shown
      only when a provider key is configured (`listAiKeys`) and the entity isn't
      locked; success links straight to the Review Queue.
- [x] **Tests:** pure generator unit (prompt framing/style-guide/lock-exclusion/
      tag-dedupe/no-op/schema bounds); DB-backed `fleshOutEntity` (PENDING AI proposal
      with provider/model/prompt metadata + patch, style-guide+tags in prompt, locked-
      field exclusion, fully-locked + no-provider + no-change + player rejections,
      ProviderError + raw-SDK-error → safe message, AI provenance on approval);
      `resolveCampaignProvider` factory unit; action coverage (success/link/revalidate +
      ServiceError/generic); GeneratePanel component (render/locked/success-link/error);
      entity-page gating (DM+key shows, no-key hides, player hides). lint (0 errors),
      typecheck, build, and the full coverage gate green (statements 95.4%, branches
      88.15%, functions 97.35%, lines 97.26%).
- [x] **Verification boundary:** the no-key graceful path + panel gating are covered by
      the page test rendering the real server component; a **live** generation needs
      the DM's own BYO key + spend (as with slice 2's connection test), so the live
      "Flesh out" call is the DM's to run. No mock/filler output is ever shown.
- [x] **Follow-up fixes (DM feedback, 2026-06-06):**
      - **AI invisible in provenance.** The entity provenance panel showed only the
        *origin* (DM creation) source/model and the last change's *title* — so an
        approved AI flesh-out looked like a DM edit. `getEntityProvenance` now
        surfaces the most recent model-bearing change in the **Model** row and
        returns `lastChangeModel`; the panel's **Last change** row renders the
        change's `SourceBadge` (AI/DM/import) + title + model. Origin stays the
        (accurate) DM creation.
      - **Couldn't lock summary/description.** The pipeline, generator, and edit
        form already honored locks on these fields, but the read view had no
        toggle to set them (only structured fields + item `aiDescription` did).
        Added read-view lock toggles for **summary** and **description** (shared
        `FieldLockToggle`), so a DM can shield narrative prose — the fleshing
        generator already excludes locked fields.
      - Tests: `getEntityProvenance` latest-model + origin-vs-last assertions;
        entity-page coverage for the summary/description toggles (unlocked + locked)
        and the AI last-change provenance display. lint/typecheck/build/coverage
        gate green (statements 95.43%).
      - **Verification note:** in-browser deferred — port 3000 was held by a
        separate `next dev` the preview harness can't attach to (same constraint as
        prior slices). Both fixes are covered by the page test rendering the real
        server component.
- [x] **Next M4 slices captured in the open backlog:** more generators
      (bulk-stub scaffolding, relationship inference), a generation panel for
      bulk runs, `Job` table + worker for bulk/async runs, usage/cost tracking +
      spend caps.

## M4 — Provider abstraction + OpenAI-compatible providers (slice 2) ✅ (2026-06-06)

**Goal:** build the vendor-neutral provider layer every generator (later slices)
calls, and extend BYO support beyond Anthropic/OpenAI to **any OpenAI-compatible
endpoint** (a self-hosted model — Ollama/LM Studio/vLLM/llama.cpp — or a
third-party proxy). No generators yet; the app stays fully usable with no key.
See [ADR 0007](./adr/0007-provider-abstraction-and-openai-compatible.md) and
[`04-ai-integration.md`](./04-ai-integration.md).

- [x] **Registry** (`src/lib/ai/providers.ts`): added an adapter `kind`
      (`anthropic` | `openai-compatible`) + per-provider flags (`requiresBaseUrl`,
      `requiresModel`, `keyOptional`, `defaultModel`) and a third provider,
      `openai-compatible`. `resolveAiModel` picks the per-key override, then the
      provider default, then null. Still pure + client-safe.
- [x] **Schema:** nullable `AiKey.baseUrl` + `AiKey.model` (non-secret endpoint +
      model config; the key stays in `ciphertext`), migration
      `20260606120000_m4_ai_key_endpoint`. Updated
      [`09-data-schema.md`](./09-data-schema.md).
- [x] **Provider abstraction** (`src/server/ai/`, server-only): `LLMProvider`
      (`generate` + `generateStructured<T>`) with **two** adapters — Anthropic
      (`@anthropic-ai/sdk`; structured output via forced tool use, prompt caching
      on stable system blocks, default `claude-opus-4-8`) and an OpenAI-compatible
      adapter (`openai` SDK; `response_format: json_schema` strict) shared by
      OpenAI and any compatible endpoint (just a different `baseURL` + model).
      `generateStructured` derives a JSON Schema from Zod (`z.toJSONSchema`,
      `$schema` stripped), Zod-validates, and **repairs once** before throwing
      `ProviderError` (no partial canon). Token usage (incl. cache hits) returned
      on every result for later cost tracking.
- [x] **Factory + connection test** (`src/server/ai/index.ts`):
      `getCampaignProvider` resolves a campaign's stored key + config into a ready
      adapter, decrypting at the call site (invariant #6 — the single seam
      generators will call), returning null when no usable key is configured.
      `testAiConnection` (DM-only) makes a tiny structured ping through the whole
      stack so a DM can verify a key/endpoint/model before generators exist;
      provider/SDK errors become short, key-safe messages (e.g. 401 → auth
      failed). Added `getAiKeyConfig` + exported `assertCampaignDm` on the
      `ai-keys` service; `setAiKey` now validates + stores `baseUrl`/`model`
      (URL normalized; endpoint/model required for compatible providers; key
      optional for local servers) and the safe view + audit carry the non-secret
      config.
- [x] **UI:** the Settings `AiKeysPanel` adds endpoint-URL + model inputs for
      OpenAI-compatible providers, an optional-key affordance, and a per-provider
      **Test** button surfacing the model + latency (or a safe error).
- [x] **Deps:** added `@anthropic-ai/sdk` + `openai` (imported only under
      `src/server/ai/`).
- [x] **Tests:** registry unit (kinds/flags/`resolveAiModel`); adapter unit with
      mocked SDKs (forced tool use + `$schema` stripping + usage mapping, prompt
      caching, repair-retry, hard-fail `ProviderError`, no-tool-block, custom
      `baseURL`, json_schema strict, unparseable-JSON repair, empty-response,
      plain `generate`); factory + connection test (null paths, adapter selection,
      placeholder key, DM gate, error translation); DB-backed `ai-keys` for the
      compatible storage path + validation + `getAiKeyConfig`; updated action +
      panel coverage. lint (0 errors), typecheck, build, and the full coverage
      gate green (statements 95.37%, branches 88.08%, functions 97.39%).
- [x] **Verified in-browser** against the seeded Demo Campaign Settings page (see
      the verification note in this slice's commit).
- [x] **Followed by slice 3 / open backlog:** entity fleshing shipped in slice 3;
      remaining generator families, bulk/async jobs, and cost controls are
      captured in the open backlog.

## M4 — BYO AI key storage + settings (slice 1) ✅ (2026-06-06)

**Goal:** lay the M4 foundation — let a DM store their own provider API key per
campaign, encrypted at rest, as the substrate every generator (later slices)
calls. No generation yet; the app stays fully usable with no key. See
[ADR 0006](./adr/0006-ai-key-encryption-at-rest.md) and
[`04-ai-integration.md`](./04-ai-integration.md).

- [x] **Schema:** `AiKey { campaignId, providerId, ciphertext, lastFour,
      createdById, createdAt, updatedAt }`, unique on `(campaignId, providerId)`,
      Campaign/User back-relations (migration `20260606015105_m4_ai_keys`). Updated
      [`09-data-schema.md`](./09-data-schema.md) to match (the doc's minimal sketch
      gained `lastFour`/`createdById`/`updatedAt`).
- [x] **Crypto** (`src/server/crypto.ts`): AES-256-GCM envelope encryption with a
      per-message random IV + GCM auth tag; the 32-byte data key is `scrypt`-derived
      from a new `AI_KEYS_SECRET` env var (added to `.env.example`). Opaque versioned
      format `v1:<iv>:<tag>:<ciphertext>`. Rotating the secret invalidates stored
      keys by design; decrypt failure = "no usable key", never plaintext.
- [x] **Provider registry** (`src/lib/ai/providers.ts`): pure, secret-free source of
      truth for valid `providerId`s + labels (Anthropic, OpenAI), shared by the
      settings UI and the service. `keyPrefix` is a soft UI hint, not validation.
- [x] **Service** (`src/server/services/ai-keys.ts`): `setAiKey` (encrypts, stores a
      last-four hint, upserts one row per provider), `deleteAiKey`, and the safe,
      secret-free `listAiKeys` projection (DM-only; `[]` for players) — never returns
      ciphertext/plaintext. Set/remove are deliberate, audited DM actions (`AuditLog`
      `SET_AI_KEY`/`DELETE_AI_KEY`; detail carries only `providerId`+`lastFour`, never
      the key) — not change sets. Internal server-only `getDecryptedAiKey` is the
      single seam later generators call (invariant #6).
- [x] **UI:** `/campaigns/[id]/settings` (DM/co-DM only — players 404) with an
      `AiKeysPanel`: per-provider masked status (`ends ••NNNN`), `type="password"`
      add/replace input, and Remove. A real **Settings** nav link is added between
      Timeline and the Planned items.
- [x] **Tests:** crypto unit (round-trip, random IV, tamper/auth-tag, malformed,
      wrong-secret, missing-secret); DB-backed service (encrypt-at-rest + audit, no
      plaintext in ciphertext/audit, replace, player/non-member denial, unknown
      provider + short key, safe-view shape, delete + audit, decrypt round-trip +
      null); action (validation/ServiceError/generic + revalidation); component
      (masked vs. prompt states, password inputs, error/success); page (DM render,
      404 for missing campaign + player). lint, typecheck, build, and the full
      coverage gate green (statements 95.31%, branches 88.08%, functions 97.41%).
- [x] **Verified in-browser** against the seeded Demo Campaign: saved an Anthropic
      key → stored ciphertext contains no plaintext, `getDecryptedAiKey` round-trips
      exactly, `SET_AI_KEY` audit detail holds only the `••4242` hint; OpenAI stayed
      unconfigured; Remove deleted the row + wrote a `DELETE_AI_KEY` audit. All
      action POSTs returned 200.
- [x] **Followed by later M4 slices / open backlog:** provider abstraction and
      entity fleshing have shipped; remaining generator families, bulk/async jobs,
      and cost controls are captured in the open backlog.

## M3 — Time-bounded membership ✅ (2026-06-05)

**Goal:** finish the M3 group-hierarchy follow-up: membership edges preserve
"who was where, when" instead of treating every live edge as current forever.

- [x] **Schema:** added nullable `Relationship.sinceDay` / `untilDay` columns
      plus an interval-oriented `(campaignId, type, sinceDay, untilDay)` index
      (migration `20260605233000_m3_membership_bounds`). These fields apply to
      membership-like edges (`MEMBER_OF`, `PART_OF`, `LEADS`) while staying
      harmless on ordinary any-to-any relationships.
- [x] **Pipeline/service:** relationship create/update schemas accept optional
      crawl-day bounds, reject inverted intervals, and route the fields through
      the existing review-backed relationship apply path with provenance.
      Connection projections include the bounds for UI display/editing.
- [x] **Roster reads:** `getGroupRoster` now rolls up `MEMBER_OF`, `PART_OF`, and
      `LEADS` edges. By default it shows the current roster (open-ended
      memberships, excluding ended intervals); callers can request
      `{ asOfDay }` to reconstruct historical membership for a crawl day.
      Visibility, secret-edge filtering, archived-edge/member exclusion, cycle
      protection, and rolled-up member counts still apply.
- [x] **UI:** the Connections panel displays day bounds on bounded membership
      edges and exposes **Since day** / **Until day** inputs when adding or
      editing `MEMBER_OF`, `PART_OF`, or `LEADS` edges.
- [x] **Tests:** DB-backed relationship coverage for create/edit/projection,
      roster coverage for historical day filtering and current-roster exclusion
      of ended intervals, plus Connections/Roster component coverage. Focused
      suites and typecheck are green.
- [x] **Follow-up captured in the open backlog:** no M3 membership blocker remains. Future timeline UI can
      pass an inferred/current day into `getGroupRoster({ asOfDay })` when the DM
      wants a roster snapshot from a selected event or floor-day band.

## M3 — Order from causality (ADR 0004 slice 3, part 2) ✅ (2026-06-05)

**Goal:** finish [ADR 0004](./adr/0004-event-time-model-and-ordering.md) slice 3.
Part 1 (2026-06-05) made the timeline *detect* causal inconsistency (an effect
sorted before its cause). This is the one-click *fix*: topologically sort each
floor's events from the `EventCausality` DAG so causes precede their effects,
rewriting only the intra-floor `rank` the DM hasn't pinned.

- [x] Added `src/lib/causality-order.ts` (`orderFromCausality`): a pure,
      UI-agnostic, self-contained reorder. Per floor, it stable-topo-sorts events
      from their causal edges and returns the `rank` rewrites that put causes
      before effects. **Movable** events (unlocked *and* not system-derived order
      — the same gate the drag affordance uses, `floorRelativeSortKey === null`)
      are the only ones moved; **pinned** events (locked, or with a derived
      intra-floor order) keep their exact rank and current relative order
      (synthetic chain edges hold them in place), and movable events flow into the
      gaps between them. An already-ordered floor returns nothing; an
      unsatisfiable constraint (a contradiction between two pinned events, or a
      cycle) leaves that floor untouched for the inline warning to flag. Rank
      generation reuses `src/lib/rank.ts`; bytewise rank order throughout (matches
      the `TEXT COLLATE "C"` column + `src/lib/causality.ts`).
- [x] Service `orderEventsFromCausality` (`events.ts`): recomputes the reorder
      from canon (movable = `!locked && floorRelativeSortKey(readTimeRef(...)) ===
      null`), then applies the `rank` rewrites in a transaction — a mechanical,
      audited (`REORDER` with `detail.reason = "CAUSALITY"`), review-bypassing
      update, the bulk counterpart to a manual drag (order is not canon, ADR
      0004). Returns the moved ids + affected participant ids; an empty result
      means the timeline was already causally ordered. DM/co-DM only.
- [x] Action `orderEventsFromCausalityAction` + a one-click **Order from
      causality** button on the campaign timeline header (next to the "N out of
      order" warning chip). It appears only for a DM and only when a reorder would
      actually change something (computed client-side over the live event set with
      the same `orderFromCausality`), runs the action, and refreshes.
- [x] Tests: `tests/unit/causality-order.test.ts` (already-ordered no-op,
      inverted pair, three-event chain, pinned-event never moved, pinned relative
      order kept, pinned-vs-pinned contradiction left alone, per-floor
      independence, missing/cross-floor edges ignored, single-event floor);
      DB-backed service tests (reorder + `REORDER`/`CAUSALITY` audit, no-op when
      ordered, locked-pinned and derived-order-pinned both untouched, non-DM
      denial); action revalidation tests; and component tests (button shown +
      runs / surfaces error / hidden when ordered / hidden for non-DM). lint,
      typecheck, build, and the full coverage gate green (statements 95.23%).
- [x] **Verified in-browser** against the seeded Demo Campaign's Floor 9: added a
      backwards causal link (collar overload → breach), which raised the **1 out
      of order** warning and the **Order from causality** button; clicking it
      reordered the floor so every cause precedes its effect (warning + button
      cleared). Reverted the test link + restored the original floor order
      afterward.
- [x] **Follow-ups:** none for ADR 0004 — slices 1–3 are all delivered. Possible
      future refinement: a per-floor "order this floor" affordance (vs. the
      current campaign-wide pass) if a DM wants finer control.

## M3 — Knowledge / reveal grants (fog-of-war foundation) ✅ (2026-06-05)

**Goal:** the M3 roadmap's "knowledge/reveal foundations for fog of war" — a DM
can reveal a specific canon entity to one actor entity (NPC/crawler/party/faction)
**without** making it campaign-wide player-visible. This is the substrate the M7
player "known world" projection and M11 agent fog-of-war build on. See
[`09-data-schema.md`](./09-data-schema.md) and [`06-entity-agents.md`](./06-entity-agents.md).

- [x] **Schema:** `KnowledgeGrant` model + `KnowledgeTargetType`
      (ENTITY/ENTITY_FIELD/RELATIONSHIP/EVENT/FACT) and `KnowledgeRecipientType`
      (ENTITY/MEMBERSHIP) enums, per the data-schema doc, plus a `Campaign`
      back-relation (cascade) and migration `20260605204706_m3_knowledge_grants`.
      `targetId`/`recipientId` are polymorphic (keyed by their `*Type`), so they're
      not FK columns. Revoke is **soft** (`revokedAt`) so reveal history is kept; a
      grant is "active" when not revoked and not expired.
- [x] **Service** (`src/server/services/knowledge.ts`): reveals/revokes are
      deliberate, audited DM actions (`AuditLog` `REVEAL`/`REVOKE`) — **not** content
      change sets — exactly like locks. `grantEntityKnowledge` (validates both
      endpoints are live canon, rejects self-grants, idempotent on an identical
      active grant), `revokeKnowledge` (soft, audited), and the active-only,
      DM-facing projections `listKnowledgeOfEntity` ("known to") /
      `listKnowledgeHeldByEntity` ("knows about"), which resolve counterpart entities
      and drop archived/expired ones. This slice wires ENTITY→ENTITY grants; the
      schema already supports the richer target/recipient kinds for M7/M11.
- [x] **UI:** a DM-facing **Knowledge** panel
      (`src/components/entities/knowledge-panel.tsx`) in the entity detail right rail
      with two sections — **Known to** (actors told about this entity) and **Knows
      about** (canon this entity has been told) — each with an entity-typeahead
      reveal form (+ optional notes) and per-row revoke. Already-granted entities are
      filtered out of the picker. Actions `grantEntityKnownToAction` /
      `grantEntityKnowsAboutAction` / `revokeKnowledgeAction` revalidate both
      endpoints' pages.
- [x] **Tests:** DB-backed service suite (grant + REVEAL audit + both-direction
      projection, idempotent re-grant, self-grant/blank-id/non-canon rejection,
      player+non-member denial, soft-revoke + REVOKE audit + active-list drop,
      missing/double-revoke rejection, expired + archived-counterpart exclusion);
      action coverage (both grant directions, validation/ServiceError/generic
      fallbacks, revoke revalidation); `KnowledgePanel` component coverage (sections,
      grant submit both directions, revoke, error surfacing, picker de-dupe, empty
      states); and an entity-page render assertion. lint + typecheck clean; full
      coverage gate green (statements 95.11%).
- [x] **Verified in-browser** against the reseeded Demo Campaign: the panel renders
      on Carl's page; revealing Carl to Mordecai persisted a `KnowledgeGrant`
      (ENTITY→ENTITY) + a `REVEAL` audit row, and the panel re-rendered "Known to · 1
      — Mordecai" after revalidation.
- [x] **Follow-ups captured in the open backlog:** richer reveal targets (field/relationship/event/FACT) and
      MEMBERSHIP recipients; the player "known world" read projection (M7); agent
      fog-of-war context (M11); an undo affordance + reveal source-event linking
      (the `sourceEventId` column is in place for session-mode reveals, M8).

## M3 — Causality-consistency warnings (ADR 0004 slice 3, part 1) ✅ (2026-06-05)

**Goal:** use the `EventCausality` DAG as a soft coherence signal on the timeline.
A cause must precede its effect in fiction; when the timeline's mechanical sort
(floor `orderKey` + intra-floor `rank`) contradicts that — an effect placed
*before* its own cause — flag it. Non-blocking, per [ADR 0004](./adr/0004-event-time-model-and-ordering.md).

- [x] Added `src/lib/causality.ts` (`findCausalityWarnings`): a pure, UI-agnostic
      check that, given the timeline events' `(orderKey, rank)` positions and their
      outgoing causal edges, returns the set of causality `linkId`s whose effect
      sorts strictly earlier in fiction than its cause. Ties (identical position)
      and edges to events not in the set (e.g. visibility-filtered) don't warn.
- [x] Surfaced inline on the campaign timeline (`CampaignTimeline`): a memoized
      warning set (computed over the live event set, so it stays accurate after a
      local drag/remove; the just-removed link held for undo is dropped) drives an
      `AlertTriangle` marker next to each flagged `Caused by` / `Causes` link and a
      `N out of order` count chip in the header (both in the `--hot` hazard color).
- [x] Tests: `tests/unit/causality.test.ts` (consistent chain, earlier-floor
      inversion, intra-floor rank inversion, tie = no-warn, missing endpoint,
      mixed chain flags only the bad link); component tests asserting the inline
      markers + header chip appear for an inverted link and are absent for a
      consistent one. lint + typecheck green; timeline/lib test files pass.
- [x] **Delivered by the follow-up slice:** "order from causality" topologically
      sorts movable intra-floor stretches using the DAG and rewrites `rank` for
      unscheduled events.
- **Verification note:** Docker/Postgres isn't available in this environment, so
      the DB-backed service suite + aggregate coverage gate run in CI (precedent:
      slices 11, M3.5). This slice adds no service-layer code — it's pure-lib +
      client component, both fully covered by the jsdom/node tests above. In-browser
      verification deferred for the same DB reason.

## M3 — DM undo + closed Review Queue history ✅ (2026-06-05)

- [x] Added audited restore operations for every current DM soft-delete surface:
      entities, relationships, events, and event-causality links. Restores route
      through auto-approved DM change sets, write provenance, bump versions, and
      refuse to revive relationship/event links whose required endpoints are no
      longer live canon.
- [x] Added immediate undo affordances after delete/archive actions: entity
      archive redirects the World Browser with an `archivedEntity` undo notice;
      Connections, entity Timeline, and campaign Timeline hide the removed row
      locally and show an inline **Undo** action backed by the restore service.
- [x] Added a durable Review Queue **Closed** mode (`?show=closed`) for non-DM
      queue history. Rejected/superseded proposals remain reopenable; approved
      and partially-applied proposals render as read-only history. The page also
      keeps the post-decision Done state reachable when the pending list is empty.
- [x] Tests: restore service regressions, action revalidation/redirect tests,
      closed Review Queue service/page tests, and component coverage for undo
      notices across entity archive, relationship archive, event archive, and
      causality archive.

## M3 — Timeline redesign: "the timeline IS the descent" 🚧 (in progress)

**Goal:** rework the Crawl Timeline from a centered changelog into the broadcast
floor-banded "descent" the design mockup lays out, and bring its event-management
parity up to the entity viewer. See [ADR 0005](./adr/0005-campaign-current-floor.md)
and [`10-ui-ux.md`](./10-ui-ux.md).

### Done — slice A: floor-railed broadcast-spine redesign (2026-06-05)

- [x] Rebuilt `/campaigns/[id]/timeline` to the mockup
      (`docs/design/mockup/CrawlDirector Timeline.html` + `timeline-refined.jsx`):
      a 264px **floor rail** ("The Descent") laddering `F01 → FNN` (reached/current/
      locked), provenance origin filter, and a current-floor picker; a floor-banded
      broadcast spine with `FLOOR 09 · LARRACOS · ON AIR` headers, provenance-colored
      spine nodes, a NOW marker, threaded `Caused by / Causes` links, and signed-diff
      effect chips + Apply. Preserves drag-reorder, inline log/edit forms, the real
      effects→Review-Queue flow, and role-gates DM controls.
- [x] Schema: `Campaign.currentFloorId` (FK → FLOOR entity, `onDelete: SetNull`,
      migration `campaign_current_floor`). FLOOR entities carry `data.floorNumber` +
      `data.theme` (no new model; registered through the review pipeline like other
      `data.*` fields). Services: `setCampaignCurrentFloor` + `listCampaignFloors`.
- [x] ADR 0005; docs (10-ui-ux, 01-domain-model, 09-data-schema); tests (component
      bands/rail/filter/picker, `listCampaignFloors`, `setCampaignCurrentFloor`).
      Verified in-browser against a seeded multi-floor Demo Campaign.

### Done — slice B: timeline parity + causality navigation + inferred dates (2026-06-05)

DM feedback after slice A — bring the timeline to feature parity with the entity
viewer and pull the descent toward a single inferred timeline. Implement one-by-one;
keep this checklist current so work can resume across sessions.

- [x] **1. Lock/unlock an event from the timeline.** Added a lock/unlock control
      to each timeline event node (`setCampaignEventLockAction` →
      `setEventLock`), matching the entity-viewer pattern.
- [x] **2. Causal-link editing from the timeline.** Each event node now shows an
      "add cause" form and per-link remove controls (`linkCampaignEventCauseAction`
      / `archiveCampaignEventCausalityAction`), so cause↔effect links can be
      created/removed without leaving the timeline (mirrors the entity panel's
      per-event causality editor rather than nesting in the create form).
- [x] **3. Delete (archive) an event from the timeline.** Added a remove control to
      each unlocked event node (`archiveCampaignEventAction` → `archiveEvent`).
- [x] **4. Timeline causality links are clickable.** `Caused by` / `Causes` items
      are buttons that scroll the timeline to + briefly highlight the linked event
      (`focusEvent`, clearing any active provenance filter so the target is shown).
- [x] **5. Cross-event causality navigation from the entity viewer.** `EventLink`
      now deep-links within the entity page only when the linked event is in that
      entity's own timeline; otherwise it routes to the campaign timeline scrolled
      to the event (`/timeline?event=<id>`, honored on mount via `initialEventId`).
- [x] **6. Inferred floor day-ranges in the band headers (Day 388 – 412).** Each
      floor band now shows a `Day min – max` range inferred client-side from the
      events on that floor that sit on the *absolute* axis (a `COLLAPSE` "Day N
      since collapse" or `ABSOLUTE_DAY` coordinate → day = offset). Floors with no
      absolute-dated events show no range, so the timeline assembles itself as the
      DM dates more of the crawl. **Deliberately bounded:** floor-relative anchors
      (`FLOOR_START` / `FLOOR_COLLAPSE`) are *not* converted to absolute days,
      because that needs per-floor start/collapse anchors we don't model (ADR 0004
      is explicit that mixing the two axes needs floor-duration data). The natural
      next step for fuller chaining is to let FLOOR entities carry a `data.startDay`
      (a "floor opens" anchor, same plumbing as `data.floorNumber`), which would
      let `FLOOR_START` offsets resolve and the floor-1→N chain fill in — noted as a
      follow-up rather than built now.
- [x] **7. Events with system-inferred order aren't draggable.** Drag-reorder is
      gated on `floorRelativeSortKey(time) === null` — i.e. drag is suppressed
      exactly when the intra-floor order is auto-derived (a floor-relative anchor
      *with a concrete offset*, ADR 0004). Unscheduled events and bare-floor anchors
      (no offset, order not inferable) stay draggable. This is the precise reading
      of "anchors let the system infer order, so the DM shouldn't reorder by hand."

## M3.5 — Tagging system 🚧 (in progress)

**Goal:** replace freeform tag strings with a structured, queryable tagging
system. **Done when:** users can filter the World Browser by tag, click any tag
badge to search by it, autocomplete tags during creation/edit, and search tags
in the general search bar.

### Done — tag selection UI + campaign tag facet/badges (2026-06-01)

- [x] Added the `TagInput` client component
      (`src/components/entities/tag-input.tsx`): tags render as removable chips,
      a campaign-autocomplete dropdown suggests existing tags (with a "New" option
      for novel ones), Enter/comma commit a tag, Backspace removes the last, and
      the selection submits as a single comma-joined hidden `tags` field — so it
      slots straight into the existing entity-form action + Zod `tagsSchema`
      (which already accepted a comma-separated string). Case-insensitive dedupe
      and the schema's 20-tag cap are enforced in the UI. Honors locked fields
      (read-only chip view).
- [x] Replaced the raw `tags` text input in the entity create/edit forms
      (`CoreFields`) with `TagInput`, threading the campaign's existing tags
      (`listCampaignTags`) through `EditEntityForm` /
      `CreateGenericEntityForm` / `CreateCrawlerForm` from the entity detail page.
- [x] Added a **Tags** facet to the World Browser sidebar: clickable
      campaign-tag chips that toggle the `?tag=` filter (active chip clears it),
      shown only when the campaign has tags (or one is active). Made the entity
      detail **Tags** field render its tags as clickable badges that link to the
      filtered World Browser.
- [x] Added `TagInput` component coverage (chip render, dedupe, add via
      Enter/comma, Backspace/remove, suggestion select, "New" option, read-only,
      20-tag cap), updated entity-forms coverage for the chip UI + hidden field,
      and added page coverage for the sidebar Tags facet (active/inactive hrefs,
      hidden-when-empty) and the entity detail tag-badge links. lint, typecheck,
      build, and full coverage gate green.

### Notes / follow-ups (M3.5)

- The service layer landed earlier (`listCampaignTags`; tag filtering in
      `listEntitiesForUser`; general search already matches tags). This slice
      completes the **done-when** UI bar. Tags remain a `String[]` on `Entity`
      (no separate `Tag` table) — promote to a structured/normalized model only if
      cross-campaign tag management or rename-cascades are needed later.
- In-browser verification of the authenticated flow was not run this session: a
      separate `next dev` server was already holding port 3000, and the preview
      harness can't attach to a server it didn't start. Covered by the component/
      page tests + build instead.

## M3 — Relationships & events graph 🚧 (in progress)

**Goal:** model the connective tissue and causality.
**Done when:** a DM can link any entity to any other, build crawler→party→guild
membership, log events with participants, and traverse cause→effect chains;
relationships/events are reviewable + lockable.

### Done — slice 16: typed `timeRef` + generated phrasing + derived rank (ADR 0004 slice 2) (2026-06-04)

- [x] **Typed `timeRef`** (`src/lib/time-ref.ts`): `Event.inGameTime` now holds a
      structured `{ basis, floor?, offset?, unit?, anchorEventId?, label? }` instead
      of an overloaded `{ floor?, label? }`. `basis` is one of `COLLAPSE`,
      `FLOOR_START`, `FLOOR_COLLAPSE`, `EVENT`, `ABSOLUTE_DAY`, `UNSCHEDULED` — every
      DCC time flavor is an *offset from a basis*. `buildTimeRef`/`readTimeRef`
      normalize + read (tolerating legacy `{ floor, label }` rows), and the service
      validates an `EVENT` anchor (live, non-self event).
- [x] **Generated phrasing**: `phraseTimeRef` renders a consistent display string
      from the structure ("Floor 9 · 3 days in", "12 hours before Floor 9 falls",
      "Day 47 since the collapse", "2 days before *Carl's stunt*"). The free
      `timeLabel` is now an optional **one-off override** of the generated phrase,
      not the only home for the coordinate. Timelines + Review Queue render the
      phrase; the entity/campaign timelines resolve EVENT-anchor titles.
- [x] **Derived rank**: when the basis is floor-relative with a concrete offset
      (`FLOOR_START` ascending, `FLOOR_COLLAPSE` counting down), the intra-floor
      `rank` is derived automatically at apply time (`rankForEvent` /
      `deriveRankForFloor` in `review.ts`) by bracketing the event among its
      same-basis floor siblings — no manual drag needed. `UNSCHEDULED`/label-only
      (and non-floor-relative) anchors fall back to the manual drag-rank. Editing an
      offset within a floor re-derives the rank.
- [x] **UI**: a shared `EventTimeFields` (basis/floor/offset/unit pickers + an
      EVENT-basis anchor selector + label-override) replaces the bare floor + label
      inputs on the entity Timeline panel and the campaign Timeline create/edit
      forms; the Review Queue's structured `inGameTime` editor renders the same
      basis/offset/unit controls. Still **no** `orderKey`/`rank` field in the queue.
- [x] **Migration** `20260604220000_m3_event_timeref`: data-only JSONB backfill
      stamping a `basis` onto existing rows (a floor ⇒ `FLOOR_START`, else
      `UNSCHEDULED`), preserving the old `label` verbatim as the override. No column
      change (`rank` landed in slice 1).
- [x] Tests: `time-ref` pure unit suite (build/read/phrase/sort-key); service tests
      for typed persistence, FLOOR_START/FLOOR_COLLAPSE derived ordering, offset-edit
      re-rank, and EVENT-anchor phrasing + validation; `EventTimeFields` +
      Review-Queue editor component tests.
- [x] **Delivered by ADR 0004 slice 3:** causality-consistency warnings (an effect
      sorted above its cause) and "order from causality." Review-Queue EVENT-anchor
      editing still preserves the existing anchor id rather than offering an event
      typeahead.

### Done — slice 15: derived event order + intra-floor rank/drag (ADR 0004 slice 1) (2026-06-04)

- [x] **Stopped the `ORDERKEY` leak** into the Review Queue: `createEvent` /
      `updateEvent` no longer put `orderKey` in the reviewable patch. Order is
      now **derived server-side** from the event's in-game-time anchor (the
      floor) in the review apply path (`applyCreateEvent` / `applyUpdateEvent`),
      so a derived sort key is never presented to the DM as editable canon.
- [x] **Added an intra-floor `rank`** (`Event.rank`, a fractional index —
      lexicographically-sortable string, `src/lib/rank.ts`, a self-contained port
      of the `fractional-indexing` algorithm). The timeline sorts by
      `(orderKey desc, rank desc, createdAt desc)`; new events append above their
      floor (newest-first), and a floor move re-derives `orderKey` + a fresh rank.
- [x] **Intra-floor drag** on the campaign timeline page: events are draggable
      with a grip handle and "drag to reorder within a floor" hint; dropping
      computes the dragged event's new neighbours (pure `computeReorderNeighbors`)
      and calls `reorderEvent` (a mechanical, audited, review-bypassing `rank`
      update like `setEventLock`). Cross-floor drops are no-ops/rejected.
- [x] **Migration** `20260604210000_m3_event_rank`: additive `rank TEXT COLLATE
      "C"` column (bytewise ordering — the rank alphabet spans both letter cases)
      + per-`(campaign, floor)` backfill spacing existing rows by their current
      order, and a `(campaignId, orderKey, rank)` index replacing the coarse one.
- [x] Tests: `rank` fractional-index unit suite; service tests for derived
      `orderKey`/`rank`, reorder (incl. cross-floor reject + DM-only), floor-move
      re-rank; `reorderEventAction` + drag-interaction/neighbour component tests.
      Verified end-to-end in-app (drag persisted a `REORDER` audit entry).
- [x] **Followed by ADR 0004 slice 2** (typed `timeRef` + generated phrasing +
      derived rank — see slice 16 above). Slice 3 (causality-consistency warnings /
      "order from causality") remains.

### Done — slice 14: independent field decisions + resolved effect previews (2026-06-04)

- [x] Fixed per-field review persistence by adding `ChangeOperation.fieldDecisions`.
      Accepting/rejecting one row or saving one edited value now updates only that
      field; untouched siblings remain **PENDING** instead of being implicitly
      rejected. The row's Accept/Reject/Edit controls are replaced by
      **Save/Discard** only while that row is being edited, and the old
      operation-wide **Save field edits** footer is gone.
- [x] Kept `editedPatch` as the exact accepted subset applied by approval while
      storing field decisions separately for queue state/history. Required event
      fields such as `title` and `participants` can now be accepted individually
      and successfully create the event without unrelated pending fields.
- [x] Enriched pending `APPLY_EVENT_EFFECTS` operations with resolved live-canon
      previews. Effect summaries now show actual before/after values (for example
      `HP 200 → 80`, including stat floors and alive/dead transitions) rather than
      an isolated delta such as `HP -120`.
- [x] Added a migration plus focused service/action/page/component regressions for
      independent pending fields, individual event-title approval, row-local
      Save/Discard, and resolved effect previews.
- [x] Review hardening follow-up: run-level **Accept all non-conflicting** now
      preserves explicit field rejections and saved edits; effect proposals
      reject omitted rows after applying the retained subset, disallow unsupported
      additions, and calculate repeated same-stat previews sequentially so the
      displayed values match approval.
- [x] Auto-approved event change sets now create and apply dependent operations
      in their declared order, so an `UPDATE_EVENT` that declares effects always
      completes before its following `APPLY_EVENT_EFFECTS` operation.

### Done — slice 13: read-first per-field Review Queue + Done/reopen state (2026-06-04)

- [x] Corrected the read-first decision contract so a fresh proposal's fields
      begin **PENDING**, the accepted count begins at zero, and approval cannot
      silently apply or dismiss untouched operations. Per-field
      Accept/Reject/Edit choices remain explicit; generator-run **Accept all
      non-conflicting** is still the deliberate bulk shortcut.
- [x] Reworked normal Review Queue operations to match the milestone mockup's
      read-first diff contract: every field shows `-` current / `+` proposed
      values by default, with per-field **Accept**, **Reject**, and **Edit**
      controls. Inputs are now opt-in and appear only for the field being edited;
      saving persists the accepted field subset as the operation's existing
      `EDITED` patch.
- [x] Replaced raw event/relationship reference JSON in normal review diffs:
      `inGameTime` renders as floor + optional text label and edits through those
      two controls; event participants render as resolved entity + role rows and
      edit through entity pickers; relationship `sourceId` / `targetId` values
      resolve to names and edit through entity pickers.
- [x] Made `APPLY_EVENT_EFFECTS` follow the same rule: effect rows render as
      compact read-only summaries by default, each row has its own **Edit**
      affordance, and the shared `EffectRows` editor is revealed only after a DM
      chooses to edit. Completed proposals render both normal diffs and effect
      summaries as read-only history.
- [x] Added the mockup-aligned post-decision **Done** state after approving or
      rejecting a proposal. Rejected/superseded proposals can safely be reopened
      into `PENDING`; reopening restores held event-effect rows and preserves
      prior edited patches. Approved/partially-applied proposals can be reopened
      for read-only inspection, but cannot be made pending again because that
      would risk applying the same canon mutation twice; changing approved canon
      still requires a new compensating proposal.
- [x] Added focused component/page/action/service coverage for field decisions,
      opt-in editors, per-row effect editing, accepted-field counts, Done
      redirects, read-only approved history, rejected proposal reopening,
      preserved edited patches, and event-effect pending-state restoration.

### Done — slice 12: structured effect-row editor in the Review Queue (2026-06-04)

- [x] Replaced the Review Queue's raw JSON patch textarea for
      `APPLY_EVENT_EFFECTS` operations with a structured **effect-row editor**.
      Each reviewed effect now renders as a row with kind (Adjust/Set stat ·
      Set alive) + crawler target typeahead + stat + delta/value (or alive/dead)
      + note pickers — the same `EffectRows` primitive the timeline log forms use
      — instead of a hand-edited JSON blob. A DM can correct target/stat/value
      before approval without touching JSON.
- [x] Added the `EffectOperationEditor` client component
      (`src/components/review/effect-operation-editor.tsx`): seeds rows from the
      operation's `effects` patch (preferring a prior `editedPatch`), resolves
      each effect's target id to a crawler name, and falls back to the raw id for
      an unresolved (e.g. archived) target so the original target is never
      silently dropped. The Review Queue page (`/campaigns/[id]/review`) branches
      on `APPLY_EVENT_EFFECTS` to render it, fetching the campaign's crawler
      candidates **only** when a pending proposal actually applies effects.
- [x] Added `editEventEffectsOperationAction`: reuses the shared
      `parseEffectRows` form reader + `eventEffectSchema` (coercing
      delta/value/alive), then saves the normalized effects as an `EDITED`
      decision's `editedPatch.effects.to` — the exact shape
      `applyApplyEventEffects` already reconciles by effect `id` on approval, so
      no service/schema change was needed. Effect `id`s are preserved through the
      editor so the edited patch matches the stored rows. Invalid rows (e.g. a
      zero delta) are a silent no-op, matching the generic patch editor.
- [x] Added coverage: page tests render the structured editor for an effect op
      (resolved target, kind/stat/delta, stable ids, no JSON textarea) and assert
      the crawler lookup is gated on effect-op presence; a focused
      `effect-operation-editor.test.tsx` covers seeding, target resolution, the
      unresolved-target fallback, and the rejected-dim branch; action tests cover
      the EDITED effects round-trip (id preservation + SET_ALIVE coercion) and the
      invalid-row no-op. lint, typecheck, build, and the full coverage gate are
      green (statements 95.0%, above the floor).
- [x] **Verified in-browser** against the seeded Demo Campaign: a pending
      `APPLY_EVENT_EFFECTS` proposal renders the structured editor (no JSON);
      editing Carl's Gold delta 500 → 750 and clicking **Save effects** persisted
      an `EDITED` decision; approving it applied the **edited** value (Carl's gold
      500 → 1250), confirming the editor → `editedPatch` → approval chain end to
      end.

### Done — slice 11: pending relationship proposals through the Review Queue (2026-06-04)

- [x] Made relationships fully **reviewable**, not just auto-approved. Added
      `createPendingRelationshipChangeSet` (the symmetric counterpart to
      `createPendingEntityChangeSet`): AI/import producers (M4+) can route
      any-to-any `CREATE`/`UPDATE`/`DELETE_RELATIONSHIP` edges through the Review
      Queue as `PENDING` change sets that the DM reviews, edits, approves, or
      rejects before they touch canon.
- [x] Wired `RELATIONSHIP` targets into the generic approval dispatch
      (`applyReviewOperation`), which previously threw "Unsupported operation
      target" for them, so approving a pending relationship proposal applies the
      edge through the existing lock-aware `applyRelationshipOperation` path
      (provenance + audit preserved). Edited-then-approved relationship operations
      honor the `editedPatch`.
- [x] Added relationship lock/staleness flagging
      (`evaluateRelationshipOperationFlags`): an edit/remove of a locked edge is
      `blockedByLock`; a base-version mismatch is `isStale`. Both are computed at
      proposal time, re-evaluated on every queue read
      (`refreshPendingOperationFlags`, with archived edges held as stale instead
      of throwing), and respected by `setChangeOperationDecision` so per-op
      Accept/Edit/Reject works for relationship ops too. `approveChangeSet`
      refuses a proposal carrying a blocked or stale relationship op.
- [x] Enriched the Review Queue projection for relationship ops: target label
      renders as `Source → Target` (resolved from the live edge, or the proposed
      endpoints for a CREATE, falling back to the edge type when an endpoint can't
      be resolved), `targetEntityType` is the edge type, lock state comes from the
      edge, and `currentValues` surface the live type/disposition/notes/secret —
      so the existing two-pane Review Queue UI (which already had relationship
      verb labels) renders relationship proposals with no UI change.
- [x] Added DB-backed service coverage in
      `tests/unit/review-relationships.test.ts` (pending create/update/delete
      approval with provenance + source, queue enrichment labels/types/current
      values, EDITED-decision apply, rejection leaves canon untouched, locked-edge
      block, stale-edit hold, archived-underneath hold, CREATE label fallback,
      non-DM denial). No schema/migration change. lint, typecheck, build, and the
      full coverage gate are green (statements back over the 95% floor).
- [x] **Verification note:** this is pipeline infrastructure with no in-UI
      producer yet — pending relationship proposals are produced by AI/import
      (M4+), mirroring how `createPendingEntityChangeSet` shipped in M2 ahead of
      M4. The Review Queue rendering of these ops is covered by the
      `listPendingChangeSetsForUser` service tests (the function the page calls)
      plus the existing `review-queue-page.test.tsx`; full in-browser queue
      verification lands with the M4 producer.

### Done — slice 10: event effects Review Queue integration (2026-06-01)

- [x] Changed the normal event-effect apply flow to create a `PENDING`
      `APPLY_EVENT_EFFECTS` Change Set instead of mutating crawler canon
      immediately. Effect rows now carry stable review pointers
      (`pendingChangeSetId` / `pendingOperationId`) and a `reviewStatus`, so
      timeline surfaces show **pending review** and cannot create duplicate
      proposals for the same unapplied effect.
- [x] Taught the generic Review Queue approval path to dispatch event operations,
      so approving an `APPLY_EVENT_EFFECTS` proposal applies the reviewed effect
      rows atomically, writes crawler provenance through the existing
      lock-aware entity-update path, marks the effect rows applied with
      `appliedChangeSetId`, and attaches effect targets as `AFFECTED`
      participants. Editing the operation's JSON `effects` patch before approval
      is honored, letting a DM correct target/stat/value through the existing
      queue editor.
- [x] Rejecting or superseding an effect proposal clears the pending pointers and
      marks the effect rows `REJECTED` / `SUPERSEDED` without mutating target
      entities, so rejected effects no longer look actionable. The explicit
      auto-approved path remains for `updateEvent(..., { applyEffects: true })`.
- [x] Updated the entity Timeline and campaign Timeline shared effects UI from
      "Apply unapplied" to **Send to review**, with pending/rejected/superseded
      status labels and Review Queue revalidation. Added DB-backed service
      coverage for pending submission, approval, edited approval, rejection,
      lock-block-on-approval, and existing auto-apply behavior, plus action and
      component coverage. Focused event-effect/action/timeline tests and
      typecheck are green.

### Done — slice 9: event participant editing + timeline-page event editing (2026-06-01)

- [x] Taught `UPDATE_EVENT` to reconcile participants: when the patch carries a
      `participants` list, `applyUpdateEvent` diffs it against the live rows —
      adds new `(entity, role)` pairs, drops removed ones, leaves unchanged rows
      in place — after validating every desired participant is live canon and that
      the event keeps ≥1 participant. Locked events still block; absent
      `participants` leaves the set untouched (scalar-only edit). `updateEventSchema`
      gained an optional `participants` array; `updateEvent` now returns the
      **union** of pre- and post-edit participant ids so timelines that *lost* the
      event get revalidated too.
- [x] Added `updateCampaignEventAction` (campaign-timeline edits, no single viewed
      entity) and taught `updateEventAction` to parse participant rows. Factored the
      shared `parseParticipantRows` form helper.
- [x] Extracted a shared `ParticipantRows` editor
      (`src/components/entities/participant-rows.tsx`) and used it in **both** edit
      surfaces: the entity-detail Timeline panel's event edit form (prefilled with
      the viewed entity + co-participants — the panel now takes the entity's
      name/type) and a new **campaign timeline page** event edit form (scalar fields
      + participants). Edit is hidden when the event is locked.
- [x] Added DB-backed service coverage (add/remove/re-role reconciliation, affected
      revalidation set, untouched-when-omitted, ≥1-participant + non-canon
      rejection), action coverage (participant-row parsing, campaign edit action +
      revalidation/ServiceError), and component coverage (participant prefill +
      submit on both surfaces, add/re-role/remove rows, hidden-when-locked).
      lint/typecheck/build/coverage gate green (statements over the 95% floor).
- [x] **Followed by later M3 slices:** the campaign timeline page and entity panel
      edit the same event fields + participants now; structured effects and
      pending relationship/event proposal infrastructure shipped in slices 10–11.

### Done — slice 8: relationship + event field editing through the pipeline (2026-06-01)

- [x] Wired `UPDATE_RELATIONSHIP` into the review service (`applyUpdateRelationship`):
      edits an edge's mutable fields (type/disposition/notes/secret) as an
      auto-approved DM change set, bumping `version`, writing per-field relationship
      provenance + an `APPLY_OPERATION` audit row. Endpoints are never re-pointed
      (that stays a remove + add so provenance is honest), and locked edges block
      with `blockedByLock`, like deletes.
- [x] Extended `applyUpdateEvent` so `UPDATE_EVENT` covers field edits
      (title/summary/in-game time/orderKey/secret) in addition to soft-archive —
      finishing the editing path explicitly deferred in slice 2. Locked events still
      block; participant editing remains a later slice.
- [x] Added `updateRelationshipSchema` / `updateEventSchema` (Zod), the
      `updateRelationship` / `updateEvent` services (both route through the existing
      auto-approved change set with `_baseVersion`), and `updateRelationshipAction`
      / `updateEventAction` (revalidate the viewed entity, both endpoints /
      participants, and the campaign timeline).
- [x] Added inline edit forms to the Connections panel (type picker reusing
      `relationshipPickerOptions` + disposition/notes/secret) and the Timeline panel
      (title/summary/floor/time-label/secret). Both are prefilled from the current
      record, hidden when the edge/event is locked, and surface service errors
      without losing input.
- [x] Added DB-backed service coverage (edit applies + version bump + provenance,
      optional-field clearing, locked-edit block, missing-target + player denial),
      server-action coverage (revalidation, validation, ServiceError + generic
      error paths), and component coverage (prefilled form, submit/close, error
      retains form, cancel/toggle, hidden-when-locked). Verified in-browser against
      the seeded Demo Campaign: edited Carl↔Donut edge `ALLY_OF→RIVAL_OF` (secret,
      disposition `60→-40`) and the Floor 9 boss event (floor `9→10`), both with
      version bumps + provenance. lint, typecheck, build, and coverage gate green
      (statements ratcheted back over the 95% floor).

### Done — slice 7: campaign timeline page + multi-participant logging (2026-06-01)

- [x] Added `listCampaignTimeline` to the `events` service: a campaign-wide,
      visibility-scoped projection of live events ordered by in-game floor/time.
      It includes all visible participants for each event, cause/effect
      summaries, source/secret/lock state, and returns an empty list for
      non-members. Player reads hide secret events, invisible participants, and
      public events that would otherwise have no visible participant.
- [x] Added the `/campaigns/[id]/timeline` route and linked it from the console
      nav. The page renders the real campaign event stream, an honest empty
      state, participant links back to entity timelines, and no fake/filler
      events.
- [x] Added `CampaignTimeline`, a timeline-oriented client surface with a
      multi-participant event form. DMs can log an event with up to 20 selected
      participants and per-participant roles; the action routes through the
      existing review-backed `createEvent` service and revalidates the campaign
      timeline plus every participant entity timeline.
- [x] Added DB-backed service coverage for ordering and player visibility,
      server-action coverage for multi-participant parsing/revalidation, page
      coverage for render/empty/404, component coverage for timeline rendering
      and multi-participant submit, and nav coverage for the active timeline
      link.

### Done — slice 6: campaign relationship graph view (2026-06-01)

- [x] Added `getCampaignRelationshipGraph` to the `relationships` service: a
      campaign-wide projection returning the live edges and the entities they
      connect (nodes carry the entity's `locked` flag). It's a connectivity view
      — only entities in at least one visible edge are returned, not the full
      entity list (the World Browser is that). Visibility-scoped: players never
      see secret edges, edges to an endpoint they can't see, or edges to an
      archived endpoint (archiving leaves edges in place, so those drop for
      everyone). Returns null for non-members.
- [x] Added the `RelationshipGraph` client component: a dependency-free SVG
      force-directed node-link diagram matched to
      `docs/design/mockup/screen-graph.jsx`, with type/secret filters, pan/zoom,
      reset, type-colored nodes, directional disposition-weighted edges,
      dashed/hot secret edges, locked-node rings, neighbor highlighting, and a
      selected-node connections panel with entity navigation. The graph still
      shows only real visibility-scoped data — no mock/filler nodes.
- [x] Added the `/campaigns/[id]/graph` route (full-bleed graph canvas with an
      honest empty state when there are no edges) and turned the nav's
      "Relationship Graph · Planned M3" stub into a real, active link.
- [x] Added DB-backed service coverage (connectivity nodes, isolated-entity
      omission, locked node flag, player secret/invisible/archived scoping,
      non-member null), component coverage (render, filters, selected-node
      connections panel, side-panel entity navigation, secret edge label), and
      page coverage (graph shell, empty state, 404). Verified in-browser against
      a seeded 5-node/4-edge graph (secret edges dashed, Donut's lock ring,
      node→entity navigation). lint, typecheck, build, and coverage green.

### Done — slice 5: group hierarchy roster rollup (2026-06-01)

- [x] Added the `groups` service (`getGroupRoster`, `isGroupEntityType`,
      `GROUP_ENTITY_TYPES`). For a group-type entity (PARTY/GUILD/FACTION/
      ORGANIZATION) it rolls up the membership hierarchy from existing
      `MEMBER_OF` (members) and `LEADS` (leaders) edges: members that are
      themselves groups expand recursively, so a guild rolls up its parties and
      each party's members. Each group is expanded once (breaks cycles and keeps
      diamonds from ballooning) with a depth cap. `rolledUpMemberCount` reports
      the distinct non-group members in a node's subtree.
- [x] Visibility-scoped: players never see secret membership edges, members they
      can't otherwise see, or the roster of a group they can't see; archived
      edges are excluded. Non-members get null. No new write path — membership is
      still added/removed through the existing Connections panel + pipeline.
- [x] Added a read-only `RosterPanel` on group-type entity detail pages
      (Leaders + Members with nested sub-group rosters, crown markers for
      leaders, secret/lock indicators, rolled-up member count).
- [x] Added DB-backed service coverage (guild→party→member rollup with nested
      leaders, player visibility scoping, cycle termination, archived-edge
      exclusion, non-member) plus component render coverage. Verified
      in-browser against a seeded guild/party/member hierarchy. lint, typecheck,
      build, and coverage green.

### Done — slice 4: relationship + event lock controls (2026-05-31)

- [x] Added audited lock/unlock service functions for live relationship edges
      and events. Locks remain deliberate DM actions rather than proposals, do
      not bump record versions, and write `LOCK` / `UNLOCK` audit rows against
      `RELATIONSHIP` or `EVENT`.
- [x] Projected relationship/event `locked` state into the entity detail
      Connections and Timeline panels. Locked relationships light up the lock
      control in the system/locked color, locked events show the lock chip, and
      destructive remove controls stay hidden until unlocked.
- [x] Added server actions for toggling relationship/event locks and
      revalidating the current entity page.
- [x] Added service, action, and component regression coverage for lock/unlock
      auditing, player denial, archive blocking, projected locked state, and UI
      control rendering.

### Seeding cleanup & security (2026-05-31)

- [x] Removed in-UI seeding checkbox and `seedLore` option during campaign creation.
- [x] Added `dungeon-crawler-carl.jsonl` to `.gitignore` to prevent committing massive seed data to GitHub.
- [x] Updated `tests/unit/seeding.test.ts` to mock filesystem reading, making unit tests self-contained, fast, and CI/CD friendly without requiring local seed data files.
- [x] Repositioned the AI Description input field in the entity edit form for items so that it sits directly between the Summary and Description fields, mirroring the read-only page layout.
- [x] Removed italic styling from the AI Description quote block on the item details page, keeping it non-italicized as designed.

### Done — slice 3: event causality links through the pipeline + Timeline traversal (2026-05-31)

- [x] Added the M3 `EventCausality` model and migration
      `20260531005412_m3_event_causality`. Cause/effect links are directed
      `Event` → `Event` edges with optional `weight`/`note`, `source`, `status`,
      `locked`, `version`, campaign scoping, uniqueness on `(causeId, effectId)`,
      and their own provenance via `Provenance.eventCausality`.
- [x] Extended the review service with `CREATE_EVENT_CAUSALITY` /
      `DELETE_EVENT_CAUSALITY` operations under `applyAutoApprovedEventChangeSet`.
      The service validates both endpoints are live canon events in the same
      campaign, rejects self-links and links that would create a cycle, writes
      causality provenance, and soft-archives links instead of deleting them.
- [x] Added `linkEventCause` / `archiveEventCausality` to the `events` service
      and projected causality into `listEventsForEntity`. Player reads remain
      visibility-scoped: secret linked events are omitted from the cause/effect
      lists, so public events do not reveal hidden upstream canon.
- [x] Added `linkEventCauseAction` / `archiveEventCausalityAction` and expanded
      the `TimelinePanel` with a simple list-based traversal surface: each event
      shows `Caused by` and `Causes` links, can link another visible timeline
      event as a cause, and can remove an existing cause/effect edge.
- [x] Added DB-backed service coverage for provenance, timeline projection,
      cycle rejection, player visibility scoping, and soft-archive; added action
      and component coverage for the Timeline controls. Focused event/action/UI
      tests are green.

### Done — slice 2: events + participants through the pipeline + Timeline panel (2026-05-30)

- [x] Added the M3 `Event` + `EventParticipant` models and the
      `EventParticipantRole` enum (`ACTOR`/`TARGET`/`WITNESS`/`LOCATION`/
      `AFFECTED`; any-to-any like relationship types), wired
      `Provenance.event`, `Entity.eventRoles`, and `Campaign.events`, and added
      migration `20260530232431_m3_events`. Events carry a flexible `inGameTime`
      JSON (`{ floor?, label? }`) plus an integer `orderKey` the timeline sorts
      by (DCC time is irregular — no calendar dates), and `secret`, `source`,
      `status`, `locked`, `version`.
- [x] Extended the review service with event operations:
      `applyAutoApprovedEventChangeSet` routes `CREATE_EVENT` / `UPDATE_EVENT`
      through the pipeline as auto-approved DM change sets, validating every
      participant is live canon, creating participant rows, writing event
      provenance, and blocking `UPDATE_EVENT` (archive) on locked events.
      `UPDATE_EVENT` handles only soft-archive for now; event field-editing
      lands with the event locking/editing slice alongside its coverage.
- [x] Added the `events` service (`createEvent`, `listEventsForEntity`,
      `archiveEvent`). The per-entity timeline is visibility-scoped: players
      never see secret events or co-participants they can't see; soft-archive
      retains history (status `ARCHIVED`, version bump, provenance preserved).
- [x] Added `createEventAction` / `archiveEventAction` and the
      `createEventSchema` Zod schema (the viewed entity is always a participant;
      one optional co-participant can be added from the same form — richer
      multi-participant editing arrives with the campaign timeline view).
- [x] Replaced the entity-detail "Timeline · Planned M3" stub with a real
      `TimelinePanel`: lists events the entity is in (role, in-game time, summary,
      co-participants with links + roles, secret marker), a log-event form (title
      + summary + floor + time label + this entity's role + optional participant
      + DM-only toggle), and a per-event remove control.
- [x] Added DB-backed service coverage (create+provenance, bidirectional
      timeline, floor ordering, player visibility scoping, participant dedupe,
      soft-archive, non-member, non-DM denial, non-canon participant, locked-event
      archive block), plus component, action, and schema tests. Verified
      in-browser: log event → shows on both participants → remove → soft-archived
      with history retained. lint, typecheck, build, and coverage green.

### Done — slice 1: relationships through the pipeline + Connections panel (2026-05-30)

- [x] Added the M3 `Relationship` model + `RelationshipType` enum (any-to-any:
      both endpoints FK to the generic `Entity`), `Entity.outEdges`/`inEdges`,
      a `Provenance.relationship` relation, and migration
      `20260530225126_m3_relationships`. Relationships carry `source`, `status`,
      `locked`, `version`, `disposition`, `notes`, and a `secret` (DM-only) flag.
- [x] Extended the review service with relationship operations:
      `applyAutoApprovedRelationshipChangeSet` routes `CREATE_RELATIONSHIP` /
      `DELETE_RELATIONSHIP` through the pipeline as auto-approved DM change sets,
      validating both endpoints are live canon, writing relationship provenance
      rows, and blocking deletes of locked edges. (Pending/AI relationship review
      + edge locking/editing UI land in later slices.)
- [x] Added the `relationships` service (`createRelationship`,
      `listConnectionsForEntity`, `archiveRelationship`). Connections list is
      visibility-scoped: players never see secret edges or edges whose other
      endpoint they can't see; soft-archive retains history.
- [x] Added `createRelationshipAction` / `archiveRelationshipAction` and the
      `createRelationshipSchema` Zod schema (any-to-any: every type valid; UI
      offers defaults, never hard rules).
- [x] Replaced the entity-detail "Connections · Planned M3" stub with a real
      `ConnectionsPanel`: lists outgoing/incoming edges (direction arrow, type
      label, secret marker, link to the other entity), an add-connection form
      (type + target picker + DM-only toggle), and a per-edge remove control.
- [x] Added DB-backed service coverage (create+provenance, bidirectional list,
      player visibility scoping, soft-archive, non-DM denial, self/missing-target
      validation, non-member), plus component, action, and schema tests. Verified
      in-browser: add edge → shows on both ends → remove → gone. lint, typecheck,
      build, and coverage green.

### Notes / follow-ups (M3)

- Event effects v1 is in place for crawler-targeted effects (`ADJUST_STAT`,
      `SET_STAT`, `SET_ALIVE`). The normal UI path submits unapplied effects to
      the Review Queue; approval applies atomically and rejection/supersede marks
      the effect rows reviewed. The dedicated `/review` effect-row editor shipped
      in slice 12 (replacing the JSON patch editor). Remaining refinements:
      deep-link timeline pending badges to the proposal, and design compensating
      change sets for undo/revert of already-applied effects.
- Next slices: none for M3's original relationship/event graph scope.
      (The dedicated Review Queue effect-row editor shipped in slice 12. Pending (AI/import)
      relationship proposals route through the Review Queue as of slice 11, and
      events already carry a pending path — `createPendingEventChangeSet` plus the
      `EVENT` approval dispatch — so relationships/events are now both fully
      reviewable, not just auto-approved.)
      (Group hierarchy crawler→party→guild rollup view shipped in slice 5; the
      campaign-wide relationship graph view shipped in slice 6; the campaign
      timeline page with multi-participant logging shipped in slice 7; relationship
      + event field editing shipped in slice 8; participant editing shipped in
      slice 9; event effects Review Queue integration shipped in slice 10.)
- The relationship graph now follows the M3 graph mockup's force-directed
      pan/zoom + connections-panel shape and shows only connected entities. At
      scale, node labels will crowd — the same typeahead/search note as the
      connections panel applies, and deeper clustering/analytics can be revisited
      with M12 graph analytics.
- The roster rollup is read-only and surfaces only on group-type entities
      (PARTY/GUILD/FACTION/ORGANIZATION). Membership-like edges now carry
      `sinceDay` / `untilDay`; the default roster is current/open-ended, and the
      service can reconstruct a historical roster with `{ asOfDay }`.
- The connections/timeline add forms list current campaign entities as targets;
      at scale this should become a typeahead/search (revisit with M5 search).
- The entity Timeline panel still logs events with the viewed entity plus one
      optional co-participant. Use the campaign timeline page for arbitrary
      multi-participant event logging. Event/relationship field editing landed in
      slice 8; editing an event's *participants* (add/remove/re-role after the
      fact) landed in slice 9, on both the entity Timeline panel and the campaign
      timeline page.

## M2 — Review pipeline ✅ (complete)

**Goal:** all canon mutations flow through proposals; locking + provenance work.
**Done when:** every canon change has provenance; locked fields can't be
overwritten; a DM can review/approve/reject a proposal end to end.

### Done — Review Queue redesign to the console mockup (2026-05-30)

- [x] Rebuilt `/campaigns/[id]/review` as the mockup's two-pane console:
      source-filtered queue rail on the left, selected proposal workspace on the
      right, semantic source/status badges, provenance tags, and run-level batch
      actions.
- [x] Enriched the review service's pending queue projection with target labels,
      target entity types, lock state, locked fields, and current canon values so
      the UI can show locked-field warnings and stale/conflicted proposals
      without reaching around the service layer.
- [x] Restyled operation diffs to match the mockup: compact operation headers,
      red/green before/after rows, per-field apply toggles, inline edit controls,
      lock warnings, and a three-way stale conflict panel with base/current/
      proposed values.
- [x] Added page regression coverage for the source rail, selected detail,
      generator-run batch controls, edited patches, locked fields, and stale
      three-way resolution affordances.

### Done — slice 6: batch review actions for generator runs (2026-05-30)

- [x] Added run-scoped review service actions:
      `approveChangeSetRun` bulk-approves clean pending change sets in a
      generator run while leaving blocked/stale change sets pending for manual
      review, and `rejectChangeSetRun` rejects every pending change set in a run
      without touching canon. Fixed run-approval flow to catch newly stale
      proposals (e.g. from entity version changes caused by earlier approvals in
      the same batch run) so they are held instead of throwing an unhandled error.
- [x] Extended pending entity change-set creation to preserve `runId`, so future
      generators/importers can group their proposals into honest Review Queue
      batches.
- [x] Added server actions and Review Queue run controls. The queue now shows a
      generator-run summary with proposal/operation counts and **Approve run** /
      **Reject run** controls when pending proposals share a `runId`.
- [x] Added DB-backed service coverage for clean-run approval, locked/stale hold
      behavior, run rejection, missing-run validation, and non-DM denial. Added
      action and page coverage for the new batch controls.

### Done — slice 5: supersede stale/replaced proposals (2026-05-30)

- [x] Added `supersedeChangeSet` to the review service: a DM retires a PENDING
      proposal as `SUPERSEDED` (obsolete or replaced) instead of rejecting it.
      The change set and its operations are retained for history (invariant:
      superseded proposals are never hard-deleted) and a `SUPERSEDE` audit row is
      written. DM-only.
- [x] No migration needed: `ChangeSetStatus.SUPERSEDED` already existed and
      `AuditLog.action` is a free-form string.
- [x] Added `supersedeChangeSetAction` and a **Supersede** control in the Review
      Queue, shown on proposals that carry stale operations — which can no longer
      be approved — so a DM has an honest way to retire them. Stale proposals
      still stay pending for the DM to resolve; nothing is auto-dismissed.
- [x] Added DB-backed coverage in `tests/unit/review-supersede.test.ts` (manual
      supersede retains + audits, drops out of the pending queue, non-DM blocked,
      not-found, and superseding a proposal that has gone stale under a direct DM
      edit). Verification: lint, typecheck, build, and coverage green.
- [x] Deferred design option captured in the open backlog: auto-superseding
      fully-obsolete proposals when canon changes underneath. Deferred on purpose
      — the current design keeps stale proposals pending so the DM resolves them
      (three-way view), per [`03-review-pipeline.md`](./03-review-pipeline.md).

### Done — campaign canon integrity meter in sidebar (2026-05-30)

- [x] Implemented campaign canon integrity calculation in the campaign service (`getCampaignCanonIntegrity`), which analyzes all populated fields on active entities and crawlers, matches them against field-level and whole-entity locks, checks the latest field-level provenance, and classifies them into `DM`, `AI`, `PLAYER`, and `LOCKED`.
- [x] Used the Largest Remainder Method (Hamilton method) to calculate integer percentages that sum to exactly 100% without rounding bias.
- [x] Implemented the `getCampaignCanonIntegrityAction` server action to expose the calculation safely to client components.
- [x] Integrated the integrity meter at the bottom of the `DmNav` console sidebar. It displays a segmented horizontal bar using semantic theme color variables (`var(--ink-dim)`, `var(--ai)`, `var(--player)`, and `var(--sys)`) along with a clean, monospace breakdown text (e.g. `64% DM · 22% AI-origin · 14% locked`).
- [x] Fetched and updated the meter dynamically on mount, when changing active campaigns, or on page navigation.
- [x] Added comprehensive unit tests in `tests/unit/campaigns.test.ts` covering access control, empty campaigns, mixed classifications, fallback to entity source, and largest remainder rounding.
- [x] Updated rendering tests in `tests/unit/console-shell.test.tsx` to assert that the integrity meter displays the correct breakdown when a campaign is active.

### Done — navbar brand glyph & header user menu settings (2026-05-29)

- [x] Implemented the `.brand-glyph` style in `src/app/globals.css` mimicking the yellow post-it folded-corner design from the mockup.
- [x] Restyled the navbar brand logos in `src/app/(dm)/layout.tsx` and `src/app/(auth)/layout.tsx` to use the new `.brand-glyph` style.
- [x] Replaced the top-right header controls (FX toggle, raw email text, static initials, and Sign Out button) in the DM console layout with a single initials button.
- [x] Implemented the interactive `UserMenu` client component (`src/components/console/user-menu.tsx`) which shows a settings popup menu upon clicking the initials.
- [x] Rendered the user's name in bold, their email, a separator, a tactile "Enable UI Effects" toggle switch, a disabled planned "Account Settings" option, and a "Sign Out" button inside the user settings menu.
- [x] Made the settings menu lose focus (close) when clicking outside or blurring out, while keeping it open when interacting with the UI effects toggle switch.
- [x] Added unit tests for the `UserMenu` component at `tests/unit/user-menu.test.tsx` to achieve full test verification and branch coverage.

### Done — slice 4: editable Review Queue field values (2026-05-29)

- [x] Added a Review Queue edit path that saves `EDITED` operation decisions
      with an `editedPatch` from the queue UI.
- [x] Added per-field apply checkboxes so a DM can omit proposed fields while
      editing the values that should be committed.
- [x] Rendered existing edited patches back into the queue so saved field
      decisions are visible before approval.
- [x] Added action and page regression coverage for string, array, number, and
      boolean edited field values.

### Done — slice 3: operation decisions in Review Queue (2026-05-29)

- [x] Added `setChangeOperationDecision` in the review service so pending
      operations can be marked `ACCEPTED`, `REJECTED`, or `EDITED` before final
      approval, using the existing `OpDecision` and `editedPatch` columns.
- [x] Updated approval semantics to skip rejected operations, apply edited
      patches, keep existing approve-all behavior for undecided operations, and
      mark mixed outcomes as `PARTIALLY_APPLIED`.
- [x] Re-ran lock/staleness flag checks against the effective patch, so an
      edited operation can omit a locked field and still apply the accepted
      fields safely.
- [x] Added Review Queue operation-level Accept/Reject controls plus a server
      action to persist those decisions.
- [x] Added regression coverage for partial apply, edited-patch approval,
      operation-decision actions, and Review Queue controls.

### Done — Markdown rendering for entity descriptions (2026-05-29)

- [x] Installed `marked` for parsing markdown and `isomorphic-dompurify` for HTML sanitization (on both server and client).
- [x] Created a reusable `<Markdown />` component in `src/components/ui/markdown.tsx` that safely parses, sanitizes, and renders Markdown content.
- [x] Styled markdown HTML elements (paragraphs, headers, links, lists, code, blockquotes) in `src/app/globals.css` with a customized design language that matches the theme's colors.
- [x] Integrated the `<Markdown />` component on the entity detail page (`src/app/(dm)/campaigns/[id]/entities/[entityId]/page.tsx`) to render dynamic formatted descriptions.
- [x] Added unit tests in `tests/unit/entity-page.test.tsx` verifying that markdown headings, lists, bold text, links, and blockquotes in the description are rendered correctly.

### Done — UI polish: simplified entity editing controls (2026-05-29)

- [x] Removed the "Done" link from the top of the editing section on the entity detail page.
- [x] Removed the bottom "Save entity" button from the edit form.
- [x] Assigned `id="edit-entity-form"` to the EditEntityForm to allow external submission.
- [x] Added `Save` and `Discard` buttons in the right-hand controls rail of the entity page when in edit mode. The `Save` button submits the edit form using the HTML5 `form` attribute and redirects back to the read-only view on success, and the `Discard` button links back to the read-only view.
- [x] Disabled editing of locked fields on the editing screen (inputs are set to `readOnly` and selects are set to `disabled` with a hidden input fallback), and updated global Tailwind styles for inputs/textareas to visually shade read-only fields.
- [x] Disabled opening the entity edit page (`?edit=1`) when the entire entity is locked by redirecting the user back to the read-only view in the client-side component if no form error is present.
- [x] Hid the Lock/Unlock controls in the entity view right-hand sidebar when in edit mode to prevent users from inadvertently locking the entity (and triggering a form reset) while editing.
- [x] Improved the backend update error to report the specific field(s) that were modified but locked (e.g. `This proposal touches locked entity fields: "name", "description"` or `Cannot update because the entity is locked.`).
- [x] Preserved the form state when a save fails due to a locked entity, allowing the user to copy their input or retry.

### Done — Entity source modeling and World Browser sidebar filter (2026-05-29)

- [x] Added `source ChangeSource @default(DM)` field and index to `Entity` model in `schema.prisma`.
- [x] Created database migration `add_entity_source` and regenerated Prisma client.
- [x] Updated the review service to populate the new `source` field on entity creation from the change set's source.
- [x] Updated `listEntitiesForUser` to support filtering by entity source.
- [x] Implemented the "Source" sidebar filter UI (ALL / DM / AI / PLAYER / IMPORT) in the World Browser, passing it correctly via URL state and hidden form fields.
- [x] Rendered the dynamic `SourceBadge` on entity cards in the browser.
- [x] Added unit and integration tests covering the new source filtering logic.

### Done — UI simplification: removed redundant back buttons (2026-05-29)

- [x] Removed redundant "All crawls" link from the World Browser sidebar (navigation is handled by the navbar dropdown).
- [x] Removed redundant "Back to [crawl name]" link from the Review Queue header.
- [x] Updated unit tests for the Review Queue page to match.

### Done — PR feedback: locked filters & quick-create stubs (2026-05-29)

- [x] Fixed status facet and locked filter to match entities with per-field locks (i.e., where `lockedFields` is non-empty) in addition to whole-entity locks.
- [x] Fixed Quick-create stub path to set `isStub: true` on creation, and reset it to `false` when the entity is subsequently updated/edited.

### Done — slice 1: entity proposals + review queue (2026-05-29)

- [x] Added M2 Prisma schema + migration for `ChangeSet`,
      `ChangeOperation`, `Provenance`, and `AuditLog`, plus review source/status/
      operation/decision enums.
- [x] Added the review service for entity proposals, auto-approved DM change
      sets, approval, rejection, version staleness checks, locked-field blocking,
      provenance rows, and audit rows.
- [x] Re-routed M1 entity create/update/archive service methods through
      auto-approved `DM` change sets instead of direct canon writes.
- [x] Added the first Review Queue UI at `/campaigns/[id]/review`, linked from
      the console nav, with operation diffs and approve/reject actions.
- [x] Added DB-backed regression coverage for direct-write provenance, locked
      field blocking, pending proposal approval, and pending proposal rejection;
      added server-action coverage for queue decisions.

### Done — slice 2: DM canon locking (2026-05-29)

- [x] `setEntityLock` review-service method: lock/unlock the whole entity and
      lock individual fields (`locked` / `lockedFields`). Locking is a deliberate
      DM action — not a proposal — and writes a `LOCK` / `UNLOCK` /
      `SET_FIELD_LOCKS` `AuditLog` row. It does **not** bump `version` (a lock
      protects content without making pending proposals look stale). DM-only;
      no-op when nothing changes.
- [x] `setEntityLockSchema` (Zod) + `setEntityLockAction` server action; lockable
      field names line up with the review service's patch field keys.
- [x] `EntityLockControls` UI on entity detail (lock-whole-entity toggle +
      per-field checkboxes), a field-lock count tag in the status row, and an
      edit-card hint when locked. Made the existing `updateEntityAction` surface
      `ServiceError` reasons (e.g. "touches locked entity fields") so a blocked
      edit explains itself instead of saying "try again."
- [x] Closes the **"locked fields can't be overwritten"** half of M2's done-bar
      end to end: DB-backed lock/unlock/field-lock + blocking tests, action tests,
      schema tests, and a page/form render test. Verified in-browser (lock a
      field → edit is blocked with the lock reason; canon unchanged).

### Done — entity-detail redesign to the mockup (2026-05-29)

The detail page had drifted from [`screen-world.jsx`](./design/mockup/screen-world.jsx)'s
`EntityDetail`. Reworked it to match the mockup's vision:

- [x] Full-bleed **two-column workspace** (main + 304px right rail). The console
      `<main>` is now full-bleed/non-scrolling; "document" pages (dashboard,
      campaign, review) opt into the centered column via the new `PageContainer`.
- [x] Sticky **breadcrumb back-bar**, header (type-dot · type · status · stub),
      description, and a **Fields table** whose rows carry per-field **lock
      toggles** (server actions) + a whole-entity lock in the rail — replacing the
      old stat grid and checkbox "Canon lock" card.
- [x] **Read-first**: the page shows the read view by default; Edit is a control
      that flips to the form via `?edit` (no always-open form).
- [x] Right rail: **Controls** (lock + Edit) · **Visibility** (eye/eye-off list)
      · **Connections** (honest "Planned · M3") · **Provenance** (real data from
      `getEntityProvenance`: origin/author, created, model, approved-by, last
      change + the permanence note).
- [x] Lock UI now uses `toggleEntityLockAction` / `toggleEntityFieldLockAction`
      (replacing the form-based `setEntityLockAction`); the `setEntityLock`
      service is unchanged. Tests updated; lint/typecheck/build/coverage green;
      verified in-browser against the mockup.

### Done — World Browser redesign + detail polish (2026-05-29)

- [x] Rebuilt the campaign page as the mockup's **World Browser**: full-bleed
      two-column with a **facet sidebar** (entity-type list with live counts +
      Status + "Locked only", all functional; Source / AI-origin shown as
      "Planned · M4") and a **card grid** (type-dot · source · lock · status ·
      floor). Service gained `getEntityTypeCounts` + status/locked list filters.
- [x] Replaced the two big inline create forms with the mockup's
      **Quick-create stub** (name + type → thin entity → detail to flesh out),
      backed by `quickCreateEntityAction`.
- [x] Detail-page **Controls** polish: LOCK and EDIT are now a matched HUD chip
      pair (the old `ghost` Button rendered borderless and looked broken). Edit/
      Done use the same chip.
- [x] Added `scripts/seed-world.ts` (dev-only, via the service layer) to populate
      a demo Floor-9 world for local QA. Tests/lint/typecheck/build green;
      coverage above floors; verified in-browser against both mockup screens.

### Notes / follow-ups

- Locking deliberately blocks **all** writers to a locked target (including the
      DM's own direct edit), matching the "unlock to edit" UX. If a source-aware
      policy is wanted later (locks bind AI/import but not deliberate DM edits),
      that's a review-service change, not a UI one.
- The full create forms (`CreateCrawlerForm` / `CreateGenericEntityForm`) are now
      unused by the World Browser (quick-create + detail-edit replace them) but
      kept for a future dedicated "new entity" page; their tests still run.
- Per-field **AI markers** and the connections/timeline panels are stubbed as
      "Planned · M3/M4" — no fake data — and light up when that data exists.
- M2 is complete. Relationship/event operations, connections, and timeline work
      land with M3.
- Local verification used the existing Postgres database. That database already
      contained an older local review-pipeline migration, so the new migration
      was marked applied after non-destructive local schema alignment; a fresh CI
      database will apply the committed migration normally.

## UI polish — campaign-aware shell + crawl language (2026-05-29)

### Done

- [x] Sidebar World Browser links now preserve the active campaign context
      instead of sending DMs back to the dashboard picker.
- [x] Topbar campaign control now shows the active campaign name and opens a
      switcher listing the user's campaigns plus **Start New Crawl**; it closes
      on route changes, menu selection, and focus leaving the control.
- [x] Renamed the visible new-campaign creation surface to **New Crawl** /
      **Create crawl** while keeping the internal `Campaign` domain model.

## Design language adoption — "broadcast HUD" 🎨 (2026-05-29)

Adopted the CrawlDirector Console mockup as the app's design language. **No new
features or fake data** — re-themed only the existing M0–M1 surfaces and codified
the system for future milestones.

### Done

- [x] Saved the Claude Design mockup into [`docs/design/mockup/`](./design/mockup)
      (read-only reference; excluded from lint/tsc) + brand assets to
      `public/brand/`.
- [x] New design system in [`src/app/globals.css`](../src/app/globals.css): full
      token set (warm-black surfaces, DCC gold, provenance/status semantics),
      three fonts (Chakra Petch / Space Grotesk / JetBrains Mono via `next/font`),
      HUD base CSS, and `prefers-reduced-motion`-aware broadcast-FX overlays gated
      by the `cd-fx` cookie + `FxToggle`. shadcn alias layer preserved.
- [x] New primitives: `Kicker`, `HudTag`, `TypeDot`, `SourceBadge`, `StatusPill`,
      `LockChip`, `Panel`/`PanelHeader`, `FxToggle`, and the `DmNav` console shell.
      Rethemed `Button`/`Card`/`Input`/`Textarea`/`Label` in place. Presentation
      helpers (`statusMeta`/`provenanceMeta`/`entityTypeColor`) in `lib/entities`.
- [x] Re-themed the app shell (`(dm)/layout.tsx` brand + topbar + nav) and every
      existing page: auth, dashboard, world browser, entity detail. Unbuilt nav
      destinations show as disabled **"Planned · Mn"** items (no fake pages).
- [x] Codified the system in [`13-design-language.md`](./13-design-language.md);
      cross-linked from `10-ui-ux.md`, `README.md`, and `AGENTS.md`. Logged
      mockup-surfaced roadmap refinements in [`11-roadmap.md`](./11-roadmap.md).
- [x] `lint`, `typecheck`, `build` green; tests pass.

### Notes / follow-ups

- **Coverage floor note:** `FxToggle` and `DmNav` render/interaction tests now
  exist. The current gate is 95% statements / 85% branches / 95% functions / 95%
  lines; raise the branch floor toward 90% when aggregate branch coverage supports
  it (see `AGENTS.md` and `vitest.config.ts`).
- Provenance is shown as DM-authored on existing canon (honest — the M2 pipeline
  hasn't recorded real provenance yet). `LockChip` is display-only until M2.

## M1 — Entity core + one first-class type 🚧 (in progress)

**Goal:** model and edit canon for the generic `Entity` plus `Crawler`.
**Done when:** a DM can create/edit/browse crawlers and generic entities in a
campaign, scoped by tenancy.

### Done (2026-05-28)

- [x] Added M1 Prisma schema + migration for `Entity`, `Crawler`, `EntityType`,
      `CanonStatus`, and `Visibility`.
- [x] Added lock/visibility/version columns now, with enforcement/provenance
      intentionally deferred to M2 per roadmap.
- [x] Added entity service-layer CRUD for generic entities and crawlers,
      including membership tenancy checks and DM/co-DM write permissions.
- [x] Added campaign world browser with keyword search and type filtering.
- [x] Added create forms for crawlers and generic entities, plus entity detail,
      edit, and soft-archive flows.
- [x] Added DB-backed service tests plus page/form/action/validation coverage.
- [x] Verified locally: `lint`, `typecheck`, `build`, `test`, and
      `test:coverage` green against local Postgres.

### Notes / follow-ups

- M1 entity writes are direct service-layer canon writes by design. M2 must route
  these internals through the review/provenance pipeline before further canon
  write paths are added.
- Local `prisma migrate deploy` applied the crawler audience-ratings migration
  successfully in this environment.
- Crawler audience modeling now tracks DCC's three broadcast ratings explicitly:
  views, followers, and favorites.
- Remaining M1 polish: add richer crawler stat modeling/custom fields if needed,
  improve browser search beyond basic keyword matching, and add e2e coverage for
  create/edit once Playwright browsers are available locally.

## M0 — Project foundation ✅ (complete)

**Goal:** a running Next.js app with DB, auth, and CI.
**Done when:** a user can sign up, create a campaign, and see an (empty)
campaign dashboard; tests + lint run in CI.

### Done (2026-05-27)

- [x] Scaffolded Next.js 16 (App Router, TS, Tailwind v4) in repo root.
- [x] UI primitives (shadcn-style `button`/`input`/`label`/`card`) + dark theme
      tokens. (Manual primitives instead of the `shadcn` CLI — see notes.)
- [x] Postgres + Prisma 7; `schema.prisma` with `User`, `Campaign`,
      `Membership`, `Role`, and the Auth.js adapter models
      (`Account`/`Session`/`VerificationToken`). Initial migration committed.
- [x] `docker-compose.yml` (local Postgres), `.env.example`, `prisma/seed.ts`
      (`npm run db:seed` → `dm@example.com` / `password123`).
- [x] Auth.js (NextAuth v5): credentials (email/password, bcrypt) + a generic
      OIDC provider (provider id `oidc`, enabled when `AUTH_OIDC_*` env vars are
      set; works with self-hosted Authentik/Keycloak/etc. via discovery). JWT
      session strategy — see [ADR 0001](./adr/0001-jwt-session-strategy.md).
- [x] Service-layer skeleton + directory structure per
      [`02-architecture.md`](./02-architecture.md): `src/server/{services,auth,
      ai,review}`, `src/lib`, `src/components/ui`.
- [x] Campaign service (`createCampaign`/`listCampaignsForUser`/
      `getCampaignForUser`) — tenancy-scoped; UI never touches Prisma directly.
- [x] Screens: sign-in, sign-up, dashboard (list + create campaign), empty
      campaign page; root + protected-route redirects.
- [x] Vitest unit tests (validation + DB-backed campaign service: ownership,
      tenancy scoping, non-member 404). Playwright e2e (sign-up → create
      campaign → empty dashboard; protected-route redirect).
- [x] GitHub Actions CI: install → migrate → lint → typecheck → build → unit →
      e2e, with a Postgres service.
- [x] Verified locally: `lint`, `typecheck`, `build`, `test` all green; HTTP
      smoke of credentials login + authed dashboard render.

### Notes / follow-ups

- **Playwright browsers** could not be downloaded in the build sandbox (network
  policy), so the e2e suite was not executed locally — it runs in CI. The flow
  it covers was verified manually over HTTP.
- Used **Prisma 7's driver-adapter** architecture (`@prisma/adapter-pg` +
  `prisma.config.ts`); `url` is no longer allowed in `schema.prisma`. See
  [ADR 0002](./adr/0002-prisma7-driver-adapter.md).
- DB-backed unit tests wipe `User`/`Campaign`/`Membership` between runs — point
  `DATABASE_URL` at a disposable database when running them.
- Created UI primitives by hand rather than via the `shadcn` CLI (Tailwind v4 +
  the sandbox made the interactive init unreliable). Same component shape; the
  CLI can be adopted later if desired.

### Not yet (defer to later milestones, not M0 blockers)

- Co-DM / player invitation flows, role management UI (roles modeled now).
- Anything entity/relationship/event/review-pipeline related (M1+).
