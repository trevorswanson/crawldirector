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

All milestones through **M5.5 - Data model hardening** are complete; per-slice detail
lives in the dated sections below (and older milestones in
[`PROGRESS-archive.md`](./PROGRESS-archive.md)). The cross-cutting **ADR 0009
entity-kind registry** is also fully delivered — only the brand-new-`EntityType`
"proof" remains, and it rides along with M7's `BOX` (see the game-progression item
under *Deferred design options*).

**Active: M6 — System AI persona engine**
([05-system-ai-persona.md](./05-system-ai-persona.md)).
Slices 1–4 are complete: the review-backed server foundation, the Persona
Studio UI + first generator prompt injection, the `PERSONA_SHIFT` event-effect
kind (manual persona drift living in the causality graph), and the compact
selected-snapshot history diff. **Next up: AI-proposed persona drift through the
pending review path and the full persona-aware generator family
(encounter/mob/boss/loot/System-message).** Keep the M6 work incremental.

- [x] **Slice 1 — Persona snapshot foundation + compiler.** Added the
      `PersonaSnapshot` table (generic to any `Entity`, first used by
      `SYSTEM_AI`), Prisma migration `20260619110632_m6_persona_snapshots`,
      `CREATE_PERSONA_SNAPSHOT` / `UPDATE_PERSONA_SNAPSHOT` review operations,
      active-snapshot exclusivity per entity, prompt-lock checks for
      `compiledPrompt`, field-level provenance on persona snapshots, the pure
      `compilePersonaPrompt` compiler, and `getActiveSystemPersonaPrompt` as the
      generator-facing read seam. ✅ 2026-06-19.
- [x] **Slice 2 — Persona Studio UI + prompt injection.** Built the DM-only
      `/campaigns/[id]/persona` Persona Studio from the console shell primitives
      (real `SYSTEM_AI` entities/snapshots only — empty state points to the World
      Browser, no filler): create/edit snapshots with dial sliders + agenda/voice
      fields, a live compiled-prompt preview, prompt lock/unlock, activate, the
      snapshot timeline rail, and a "View in Review Queue" deep-link. Wired
      `getActiveSystemPersonaPrompt` into the flesh-out generator for the
      dungeon-voiced kinds (`BOSS`/`MOB_TYPE`/`ITEM`/`SYSTEM_MESSAGE`/
      `ACHIEVEMENT`/`TITLE`), recording the snapshot id + prompt version on the
      change set (and `personaSnapshotId` onto each Provenance row). ✅ 2026-06-19
      (dated entry below).
- [x] **Slice 3 — `PERSONA_SHIFT` event-effect kind.** A new structured event
      effect that drifts a target `SYSTEM_AI`'s active persona by per-dial deltas
      when the event's effects are applied — the drift lands as a brand-new active
      snapshot (the prior is preserved as history) whose provenance points back at
      the apply change set, so "why did the persona change" traces through the
      causality graph. Manual shifts work now; AI-proposed drift through the
      pending path stays a later slice. ✅ 2026-06-20 (dated entry below).
- [x] **Slice 4 — Persona snapshot history diff.** The Persona Studio now
      compares the selected snapshot to its immediate predecessor, displaying
      before→after dials, agenda additions/removals, resource/value/profile
      changes, and an explicit first-snapshot state. The comparator is pure;
      no schema or canon-write path changed. ✅ 2026-06-22.
- [ ] **Later M6 slices.** AI-proposed persona drift through the pending review
      path, full persona-aware generator family (encounter, mob/boss, loot,
      System-message), and broader actor-profile studio reuse for M11.

### Scheduled roadmap additions (2026-06-19)

These are accepted as roadmap/backlog design, not active implementation work;
M6 remains the next milestone work. The detailed decisions live in
[ADR 0012](./adr/0012-shared-canon-library-and-import.md) and
[ADR 0013](./adr/0013-job-priorities-and-idle-maintenance.md).

- [ ] **M9/M10 — Global admin + shared canon library.** Add a global
      super-admin and guarded `/admin` shell; create a singleton admin-owned
      shared-library campaign. Permit read-only library browsing only through an
      explicit DM entitlement, route external-DM suggestions to the library
      campaign's queue as `PLAYER_SUGGESTION`, and replace new-campaign DCC lore
      seeding with reviewed `IMPORT` proposals. Use relational import links plus
      dependency-aware review operations so library relationships are proposed
      when both endpoints arrive, including across separate import sessions; no
      imported library update silently syncs into a DM's campaign.
- [ ] **M9 — Job inspection + AI spend attribution.** Add structured job outcome
      detail (affected records, embedding/document ids, repair/migration diff),
      and link each AI usage record to its originating job so the Jobs page can
      aggregate input/output/cache tokens and known cost without exposing keys.
- [ ] **M9 — Safe priorities + idle maintenance.** Add user-work and maintenance
      priority classes (FIFO within class); the worker may enqueue/claim
      maintenance only when no user work is available. Before any automatic
      entity-data migration, compute and persist a dry-run impact report. Auto-run
      only validation-clean, lossless candidates; leave unknown/off-schema fields,
      removed fields, or other impacts for an explicit DM-reviewed repair. Treat
      the current lossless FLOOR satellite move separately from this future-risk
      policy; do not imply it has already lost data.

(Open, non-milestone-blocking follow-ups and deferrals live in the subsections
below.)

## M6 — Persona snapshot history diff (slice 4) ✅ (2026-06-22)

**Goal:** make an evolving System AI readable as an arc without asking the DM
to manually compare two full persona forms. No schema change: the existing
DM-only Persona Studio query already returns its selected entity's snapshots
newest-first.

- [x] **Pure diff model** ([`persona-diff.ts`](../src/lib/persona-diff.ts)):
      deterministic immediate-predecessor comparison with canonical dial order,
      before→after values (absence stays `—`, never zero), overt/secret agenda
      additions/removals, values, resources, and concise profile-field changes.
- [x] **Persona Studio UI** ([`persona-snapshot-diff.tsx`](../src/components/persona/persona-snapshot-diff.tsx),
      [`persona/page.tsx`](<../src/app/(dm)/campaigns/[id]/persona/page.tsx>)):
      a token-backed panel below the studio introduction says “Changed since
      [previous snapshot]”; the oldest snapshot states that it has no earlier
      comparison and create mode shows no diff. Dials are `before → after`; the
      agenda section is deliberately terse so it explains the direction of the
      shift without inventing AI narrative.
- [x] **Tests:** pure comparison coverage for ordering, additions/removals,
      visibility changes, resources, scalar fields, malformed empty text, and
      no-op snapshots; component and page coverage for diff tokens,
      immediate-predecessor selection, first-history state, and create-mode
      suppression.

## M6 — `PERSONA_SHIFT` event-effect kind (slice 3) ✅ (2026-06-20)

**Goal:** the roadmap's `PERSONA_SHIFT` bullet — let System AI persona drift live
in the same causality graph as everything else, so a DM can record *why* the
persona changed (e.g. "court overturns the ruling → compliance −15, resentment
+20"). Manual shifts work now; AI-proposed drift through the *pending* path stays
a later slice. Branch: `feat/m6-persona-shift-effect`. No schema change (effects
are JSON on `Event`; the drift writes a `PersonaSnapshot` through the existing
apply path).

**Decision (one effect = one new snapshot).** A `PERSONA_SHIFT` effect carries a
**multi-dial delta map** (`dialShifts`), matching the design doc's
`PersonaShift { compliance −15, resentment +20 }`. On apply it materializes as a
single **new active** snapshot that carries the prior active snapshot's
values/agendas/voice/constraints forward, nudging only the targeted dials
(clamped to −100…100) and recompiling the prompt — the prior snapshot stays as
inactive history (the persona is an ordered series along campaign time). It
routes through the slice-1 `applyCreatePersonaSnapshot` path, so it reuses
one-active-per-entity exclusivity, **refuses to deactivate a locked active
snapshot** (surfaces as a blocked op — invariant #2), and writes provenance
pointing at the apply change set (the `PersonaSnapshot.provenance` relation
answers "what drove this snapshot"). The new snapshot is anchored to the event's
in-game time, and the target `SYSTEM_AI` is recorded as an `AFFECTED` participant.

- [x] **Registry + validation** ([`event-effect-kinds.ts`](../src/lib/event-effect-kinds.ts),
      [`persona.ts`](../src/lib/persona.ts), [`validation.ts`](../src/lib/validation.ts)):
      added `PERSONA_SHIFT` to the effect-kind registry with a new `PERSONA`
      target kind + `usesDials` meta; exported the canonical `PERSONA_DIAL_KEYS`/
      `PERSONA_DIAL_LABELS`/`clampPersonaDial` from the persona lib (single source
      of truth, also adopted by the studio form parser); extended `eventEffectSchema`
      with a `dialShifts` record requiring ≥1 non-zero known-dial delta and
      rejecting unknown dials.
- [x] **Phrasing** ([`event-effects.ts`](../src/lib/event-effects.ts)):
      `describeDialShifts` ("Compliance −15, Resentment +20", canonical order) +
      a `describeEffect` `PERSONA_SHIFT` branch.
- [x] **Service** ([`review.ts`](../src/server/services/review.ts),
      [`events.ts`](../src/server/services/events.ts)): `StoredEventEffect.dialShifts`
      parse/serialize; `assertValidDeclaredEffect` validates the deltas; a
      kind-aware `assertDeclaredEffectTarget` (crawler kinds resolve a crawler,
      `PERSONA_SHIFT` resolves a `SYSTEM_AI`) replaces the bare crawler check in
      create/update event; the flag-eval crawler probe skips non-crawler kinds; the
      apply dispatch gains a `PERSONA_SHIFT` branch → `applyPersonaShiftEffect`
      (loads the active snapshot, applies clamped deltas, files a new active
      snapshot via `applyCreatePersonaSnapshot`). `applyEventEffects` pre-flights a
      missing active persona inline (parity with the COLLAPSE_FLOOR pre-flight);
      `EventEffectView`/projection + the create/update patch builders carry
      `dialShifts`.
- [x] **UI** ([`effect-rows.tsx`](../src/components/entities/effect-rows.tsx),
      [`actions.ts`](<../src/app/(dm)/actions.ts>),
      [`timeline-panel.tsx`](../src/components/entities/timeline-panel.tsx),
      [`campaign-timeline.tsx`](../src/components/timeline/campaign-timeline.tsx),
      [`effect-operation-editor.tsx`](../src/components/review/effect-operation-editor.tsx),
      [`review/page.tsx`](<../src/app/(dm)/campaigns/[id]/review/page.tsx>)): the
      effect-row editor renders per-dial delta inputs + a `SYSTEM_AI` target
      typeahead for `PERSONA_SHIFT` (candidate pool chosen by the kind's target);
      `parseEffectRows` collects `effectDial_<i>_<dial>` fields; both timelines and
      the Review Queue effect editor thread persona candidates + a persona search
      action; a shared `effectViewToRow` helper centralizes the view→row mapping.
- [x] **Tests:** new DB-backed
      [`persona-shift-effect.test.ts`](../tests/unit/persona-shift-effect.test.ts)
      (schema validation; the drift creates a new active snapshot with clamped
      dials + preserved history + provenance + AFFECTED participant; declare-via-edit
      path; non-System-AI target rejected; no-active-persona pre-flight; locked
      active persona blocks the shift; projection of declared dialShifts). UI/pure:
      [`effect-rows.test.tsx`](../tests/unit/effect-rows.test.tsx),
      [`effect-operation-editor.test.tsx`](../tests/unit/effect-operation-editor.test.tsx),
      [`event-effects-section.test.tsx`](../tests/unit/event-effects-section.test.tsx)
      (`describeEffect`/`describeDialShifts`),
      [`dm-actions.test.ts`](../tests/unit/dm-actions.test.ts) (dial form parsing),
      [`campaign-timeline.test.tsx`](../tests/unit/campaign-timeline.test.tsx)
      (persona typeahead → search action), and
      [`review-queue-page.test.tsx`](../tests/unit/review-queue-page.test.tsx)
      (persona-shift summary in the queue).
- [x] **Verification:** `npm run lint` (0 errors; pre-existing settings-action
      warnings only), `npm run typecheck`, `npm run build` (routes unchanged), and
      the full coverage gate green (statements 95.08%, branches 88.38%, functions
      96.69%, lines 96.82%). In-browser verification was deferred (the local dev
      server occupies the only Next dev port — see the preview note in memory).

## Maintenance — consolidated AI actions + Job Queue filters ✅ (2026-06-19)

- [x] **One AI entry point per surface.** Replaced the World Browser's separate
      scaffold/bulk-flesh triggers with one icon-only Sparkles button, and moved
      the entity-detail generator controls from the right rail into the title
      row. Both open the new token-aligned, accessible portal `Dialog`; existing
      forms/actions, lock behavior, proposal links, and background-job status
      remain unchanged inside labeled modal sections.
- [x] **Job Queue filters.** The DM queue now has URL-driven Job type, Status,
      and AI-only facets in the standard console rail. `listRecentJobs` applies
      optional kind/status filters server-side; AI-only restricts history to
      `BULK_FLESH` and `EMBED_SEARCH_DOCS`, the job kinds that consume tokens.
      A filtered empty result now says so rather than implying no job history.
- [x] **Tests.** Added dialog accessibility/close behavior coverage, consolidated
      action-dialog coverage, page placement/gating coverage, URL-filter parsing,
      and DB-backed kind/status/AI-only job-query assertions.
- [x] **Verification.** Focused suite: 107 tests. Full coverage: 95.03%
      statements / 88.09% branches / 96.58% functions / 96.77% lines. Lint,
      typecheck, and production build passed. Browser QA exercised both AI modals
      and combined job-filter URL state with no application console errors.

## M6 — Persona Studio UI + prompt injection (slice 2) ✅ (2026-06-19)

**Goal:** turn the slice-1 server foundation into a usable DM surface and prove
the loop the milestone is named for — the active System AI persona *driving* a
real generator. Branch: `feat/m6-persona-studio`. Schema change (additive
`ChangeSet` columns only).

**Decision (authoring flow).** DM authoring through the studio is **auto-approved**
(`applyAutoApprovedPersonaSnapshotChangeSet`), matching every other direct DM
canon edit (invariant #1 models a DM edit as an auto-approved proposal with full
provenance) and keeping the flagship tool fast. The slice's "link resulting
proposals to the Review Queue" is met by deep-linking each snapshot's originating
change set (`/review?selected=<id>` — the queue lists closed sets too). AI-proposed
persona drift through the *pending* path stays a later slice.

**Decision (generation provenance).** Added `ChangeSet.personaSnapshotId` (FK →
`PersonaSnapshot`, `onDelete: SetNull`) + `ChangeSet.personaPromptVersion Int?` as
change-set-level generation attribution (mirroring the existing `providerId`/
`model`/`promptId`/`promptVersion`). `writeEntityProvenance` copies
`personaSnapshotId` onto each field's `Provenance` row (the FK already existed from
slice 1), so the `PersonaSnapshot.provenance` relation answers "what did this
persona generate?". The snapshot's secret-agenda *text* never leaves the DM-only
snapshot — provenance stores only a reference, and provenance is DM-only anyway.

- [x] **Schema** ([`schema.prisma`](../prisma/schema.prisma), migration
      `20260619182838_m6_persona_driven_changeset`): `ChangeSet.personaSnapshotId`
      + `personaPromptVersion` + the `PersonaSnapshot.drivenChangeSets` back-relation
      (additive columns only; drift gate clean).
- [x] **Generator injection** ([`generation.ts`](../src/server/services/generation.ts),
      [`flesh-entity.ts`](../src/server/ai/generators/flesh-entity.ts),
      [`persona.ts`](../src/lib/persona.ts)): a pure
      `isPersonaVoicedEntityType` (BOSS/MOB_TYPE/ITEM/SYSTEM_MESSAGE/ACHIEVEMENT/
      TITLE) gate; `fleshOutEntityLocked` fetches `getActiveSystemPersonaPrompt`
      for those kinds and passes it to `buildFleshEntityPrompt`, which prepends a
      cacheable persona voice block with a no-reveal rule for secret agendas;
      `FLESH_ENTITY_GENERATOR.version` bumped `2 → 3`; the change set records the
      snapshot id + version. Non-voiced kinds and campaigns without an active
      System AI persona are unaffected.
- [x] **Studio service** ([`persona.ts`](../src/server/services/persona.ts)):
      DM-only `getPersonaStudio` (entities + newest-first snapshot timeline +
      active id + provenance origin per snapshot), and the auto-approved write
      helpers `createPersonaSnapshot` / `updatePersonaSnapshot` /
      `setPersonaPromptLock` / `activatePersonaSnapshot`, all delegating to the
      slice-1 review apply path. Reuses exported lib normalizers
      (`normalizePersonaDials`/`-Resources`/`-Values`/`-Agendas`).
- [x] **Validation + actions** ([`validation.ts`](../src/lib/validation.ts),
      [`actions.ts`](<../src/app/(dm)/actions.ts>)): `personaSnapshotInputSchema`
      (dials clamped −100…100, bounded list/agenda/resource fields,
      knowledge-scope enum) and the four server actions
      (`createPersonaSnapshotAction` redirects to the new snapshot;
      update/lock/activate revalidate the route), with FormData parsing of the
      slider/textarea form (lenient `key: value` resource lines).
- [x] **UI** ([`persona/page.tsx`](<../src/app/(dm)/campaigns/[id]/persona/page.tsx>),
      [`persona-editor.tsx`](../src/components/persona/persona-editor.tsx),
      [`dm-nav.tsx`](../src/components/console/dm-nav.tsx)): `<ConsoleScreen>` /
      `<ScreenRail>` / `<ScreenHeader>` shell with an entity selector + snapshot
      timeline rail, the controlled editor with six dial sliders and a **live**
      `compilePersonaPrompt` preview (the pure compiler runs client-side, matching
      the stored fragment), the stored compiled-prompt panel with the Review Queue
      deep-link, prompt-locked notice, and an empty state linking the World Browser.
      The nav's "AI · Persona Studio" is now a real link (no longer "Planned").
- [x] **Tests:** pure [`persona.test.ts`](../tests/unit/persona.test.ts)
      (normalizers + `isPersonaVoicedEntityType`),
      [`flesh-entity-generator.test.ts`](../tests/unit/flesh-entity-generator.test.ts)
      (persona voice block injected/omitted, version 3); DB-backed
      [`persona-studio.test.ts`](../tests/unit/persona-studio.test.ts) (studio read,
      create/update/lock/activate, non-System-AI + player rejection) and
      [`generation.test.ts`](../tests/unit/generation.test.ts) (persona injected for
      a BOSS with attribution copied to provenance on approval; not for an NPC); UI
      [`persona-studio-page.test.tsx`](../tests/unit/persona-studio-page.test.tsx) +
      [`persona-editor.test.tsx`](../tests/unit/persona-editor.test.tsx);
      [`dm-actions.test.ts`](../tests/unit/dm-actions.test.ts) +
      [`console-shell.test.tsx`](../tests/unit/console-shell.test.tsx).
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors;
      pre-existing settings-action warnings only), `npm run build` (new
      `/campaigns/[id]/persona` route), `npx prisma migrate dev` (drift gate clean),
      and the full coverage gate green (116 files / 1591 tests; statements 95.03%,
      branches 87.98%, functions 96.66%, lines 96.77%). **In-browser** (reseeded
      `dcc`, authed as `dm@example.com`): the empty state renders and links the
      World Browser; after authoring a `SYSTEM_AI` entity + active persona via the
      service, the studio renders the title/ACTIVE PERSONA badge/LOCK PROMPT
      control, the six dial sliders (82/18/64/−35/76/91), the live + stored
      compiled prompt (incl. the secret-agenda section, DM-side only), and the
      Review Queue deep-link, with no persona-related console errors (RSC boundary
      intact).

## M6 — Persona snapshot foundation (slice 1) ✅ (2026-06-19)

**Goal:** establish the M6 server-side canon foundation before building the
Persona Studio UI: `PersonaSnapshot` rows are first-class reviewable canon, the
System AI persona can compile into a deterministic prompt fragment, and future
persona-aware generators have a service-layer seam for the active compiled
prompt. Branch: `codex/m6-persona-foundation`. Schema change.

- [x] **Schema** ([`schema.prisma`](../prisma/schema.prisma),
      migration `20260619110632_m6_persona_snapshots`): new `PersonaSnapshot`
      model keyed to `Campaign` + any `Entity`, with dials/values/agendas/
      resources, `knowledgeScope`, `voiceGuide`, `constraints`, cached
      `compiledPrompt`, active/locked/promptLocked flags, `source`, `status`, and
      versioning. `Provenance.personaSnapshotId` now has a real FK/index. `OpKind`
      now includes `CREATE_PERSONA_SNAPSHOT` and `UPDATE_PERSONA_SNAPSHOT`.
- [x] **Compiler** ([`persona.ts`](../src/lib/persona.ts)): deterministic prompt
      compiler for System AI snapshots. It turns dials into behavioral bands,
      separates overt agendas from secret generation-only agendas, includes
      resources/knowledge scope/voice/constraints, and is pure so services/tests
      can use it without Prisma.
- [x] **Review pipeline** ([`review.ts`](../src/server/services/review.ts)):
      pending and auto-approved persona change-set helpers; apply paths for
      create/update; active-snapshot exclusivity per entity; staleness checks via
      `version`; `locked` and `promptLocked` blocking; Review Queue enrichment
      with labels/current values; persona-specific provenance copied from the
      change set (including generated `compiledPrompt` provenance).
- [x] **Generator seam** ([`persona.ts`](../src/server/services/persona.ts)):
      `getActiveSystemPersonaPrompt(userId, campaignId)` is DM-only and returns
      the active `SYSTEM_AI` snapshot id/entity id/compiled prompt/prompt lock/
      version for future persona-aware generators.
- [x] **Tests:** [`persona.test.ts`](../tests/unit/persona.test.ts) covers the
      compiler's secret-aware output. [`persona-review.test.ts`](../tests/unit/persona-review.test.ts)
      covers creating active snapshots through review, provenance, active
      exclusivity, active prompt resolution, and AI prompt-lock blocking.

### Follow-ups captured from delivered slices

- [ ] **Entity image support (M1 follow-up).** Support uploading or linking a main image (`imageUrl`) for any entity:
      - Add `imageUrl String?` to the `Entity` database model and validate on writes.
      - Add image upload/input to `EntityForm` (fully reviewable, lockable, and provenance-tracked).
      - Render the image/avatar in the entity detail header (avatar size for characters, card/illustration style for items/locations/floors).
- [ ] **Knowledge / reveal grants.** Extend beyond ENTITY→ENTITY to
      field/relationship/event/FACT targets and MEMBERSHIP recipients; wire the
      M7 player "known world" projection and M11 agent fog-of-war context; add a
      reveal undo affordance and source-event linking for M8 session reveals.
- [ ] **Event effects ergonomics.** Design compensating change sets for
      undo/revert of already-applied effects. Deep-linking pending timeline
      effect badges to Review Queue proposals is complete.
- [ ] **Form failure value-preservation audit.** Timeline event create forms now
      retain typed values when a server action returns an error; audit remaining
      uncontrolled forms that render inline action errors and convert any
      value-losing paths to controlled/state-preserving inputs.
- [ ] **Timeline roster snapshots.** Add an explicit floor-day band affordance for
      roster snapshots. Selected-event roster snapshots are complete: timeline
      participant links pass an inferred `rosterDay` into
      `getGroupRoster({ asOfDay })`.
- [ ] **Scale refinements for pickers and graph labels.** Revisit relationship
      graph label crowding with M12 graph analytics. Connection and timeline
      entity pickers now use M5 search/typeahead for keyword-only lookup beyond
      their initial candidate lists.
- [ ] **M8/M14 broadcast HUD chrome.** Add a live broadcast ticker with session
      events/reveals in M8, and at-a-glance audience-rating tickers with M14
      broadcast & fan-economy modeling.
- [ ] **Merge `COLLAPSE` + `ABSOLUTE_DAY` time bases (time-model simplification).**
      The two bases resolve **identically** — `resolveAbsoluteDay`
      ([`time-resolve.ts`](../src/lib/time-resolve.ts)) returns the raw `offset` for
      both (collapse = day-0 epoch); only the generated phrase differs ("Day N since
      the collapse" vs "Day N" — [`time-ref.ts`](../src/lib/time-ref.ts)), yet both
      are separately selectable in
      [`event-time-fields.tsx`](../src/components/entities/event-time-fields.tsx).
      Retire `ABSOLUTE_DAY` as a picker, keep one day-since-collapse basis, preserve
      the bare "Day N" wording via the existing `label` override (or a phrasing
      toggle), and migrate `Event.inGameTime` rows `ABSOLUTE_DAY → COLLAPSE`. Touches
      `timeBasisValues`/`phraseTimeRef`, the form, and
      `tests/unit/{time-resolve,time-ref}.test.ts`.
- [ ] **Roster ↔ connections dedup + roster editor (groups).** For PARTY/GUILD/
      FACTION/ORGANIZATION the main-pane roster (`getGroupRoster`,
      [`groups.ts`](../src/server/services/groups.ts)) and the side connections pane
      show the *same* MEMBER_OF/LEADS/PART_OF edges, because
      `listConnectionsForEntity` ([`relationships.ts`](../src/server/services/relationships.ts))
      returns all edges unfiltered.
      - **Dedup:** add an `excludeTypes` prop to
        [`connections-panel.tsx`](../src/components/entities/connections-panel.tsx)
        and pass `{MEMBER_OF, LEADS, PART_OF}` for group types from the entity
        detail page, with a "membership shown in roster above" note (no silent hide).
      - **Editor:** make the roster pane editable (add/remove member, set/clear
        leader, edit day-bounds) reusing existing actions
        ([`actions.ts`](<../src/app/(dm)/actions.ts>)): `createRelationshipAction`
        (with the `direction="in"` toggle), `updateRelationshipAction`,
        `archiveRelationshipAction`, `toggleRelationshipLockAction` — no
        service-layer change. **Open question:** enforce a single leader, or allow
        co-leaders? (no uniqueness today).
- [ ] **Reconcile `PART_OF` overload (minor).** It's registered SPATIAL
      (location→floor) in [`relationship-types.ts`](../src/lib/relationship-types.ts)
      but `getGroupRoster` also uses it for party-in-guild roll-up, and its
      `sourceTypes` exclude `PARTY` so the create-UI won't suggest it there. Decide:
      broaden PART_OF's registry metadata, or split a distinct parties-in-guild
      membership type.
- [ ] **Connections pane should honor `rosterDay`/`asOfDay` (minor).** The roster
      filters time-bounded membership by day; the connections pane always shows
      current edges. Thread the day param into the pane, or document the difference.

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

---

## Older milestones (archived)

Completed, green milestones below this point have been moved verbatim to
[`PROGRESS-archive.md`](./PROGRESS-archive.md) to keep this working checklist
lean: **M5.5** (entity model refactor with satellites), **M5** (search indexing, semantic search, retrieval-augmented generation), **M4** AI
generation (BYO-key storage, provider abstraction, first generator, generator-expansion tail, entity-kind registry, visibility simplification), **M3** (floor/timeline/graph/knowledge slices), **M2** (review
pipeline), **M1**, **M0**, and the early design-language/shell work. Their open
follow-ups (if any) are mirrored in the **Open backlog** section at the top of
this file, which remains the authoritative pickup list.
