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
entity-kind registry** is fully delivered, including the brand-new-`EntityType`
"proof": M7's `BOX` (✅ 2026-06-30) is a creatable type carrying no bespoke
`data.*` fields, so it ships through the generic core path with only enum +
registry-metadata additions and **no kind descriptor** — exactly as the registry
intended.

**Active: M6 — System AI persona engine**
([05-system-ai-persona.md](./05-system-ai-persona.md)).
Slices 1–6 are complete: the review-backed server foundation, the Persona
Studio UI + first generator prompt injection, the `PERSONA_SHIFT` event-effect
kind (manual persona drift living in the causality graph), the compact
selected-snapshot history diff, the event-consequence generator, and the
persona-aware **dungeon-content generator** (create a new boss/mob/loot/System
message/achievement/title from a DM brief in the active persona's voice).
**Next up:** the **encounter** set-piece generator (multi-entity, so it waits on
M10's generic operation aliases/dependencies) rounds out the named family, plus
broader actor-profile studio reuse for M11. Keep the M6 work incremental.

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
- [x] **Slice 5 — Event-consequence generator.** The campaign Timeline can ask
      the BYO model for bounded effects and causal links for an existing unlocked
      event. Output is structured and files one AI `PENDING` change set; effects
      (including `PERSONA_SHIFT`) stay out of Event history and canon until the
      DM approves them. Existing target/event locks, cycle guards, usage, and
      provider/model/prompt provenance remain enforced. New downstream Event
      creation stays with M10's operation-alias/dependency work. ✅ 2026-06-22.
- [x] **Slice 6 — Persona-aware dungeon-content generator.** A new generator that
      creates one fully-fleshed dungeon-voiced entity (BOSS / MOB_TYPE / ITEM /
      SYSTEM_MESSAGE / ACHIEVEMENT / TITLE) from a DM brief, in the active System
      AI persona's *current* voice, filed as a PENDING `CREATE_ENTITY` proposal —
      the create-from-scratch counterpart to the flesh-out generator (which only
      enriched existing entities). This delivers the monster/boss/loot/System-message
      members of the design's persona-aware family as one kind-parameterized
      generator; the multi-entity **encounter** set-piece stays a later slice
      (it needs M10's operation aliases/dependencies). ✅ 2026-06-22 (dated entry
      below).
- [ ] **Later M6 slices.** The **encounter** set-piece generator (multi-entity),
      and broader actor-profile studio reuse for M11.

**M7 — Player crawler interface + sharing — done ✅ (2026-08-04)**
([11-roadmap.md](./11-roadmap.md)). M6's "done when" bar was met and its remaining
slices are *blocked* (encounter waits on M10, actor-profile reuse is M11), so M7
became the lowest unblocked milestone work. The **game-progression** sub-thread (no
player-UI surface required yet) completed first: the `GRANT_ACHIEVEMENT` event
effect (✅ 2026-06-29) plus `BOX` as a new `EntityType` with achievement→box
`GRANTS_BOX` rewards and box→item `CONTAINS` contents (✅ 2026-06-30) — both dated
entries below. The **player crawler interface** followed slice by slice: the
foundation slice — the player console shell, role-based routing, and a projected
read-only "Known World" — shipped ✅ 2026-06-30 (dated entry below). Slice 2 — the
player↔crawler link + read-only crawler sheet — shipped ✅ 2026-07-01 (dated entry
below). Slice 3 — the crawler **loadout** (inventory / loot boxes / achievements /
titles) alongside the sheet — shipped ✅ 2026-07-02 (dated entry below). Slice 4 —
the **System-message feed** (THE SYSTEM's in-fiction broadcasts, visibility-scoped)
— shipped ✅ 2026-07-09 (dated entry below). Slice 5 — scoped **"Ask the System"**
(reusing the M5 `askCampaign` service, already role-scoped) — shipped ✅ 2026-08-04
(dated entry below). Slice 6 — player **Suggestions** (bio/notes edits filed as
`PLAYER_SUGGESTION` change sets through the existing review pipeline) — shipped
✅ 2026-08-04 (dated entry below), closing the milestone's "done when" bar: a
player logs in, sees only shared/own-crawler data, and can submit a suggestion.
**Next up:** M8 — live session mode & recaps ([`08-session-mode.md`](./08-session-mode.md)).

**M8 — Live session mode & recaps — done ✅ (2026-08-13)**
([08-session-mode.md](./08-session-mode.md)). Slice 1 — session capture — shipped
✅ 2026-08-04 (dated entry below): the `GameSession`/`SessionLogEntry` data model,
a DM-only Sessions screen to start a session and jot a running freeform log
during play, optionally tagged to existing entities via a typeahead picker.
Slice 2 — promote to Event — shipped ✅ 2026-08-04 (dated entry below): each
unpromoted log entry can be promoted to a canonical `Event` through the review
pipeline (`source: DM`, auto-approved, fully provenanced), reusing the entry's
own text as the Event summary and its live tagged entities as ACTOR
participants. Slice 3 — live reveal — shipped ✅ 2026-08-04 (dated entry below):
a "Live reveal" panel on the session screen lets the DM broadly reveal an
entity (flip campaign-wide visibility to `PLAYER_VISIBLE`, through the review
pipeline) or privately reveal it to one recipient — another actor entity, or
now a specific player's `Membership` — creating a session-linked
`KnowledgeGrant`, building on M3's fog-of-war foundation. Slice 4 — session
recap generation — shipped ✅ 2026-08-13 (dated entry below): a one-button,
ephemeral "previously on Dungeon Crawler World" recap synthesized from the
session's raw log + the events it promoted, read-only like "Ask" (M5 slice 5)
and never persisted. Slice 5 — publish recap — shipped ✅ 2026-08-13 (dated
entry below): a "Publish to players" step on the recap panel turns the
currently-shown recap into a `PLAYER_VISIBLE` `SYSTEM_MESSAGE`, created
directly (an auto-approved DM `CREATE_ENTITY` change set, fully provenanced) —
this closes the roadmap's M8 "done when" bar ("a DM can capture a session
live, reveal facts to players, promote moments to Events, and publish
recaps"). Per-crawler recap spotlights and an in-fiction/persona-voiced recap
narration (the other two "Recaps & broadcasts" bullets) remain as non-blocking
follow-ups — see "Open backlog" below. **Next up:** M9 — hardening, deploy &
data portability.

### Scheduled roadmap additions (2026-06-19)

These are accepted as roadmap/backlog design, not active implementation work;
M9 is now the next milestone work (M6–M8 are done, with M6's encounter
generator and M11 actor-profile reuse as their own tracked backlog items). The
detailed decisions live in
[ADR 0012](./adr/0012-shared-canon-library-and-import.md) and
[ADR 0013](./adr/0013-job-priorities-and-idle-maintenance.md).

- [ ] **M8 (follow-up, non-blocking) — Per-crawler recap + in-fiction/persona-
      voiced recap narration.** The two remaining bullets under
      [`08-session-mode.md`](./08-session-mode.md)'s "Recaps & broadcasts":
      (1) a spotlight recap scoped to what one player's crawler actually
      experienced (visibility-respecting, for absent players/immersion), and
      (2) rendering a recap in the active System AI persona's voice (or a
      host's), reusing the M6 persona-prompt seam the way the dungeon-content
      generator does. M8's roadmap "done when" bar (capture, reveal, promote,
      publish) is already met by slices 1–5 — these are enhancements to the
      existing `generateSessionRecap`/`publishSessionRecap` pair, not
      blockers.
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

## M8 — Publish session recap (slice 5) ✅ (2026-08-13)

**Goal:** the fifth and final M8 slice — the "publish them to players … as a
`SYSTEM_MESSAGE`/Show artifact via the review pipeline" half of
[`08-session-mode.md`](./08-session-mode.md)'s "Recaps & broadcasts" note.
Slice 4 shipped the ephemeral generate-only half; this slice adds the other
option the doc calls out ("ephemeral … publish … or both"), and with it closes
the roadmap's M8 "done when" bar: "a DM can capture a session live, reveal
facts to players, promote moments to Events, and publish recaps."

**Decision (publish the client-shown text verbatim, as a direct
`PLAYER_VISIBLE` create — not a re-generation, not a DM_ONLY proposal to
review further).** `generateSessionRecap` never persists its output (M8 slice
4's deliberate ephemeral design), so publishing can't re-run the generator —
it has nothing stored to re-run from — and re-generating would risk a
different recap than the one the DM actually read and chose to publish. So
`publishSessionRecap` takes the recap text straight from the client exactly as
displayed (a hidden form field carries it from the already-rendered panel) and
never touches the provider. This isn't a new privilege: a DM can already
create any entity with any content through the ordinary create-entity form, so
trusting DM-submitted text here is no different. Unlike the dungeon-content
generator's `buildContentCreatePatch` (`DM_ONLY`, because that's an AI
proposal a DM still reviews), publishing needs a new `buildBroadcastCreatePatch`
(`entities.ts`) that creates `PLAYER_VISIBLE` immediately — clicking "Publish
to players" *is* the deliberate reveal action, the same logic
`revealEntityBroadly` already uses for an existing entity, just applied at
creation time. The write itself reuses the ordinary auto-approved
`CREATE_ENTITY` change-set path (`applyAutoApprovedEntityChangeSet`,
`source: DM`), the same direct-write shape `promoteSessionLogEntryToEvent`
already established for turning session-scratch content into canon, so the
published message is fully provenanced. The UI (`PublishRecapForm`, a
sub-component of `SessionRecapPanel`) mirrors `PromoteEntryForm`'s
collapsed-button → title-field → static-confirmation-link shape; it's `key`d
on the parent generate call's timestamp so clicking "Generate recap" again
always resets it to collapsed, instead of showing a stale confirmation for a
since-replaced recap.

- [x] **Service** ([`entities.ts`](../src/server/services/entities.ts)):
      `buildBroadcastCreatePatch(userId, campaignId, { type, name,
      description, tags? })` — a `CREATE_ENTITY` patch builder like
      `buildStubCreatePatch`/`buildContentCreatePatch`, but `PLAYER_VISIBLE`
      instead of `DM_ONLY`.
- [x] **Service** ([`sessions.ts`](../src/server/services/sessions.ts)):
      `publishSessionRecap(userId, campaignId, sessionId, { title, recap })` —
      DM-only, rejects a blank title/recap or an unknown session, files an
      auto-approved DM `CREATE_ENTITY` change set for a `SYSTEM_MESSAGE`
      (`PLAYER_VISIBLE`, `tags: ["recap"]`) via `buildBroadcastCreatePatch`.
- [x] **Validation** ([`validation.ts`](../src/lib/validation.ts)):
      `publishSessionRecapSchema` (`title` ≤200 chars, `recap` ≤4000 chars,
      both required).
- [x] **DM action** ([`(dm)/actions.ts`](<../src/app/(dm)/actions.ts>)):
      `publishSessionRecapAction` — parses the form, calls the service,
      revalidates the session page (unlike the read-only
      `generateSessionRecapAction`, this one writes canon), returns the new
      entity id so the panel can link to it.
- [x] **UI** ([`session-recap-panel.tsx`](../src/components/sessions/session-recap-panel.tsx)):
      a `PublishRecapForm` under the shown recap — a collapsed "Publish to
      players" button expands to a headline field (prefilled
      `Previously on Dungeon Crawler World: <session title>`, editable) with
      the recap text carried as a hidden field; on success it swaps to a
      static "Published to players · view message" link to the new entity's
      World Browser detail page.
- [x] **Tests:** DB-backed `publishSessionRecap` cases (creates a
      CANON/`PLAYER_VISIBLE`/`source: DM` `SYSTEM_MESSAGE` with the given
      title/recap and a `recap` tag; rejects a blank title, blank recap, an
      unknown session, and a player caller) in
      [`sessions.test.ts`](../tests/unit/sessions.test.ts); schema cases in
      [`validation.test.ts`](../tests/unit/validation.test.ts); the action in
      [`dm-actions.test.ts`](../tests/unit/dm-actions.test.ts) (publishes +
      revalidates + returns the entity id, rejects invalid input without
      calling the service, safe error + generic fallback); component coverage
      in
      [`session-recap-panel.test.tsx`](../tests/unit/session-recap-panel.test.tsx)
      (collapsed affordance appears once a recap is shown, expands with the
      recap carried as a hidden field, renders the confirmation link once the
      action returns an entity id); updated
      [`session-detail-page.test.tsx`](../tests/unit/session-detail-page.test.tsx)
      for the new action mock.
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors;
      pre-existing settings-action warnings only), `npm run build` (routes
      unchanged, no new route), and the full coverage gate green (159 files /
      **2019 tests**; statements 95.42%, branches 88.77%, functions 96.52%,
      lines 96.94%). **In-browser** (reseeded `dcc`, `dm@example.com`, a fresh
      "Floor 9 Breach" session with one log entry): "Generate recap" hit the
      same no-provider safe error slice 4 stopped at (no AI key configured in
      this campaign), so the direct write path was verified instead —
      calling `publishSessionRecap` for the session produced a
      `CANON`/`PLAYER_VISIBLE`/`source: DM` `SYSTEM_MESSAGE` entity tagged
      `recap`, confirmed both on its own World Browser detail page (visibility
      toggle showing "player visible", `RECAP` tag, `DM` provenance origin)
      and — scoped through a `player@example.com` membership added for the
      check — in `getSystemMessageFeed`'s output, proving the publish path
      lands somewhere a player's System-message feed actually reads from. No
      console errors. The panel's own generate → publish click-through (title
      prefill, hidden recap field, collapse-to-link) is covered by
      `session-recap-panel.test.tsx`'s mocked-state tests, the same boundary
      slice 4's AI-gated verification stopped at.

## M8 — Session recap generation (slice 4) ✅ (2026-08-13)

**Goal:** the fourth M8 slice — the "Session recap" bullet of
[`08-session-mode.md`](./08-session-mode.md)'s "Recaps & broadcasts": "generate
a 'previously on Dungeon Crawler World' summary from the session log + the
events promoted that session." This is DCC-flavored narration over material
the DM already captured, not new capability over canon.

**Decision (ephemeral read-only synthesis, modeled directly on "Ask the
Campaign" — not a change set, not persisted).** Docs/08 is explicit that
"a DM can keep [recaps] ephemeral, publish them to players … or both," so this
slice ships the ephemeral half only: `generateSessionRecap` never writes canon
(invariant #1) and is never stored — the DM regenerates on demand, exactly
like `askCampaign` (M5 slice 5). It takes no user text input (unlike "Ask"),
so `generateSessionRecapAction`/`SessionRecapPanel` drop the question
field/textarea entirely — a session detail page already knows its own
`sessionId`, so the whole UI is a single "Generate recap" button. Context is
built from two sources per the doc: the session's full raw log (chronological,
with each entry's still-live tagged entity names) and the events that session
promoted to canon (title + summary + `ACTOR` participant names, refetched live
rather than trusted from the log so a since-edited or since-archived promoted
event can't leak stale/removed text into the prompt). A new
`src/server/ai/generators/session-recap.ts` (pure prompt-building, mirroring
`ask-campaign.ts`) frames the system prompt in the show's "previously on…"
promo voice while forbidding invented details; usage is recorded under
generator id `session-recap` on the `AiUsage` table for cost tracking, the
same non-canon usage-only trail "Ask" already established (no
review-pipeline provenance, since there's no change set to attach it to).
Persona voice (the doc's separate "In-fiction broadcast" bullet), a
per-crawler spotlight recap, and publishing a recap as a player-facing
`SYSTEM_MESSAGE` through the review pipeline are explicitly deferred to later
M8 slices — each is its own vertical slice of new capability, unlike this
one's synthesis-only scope.

- [x] **Schema:** none — ephemeral, nothing persisted.
- [x] **Generator** ([`session-recap.ts`](../src/server/ai/generators/session-recap.ts)):
      `SESSION_RECAP_GENERATOR` id/version, `SESSION_RECAP_MAX_TOKENS` (768 —
      a tight TV-recap read, not a full transcript), and pure
      `buildSessionRecapPrompt` (cacheable framing + style guide; volatile
      per-session log/promoted-events content).
- [x] **Service** ([`sessions.ts`](../src/server/services/sessions.ts)):
      `generateSessionRecap(userId, campaignId, sessionId)` — DM-only, loads
      the session's entries (with tagged names resolved the same way
      `getSession` does) and its live promoted `Event` rows, requires a
      configured provider and available spend cap, calls `provider.generate`
      (plain text, not structured — there's no proposal shape to validate
      against), records usage best-effort, and returns the trimmed recap +
      model. Rejects an empty session (no log entries at all), an unknown
      session, a non-DM caller, no provider, a reached spend cap, a provider
      failure (safe message — invariant #6), and an empty model response.
- [x] **DM action** ([`(dm)/actions.ts`](<../src/app/(dm)/actions.ts>)):
      `generateSessionRecapAction` — no form fields to parse; calls the
      service and returns `{ recap, model }` or a safe error. No
      `revalidatePath` (read-only, mirrors `askCampaignAction`).
- [x] **UI** ([`session-recap-panel.tsx`](../src/components/sessions/session-recap-panel.tsx)):
      a `SessionRecapPanel` — a single "Generate recap" button (no inputs),
      an honest empty-state note before the first generation, the rendered
      recap + model tag on success (styled like Ask's answer panel), and a
      safe error message on failure. Rendered on the session detail page
      between the log and the Live Reveal panel.
- [x] **Tests:** DB-backed `generateSessionRecap` cases (generates from the raw
      log and records an `AiUsage` row; folds in promoted-event titles/
      participants alongside the raw log; rejects an empty session, an unknown
      session, a player caller, no configured provider, an empty model
      response; turns a provider failure into a safe `ServiceError` that never
      echoes the raw error text) in
      [`sessions.test.ts`](../tests/unit/sessions.test.ts) (provider mocked,
      mirroring `ask.test.ts`); the action in
      [`dm-actions.test.ts`](../tests/unit/dm-actions.test.ts) (passes through
      the recap/model, no revalidate, safe error + generic fallback);
      component coverage in
      [`session-recap-panel.test.tsx`](../tests/unit/session-recap-panel.test.tsx)
      (button + empty note, rendered recap + model, error state); updated
      [`session-detail-page.test.tsx`](../tests/unit/session-detail-page.test.tsx)
      for the new action mock and panel render.
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors;
      pre-existing settings-action warnings only), `npm run build` (no new
      route — the existing `/campaigns/[id]/sessions/[sessionId]` route is
      unchanged), and the full coverage gate green (159 files / **2006
      tests**; statements 95.42%, branches 88.81%, functions 96.6%, lines
      96.95%). **In-browser** (reseeded `dcc`, `dm@example.com`, a fresh
      "Floor 9 Breach" session): with no AI key configured, clicking "Generate
      recap" on a session with one log entry showed "Add an AI provider key in
      Settings to generate a session recap." with no provider call; after
      saving a placeholder Anthropic key in Settings, the same click showed
      "The provider rejected the key (authentication failed)." — the same
      safe-failure boundary the Ask/dungeon-content verifications stopped at,
      confirming the button → action → service → provider → UI wiring end to
      end with no raw key/provider text in the DOM (invariant #6). A second,
      empty session showed "Add a log entry before generating a recap." on
      click, with no provider call. No console errors throughout.

## M8 — Live reveal (slice 3) ✅ (2026-08-04)

**Goal:** the third M8 slice — let the DM **reveal** something at the table
right now, per [`08-session-mode.md`](./08-session-mode.md)'s "Live reveal":
"the DM can reveal an entity or fact either broadly or to specific
recipients … a broad reveal updates the campaign-wide visibility … a private
reveal creates `KnowledgeGrant` rows … without making the fact visible to
everyone." This is the write-side half of M3's fog-of-war foundation
(`KnowledgeGrant`, `Visibility`) finally getting a live-session entry point;
the player-facing "known world" reader that consumes these grants stays
tracked as open backlog (unchanged from before this slice — see "Knowledge /
reveal grants" below).

**Decision (a narrow visibility-flip function, not the full entity-edit form;
`sourceEventId` doubles as the session link).** `updateEntity`'s patch-building
diffs *every* core/kind field unconditionally — feeding it just a `visibility`
value would silently wipe the other 10+ fields, since omitted form fields
default to null/false rather than "leave alone." So broad reveal gets its own
`revealEntityBroadly`, modeled directly on `archiveEntity`/`restoreEntity`: a
two-key `ReviewPatch` (`_baseVersion` + `visibility`) through the existing
`applyAutoApprovedEntityChangeSet` — the underlying `UPDATE_ENTITY` apply path
was already a true partial patch (every field gated behind `"<field>" in
patch"`), so this needed no change below `entities.ts`. It's a no-op (not an
error) when the entity is already `PLAYER_VISIBLE`, so re-revealing is always
safe. Private reveal reuses `KnowledgeGrant`'s already-designed-for-this
`sourceEventId` column (the schema comment already called it "optional
event/session context") to link a grant back to the `GameSession` it was made
in — a plain string, not FK-checked, matching `targetId`/`recipientId`'s
existing polymorphic pattern. `grantEntityKnowledge` gained an optional
`sourceEventId` param (backward compatible); the new sibling
`grantMembershipKnowledge` is the `MEMBERSHIP`-recipient counterpart the M3
schema always supported but never had a writer for — kept as a separate
function rather than widening `grantEntityKnowledge` further, since a
membership recipient has a different existence check (a live `Role.PLAYER`
membership, not a live-canon entity) and no natural counterpart-entity id for
the existing ENTITY→ENTITY dedup/audit shape. `listSessionReveals` is a new
DM-facing read projecting both recipient kinds for one session, dropping a
grant whose target/entity-recipient is no longer live canon or whose
membership was removed (same belt-and-suspenders precedent as
`listKnowledgeOfEntity`).

- [x] **Schema:** none — `KnowledgeRecipientType.MEMBERSHIP` and
      `KnowledgeGrant.sourceEventId` already existed from M3; this slice is
      the first writer/reader for both.
- [x] **Service** ([`entities.ts`](../src/server/services/entities.ts)):
      `revealEntityBroadly(userId, campaignId, entityId)` — DM-only, flips
      `DM_ONLY → PLAYER_VISIBLE` through an audited auto-approved change set;
      a no-op (`alreadyVisible: true`) when already player-visible; respects
      field locks and staleness like any other `UPDATE_ENTITY` patch.
- [x] **Service** ([`knowledge.ts`](../src/server/services/knowledge.ts)):
      `grantEntityKnowledge` gained an optional `sourceEventId`;
      `grantMembershipKnowledge(userId, campaignId, { targetEntityId,
      membershipId, notes?, sourceEventId? })` — DM-only, the target must be
      live canon and the membership a live `Role.PLAYER` in the campaign,
      idempotent (identical active grant is a no-op), writes a `REVEAL`
      `AuditLog` row; `listSessionReveals(userId, campaignId, sessionId)`
      projects active `sourceEventId`-matched grants (both recipient kinds) to
      `SessionRevealView[]`, DM-only (`[]` for a player/non-member).
- [x] **Validation** ([`validation.ts`](../src/lib/validation.ts)):
      `revealEntityBroadlySchema` (one `entityId` field) and
      `sessionRevealSchema` — a `recipientKind`-discriminated union so an
      `ENTITY` recipient requires `recipientEntityId` and a `MEMBERSHIP`
      recipient requires `membershipId`, both sharing `targetEntityId` +
      optional `notes`.
- [x] **DM actions** ([`(dm)/actions.ts`](<../src/app/(dm)/actions.ts>)):
      `revealEntityBroadlyAction`, `revealSessionKnowledgeAction` (dispatches
      to `grantEntityKnowledge`/`grantMembershipKnowledge` by recipient kind,
      stamping `sourceEventId: sessionId`), `revokeSessionRevealAction` — a new
      `RevealActionState` (`{error?, success?, timestamp?}`) since neither
      reveal action has its own persistent confirmation surface, unlike the
      entity-console knowledge panel's list-refresh-only convention.
- [x] **UI** ([`session-reveal-panel.tsx`](../src/components/sessions/session-reveal-panel.tsx)):
      a `SessionRevealPanel` on the session detail screen — a broad-reveal
      mini-form (entity typeahead + submit), a private-reveal mini-form
      (target entity typeahead + a Player/Entity recipient-kind toggle +
      either a player `<select>` sourced from `listPlayerMemberships` or a
      recipient entity typeahead + notes), and a "Revealed this session"
      history list (target → recipient, notes, a revoke button) reading
      `listSessionReveals`. The recipient-kind toggle defaults to Player when
      the campaign has players, else Entity.
- [x] **Page** ([`sessions/[sessionId]/page.tsx`](<../src/app/(dm)/campaigns/[id]/sessions/[sessionId]/page.tsx>)):
      fetches `listPlayerMemberships` + `listSessionReveals` alongside the
      existing session/candidate fetches and renders `SessionRevealPanel`
      below the log.
- [x] **Tests:** DB-backed `revealEntityBroadly` cases (flips visibility with
      provenance, no-op when already visible, blocked by a `visibility` lock,
      denies a player, missing entity) in
      [`entities.test.ts`](../tests/unit/entities.test.ts);
      `grantMembershipKnowledge`/`listSessionReveals` cases (reveal + audit,
      idempotent, blank ids, non-canon target, foreign/non-player membership,
      player-caller denial, both recipient kinds newest-first, dropped
      archived/removed counterparts, `[]` for player/non-member) in
      [`knowledge.test.ts`](../tests/unit/knowledge.test.ts); schema cases in
      [`validation.test.ts`](../tests/unit/validation.test.ts); the three new
      actions in [`dm-actions.test.ts`](../tests/unit/dm-actions.test.ts);
      component coverage in
      [`session-reveal-panel.test.tsx`](../tests/unit/session-reveal-panel.test.tsx)
      (both forms, history rendering incl. a MEMBERSHIP row, submit-button
      gating, recipient-kind toggle, revoke); updated
      [`session-detail-page.test.tsx`](../tests/unit/session-detail-page.test.tsx)
      for the new fetches/panel.
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors;
      pre-existing settings-action warnings only), `npm run build` (routes
      unchanged, no new route), and the full coverage gate green (158 files /
      **1993 tests**; statements 95.43%, branches 88.84%, functions 96.58%,
      lines 96.94%). **In-browser** (reseeded `dcc` + `seed-world.ts` + a
      scratch script adding a `player@example.com` PLAYER membership to Demo
      Campaign): started a session "Floor 9 Breach"; broadly revealing an
      already-`PLAYER_VISIBLE` entity showed "Already visible to all
      players." with no DB write, and broadly revealing the `DM_ONLY` "Skull
      Empire" showed "Revealed to all players." and flipped its stored
      `visibility` to `PLAYER_VISIBLE` (DB-confirmed); privately revealing
      "The Grull Legion" to the player with a note showed "Revealed." and
      added a "The Grull Legion → Test Player" row (with the note) under
      "Revealed this session · 1"; clicking its revoke button dropped the
      count back to 0 with the empty-state note. No console errors throughout.

## M8 — Promote a log entry to a canonical Event (slice 2) ✅ (2026-08-04)

**Goal:** the second M8 slice — let the DM turn a scratch session log entry into
a canonical `Event`, per [`08-session-mode.md`](./08-session-mode.md): "the DM
turns a log entry (or several) into a canonical Event … through the normal
review pipeline — `source: DM`, auto-approved but fully provenanced." This is
the bridge from slice 1's capture-only log to canon; causal links and effects
stay a DM follow-up on the Timeline (unchanged from how event editing already
works), not part of this slice.

**Decision (title-only promote form; text → summary, tags → participants,
server-side).** A full event-creation form (participants picker, time-anchor
fields, effects rows) would fight the "capture fast, reconcile later"
philosophy the whole session-log feature is built on. Instead
`promoteSessionLogEntryToEvent` derives everything it can: the entry's own
`text` becomes the Event's `summary` verbatim (no retyping), and its still-live
tagged entities (already resolved once at log time) become `ACTOR`
participants — a tag that's since gone non-canon is silently dropped, same
policy as `getSession`'s own tag resolution. The DM supplies only a `title`
(prefilled client-side from the entry's first line, editable before
submitting). The created Event carries no in-game-time anchor
(`UNSCHEDULED`) and no effects; the DM adds those afterward from the Timeline
like any other event — reusing `createEvent`'s existing auto-approved DM
change set means the promoted Event gets full provenance for free, and an
entry's `promotedEventId` is a one-way pointer (rejects re-promoting).
`SessionLogList` stays a Server Component; only the small per-entry promote
affordance (`PromoteEntryForm`) is a client island, and it relies on the
existing `revalidatePath`-driven refresh (same pattern as the log composer) to
swap itself for a static "Promoted → view event" Timeline deep-link
(`?event=<id>`, the same query param the Timeline already supports for
causality-navigation deep-links) once the parent page's server data reflects
the promotion — no local "just promoted" state to manage.

- [x] **Validation** ([`validation.ts`](../src/lib/validation.ts)):
      `promoteSessionLogEntrySchema` (title required, ≤200 chars — the only
      field the form exposes).
- [x] **Service** ([`sessions.ts`](../src/server/services/sessions.ts)):
      `promoteSessionLogEntryToEvent(userId, campaignId, sessionId, entryId,
      { title })` — DM-only, rejects an unknown entry or one already promoted,
      filters tagged ids down to still-live-CANON entities before building
      `ACTOR` participants, calls the existing `createEvent` (auto-approved DM
      change set, `source: DM`), then stamps the entry's `promotedEventId`.
- [x] **DM action** ([`(dm)/actions.ts`](<../src/app/(dm)/actions.ts>)):
      `promoteSessionLogEntryAction` — validates, calls the service,
      revalidates both the session page and the Timeline.
- [x] **UI** ([`promote-entry-form.tsx`](../src/components/sessions/promote-entry-form.tsx),
      [`session-log-list.tsx`](../src/components/sessions/session-log-list.tsx)):
      a collapsed "Promote to event" button per unpromoted entry that expands
      to a one-field title form (prefilled from the entry's first line, capped
      at 80 chars for the default); a promoted entry instead renders a static
      "Promoted → view event" link to `/campaigns/[id]/timeline?event=<id>`.
- [x] **Tests:** DB-backed `promoteSessionLogEntryToEvent` cases in
      [`sessions.test.ts`](../tests/unit/sessions.test.ts) (creates the Event
      with the entry's text as summary + live tagged entities as ACTOR
      participants; empty participants when untagged; drops a since-archived
      tag; rejects a double-promote, an empty title, an unknown entry, and a
      player caller); schema cases in
      [`validation.test.ts`](../tests/unit/validation.test.ts); the action in
      [`dm-actions.test.ts`](../tests/unit/dm-actions.test.ts); component
      coverage in
      [`promote-entry-form.test.tsx`](../tests/unit/promote-entry-form.test.tsx)
      (collapsed → expanded, prefilled/edited title submission, returned-error
      handling, cancel) and updated
      [`session-log-list.test.tsx`](../tests/unit/session-log-list.test.tsx)
      (promote affordance vs. promoted-link rendering); updated
      [`session-detail-page.test.tsx`](../tests/unit/session-detail-page.test.tsx)
      for the new action import.
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors;
      pre-existing settings-action warnings only), `npm run build` (routes
      unchanged, no new route), and the full coverage gate green (157 files /
      **1958 tests**; statements 95.44%, branches 88.94%, functions 96.53%,
      lines 96.97%). **In-browser** (reseeded `dcc`, re-signed-in as
      `dm@example.com` after the reseed to pick up a fresh JWT — the prior
      session's user id had gone stale and briefly 500'd a campaign-create
      attempt, per the known reseed-then-relogin gotcha; created a scratch
      "Demo Campaign" NPC "Carl" and a session): logging "Carl insulted the
      Maestro on air during the Floor 9 breach" tagged to Carl showed a
      "Promote to event" button; clicking it expanded a title field prefilled
      with the entry's full text (under 80 chars) which was edited to "Maestro
      on-air incident" and submitted; the row flipped to "Promoted → view
      event" (green) with no page reload; following the link landed on the
      Timeline with the new Event highlighted — title "Maestro on-air
      incident", the entry's text as its summary, a `DM` provenance badge, and
      Carl listed as the sole `ACTOR` participant. No console errors.

## M8 — Live session capture (slice 1) ✅ (2026-08-04)

**Goal:** the first M8 slice — a DM starting a play session and jotting a
running, timestamped log during the game, per
[`08-session-mode.md`](./08-session-mode.md)'s "capture" workflow: quick,
freeform entries the DM can optionally tag to existing entities, kept as
scratch (never canon) until a later slice promotes them. This is the
foundation the rest of M8 (promote-to-Event, live reveal, recaps) builds on.

**Decision (direct DM mutation, like `KnowledgeGrant` — not the review
pipeline; entity tags picked, not `@`/`#` parsed).** A session and its log
entries are explicitly *not* canon (docs/08: "Capture is not canon"), so
`createSession`/`addSessionLogEntry` are DM-only direct mutations mirroring
`knowledge.ts`'s pattern — invariant #1 governs canon writes, and this isn't
one. The schema names the model `GameSession` rather than docs' `Session` to
avoid colliding with NextAuth's own `Session` model already in
`schema.prisma`; `docs/09-data-schema.md` is updated to match. docs/08
describes entries "optionally tagged to existing entities (`@Carl`,
`#Floor7`)"; rather than parse `@`/`#` mentions out of freeform text — fragile
for multi-word entity names, and this repo has no existing mention-parsing
infra — the DM picks entities from the same search-as-you-type
`EntityTypeahead` used elsewhere, building a chip list that submits as
repeated `taggedIds` form values. No dedicated `screen-*` mockup exists for
Sessions, so the UI is built from the console screen-shell primitives
(`ConsoleScreen`/`ScreenHeader`) per AGENTS.md, matching the Jobs/Settings
pattern.

- [x] **Schema** ([`schema.prisma`](../prisma/schema.prisma), migration
      `20260804171928_m8_session_capture`): additive `GameSession` (title,
      `playedAt`, `focus`, `notes`, `campaignId` cascade) and `SessionLogEntry`
      (`sessionId` cascade, `at`, `text`, `taggedIds: String[]`,
      `promotedEventId` — unused until the promote slice).
- [x] **Service** ([`sessions.ts`](../src/server/services/sessions.ts)):
      DM-only `createSession`, `listSessions` (newest-played-first, with a
      per-session entry count), `getSession` (entries oldest-first, tagged ids
      resolved to live `{id, name, type}` refs in one bulk lookup), and
      `addSessionLogEntry` (silently drops any tagged id that isn't a real
      entity in the campaign, so a stale/foreign id can never render as a
      broken link).
- [x] **Validation** ([`validation.ts`](../src/lib/validation.ts)):
      `createSessionSchema` (title required; `playedAt`/`focus`/`notes`
      optional, `playedAt` validated as a parseable date string) and
      `addSessionLogEntrySchema` (text required, ≤2000 chars; `taggedIds`
      optional, capped at 20).
- [x] **DM actions** ([`(dm)/actions.ts`](<../src/app/(dm)/actions.ts>)):
      `createSessionAction` (validates, creates, redirects to the new
      session's log) and `addSessionLogEntryAction` (validates, appends,
      revalidates the session page).
- [x] **UI** ([`create-session-form.tsx`](../src/components/sessions/create-session-form.tsx),
      [`session-list.tsx`](../src/components/sessions/session-list.tsx),
      [`session-log-composer.tsx`](../src/components/sessions/session-log-composer.tsx),
      [`session-tag-picker.tsx`](../src/components/sessions/session-tag-picker.tsx),
      [`session-log-list.tsx`](../src/components/sessions/session-log-list.tsx),
      [`sessions/page.tsx`](<../src/app/(dm)/campaigns/[id]/sessions/page.tsx>),
      [`sessions/[sessionId]/page.tsx`](<../src/app/(dm)/campaigns/[id]/sessions/[sessionId]/page.tsx>)):
      a Sessions index (create form + list) and a session detail screen (log
      composer + the running log, oldest-first like a transcript). The
      composer keeps its textarea controlled (not left to React 19's
      automatic uncontrolled-field reset on any completed form action) so a
      rejected submit never silently drops the DM's typed entry; a successful
      submit clears the text and remounts the tag picker.
- [x] **Nav** ([`dm-nav.tsx`](../src/components/console/dm-nav.tsx)): a new,
      live **Sessions** item (`NotebookPen`) between Timeline and Settings.
- [x] **Docs:** [`09-data-schema.md`](./09-data-schema.md)'s `Session` model
      renamed to `GameSession` with an explanatory note, matching the schema.
- [x] **Tests:** DB-backed service cases in
      [`sessions.test.ts`](../tests/unit/sessions.test.ts) (create/list/log/read,
      permission checks, foreign/unknown tagged ids dropped, unknown session
      rejected); schema cases in
      [`validation.test.ts`](../tests/unit/validation.test.ts); the two new DM
      actions in [`dm-actions.test.ts`](../tests/unit/dm-actions.test.ts);
      component coverage in
      [`create-session-form.test.tsx`](../tests/unit/create-session-form.test.tsx),
      [`session-list.test.tsx`](../tests/unit/session-list.test.tsx),
      [`session-log-list.test.tsx`](../tests/unit/session-log-list.test.tsx),
      [`session-tag-picker.test.tsx`](../tests/unit/session-tag-picker.test.tsx),
      and [`session-log-composer.test.tsx`](../tests/unit/session-log-composer.test.tsx);
      page tests in
      [`sessions-page.test.tsx`](../tests/unit/sessions-page.test.tsx) and
      [`session-detail-page.test.tsx`](../tests/unit/session-detail-page.test.tsx)
      (both DM-only role gates, 404s).
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors; only
      pre-existing unrelated warnings), `npm run build` (the two
      `/campaigns/[id]/sessions` routes register), and the full coverage gate
      green (156 files / **1939 tests**; statements 95.43%, branches 88.95%,
      functions 96.52%, lines 97.02%). **In-browser** (reseeded `dcc`,
      `dm@example.com`) caught and fixed a real bug: `playedAt` is parsed from
      a bare `<input type="date">` value as UTC midnight, so formatting it with
      the viewer's local timezone rolled the displayed date back a day in a
      negative-UTC-offset zone (Aug 4 showed as Aug 3). Fixed by rendering
      `playedAt` with `timeZone: "UTC"` in both `session-list.tsx` and the
      session detail page. After the fix: starting "Session 12: Floor 9
      Breach" (dated Aug 4, focus "Floor 9") showed the correct date on both
      the Sessions list and detail screens; typing in the tag picker found a
      real NPC ("Carl") and added it as a chip; submitting a log entry cleared
      the composer, remounted the tag picker (Carl became pickable again), and
      appended the entry with its timestamp and a "Carl · NPC" chip linking to
      `/campaigns/[id]/entities/[id]`; the Sessions list then showed "1 entry".
      No console errors throughout.

## M7 — Player Suggestions (slice 6) ✅ (2026-08-04)

**Goal:** the sixth and final M7 *player-UI* slice — let a player propose an edit
to their own crawler and close the milestone's "done when" bar ("a player logs in,
sees only shared/own-crawler data … and can submit a suggestion"). Per
[`10-ui-ux.md`](./10-ui-ux.md): "a player can propose edits (e.g. bio, notes);
these enter the review pipeline as `PLAYER_SUGGESTION`, never write canon
directly." `ChangeSource.PLAYER_SUGGESTION` and the DM-side Review Queue
PLAYER filter/badge already existed (since M2) — this slice is the missing
player-authored submission path, not new review machinery.

**Decision (a narrow, allowlisted sibling to `createPendingEntityChangeSet`, not
a reuse of it).** Every existing change-set-creation entrypoint in `review.ts`
requires a DM/co-DM membership (`assertCampaignDm`), so a `Role.PLAYER` caller
can't reach `createPendingEntityChangeSet` directly — and even if it could, that
function trusts the caller's own `operations` array verbatim, which would let a
"suggestion" carry any field (`visibility`, `status`, `data.*`, …), not just the
bio/notes the surface is meant to expose. `createPlayerSuggestion` is a new,
narrow function instead: it asserts `Role.PLAYER`, resolves the caller's own
linked live-CANON crawler (the same read/write grant `getMyCrawlerSheet` uses),
and builds the patch itself from a hardcoded `summary`/`description` allowlist —
so a player can never target another entity or another field, no matter what a
compromised client sends. It reuses the shared `evaluateEntityOperationFlags`
for lock/staleness flagging and always files `source: PLAYER_SUGGESTION`,
`status: PENDING` — identical downstream handling to AI/import proposals
(invariant #1: players never write canon directly). A companion
`listMySuggestions` (scoped by `actorUserId`, no separate membership check
needed) lets the player see their own submission history so submitting isn't a
black hole. ADR 0012 already commits M10 to reusing this same `PLAYER_SUGGESTION`
provenance value for non-admin-DM library edits — `createPlayerSuggestion`'s
strict `Role.PLAYER` gate is this slice's concern only; M10 will add its own
entrypoint for that actor, not repurpose this one.

- [x] **Service** ([`review.ts`](../src/server/services/review.ts)):
      `createPlayerSuggestion(userId, campaignId, { summary?, description? })` —
      PLAYER-only, own-crawler-only, allowlisted-fields-only, PENDING
      `PLAYER_SUGGESTION` `UPDATE_ENTITY` change set; rejects a no-op patch and a
      caller with no crawler linked. `listMySuggestions(userId, campaignId)`
      returns the caller's own suggestion history (title/status/reviewedAt/
      reviewNotes), newest first. `crawlers.ts`'s `CrawlerSheet` (and
      `getMyCrawlerSheet`) gained `description` (previously summary-only) so the
      submit form can prefill both fields.
- [x] **Validation** ([`validation.ts`](../src/lib/validation.ts)):
      `playerSuggestionSchema` (`summary`/`description`, both optional, same
      length caps as `entityCoreSchema`).
- [x] **Player action** ([`(player)/actions.ts`](<../src/app/(player)/actions.ts>)):
      `submitSuggestionAction` — parses the form, calls `createPlayerSuggestion`,
      revalidates the suggestions page on success (unlike the read-only
      `askCampaignAction`, this one writes).
- [x] **Player UI** ([`suggestion-form.tsx`](../src/components/crawler/suggestion-form.tsx),
      [`suggestion-list.tsx`](../src/components/crawler/suggestion-list.tsx),
      [`suggestions/page.tsx`](<../src/app/(player)/play/campaigns/[id]/suggestions/page.tsx>)):
      a `SuggestionForm` (Bio/Notes textareas prefilled from the crawler's
      current values, route-agnostic like `AskPanel` — takes a bound action
      prop) and a read-only `SuggestionList` history panel (status chip +
      review notes when resolved); the new `/play/campaigns/[id]/suggestions`
      page follows the Crawler Sheet's own-crawler gate (a "no crawler linked
      yet" empty state when unset).
- [x] **Nav** ([`player-nav.tsx`](../src/components/console/player-nav.tsx)): the
      **Suggestions** item is now a built link (was Planned) →
      `/play/campaigns/[id]/suggestions` — every M7 player crawler-interface nav
      item is now built.
- [x] **Tests:** DB-backed `createPlayerSuggestion`/`listMySuggestions` cases in
      [`review.test.ts`](../tests/unit/review.test.ts) (files the PENDING
      `PLAYER_SUGGESTION` set with the correct patch/target; rejects a
      non-player, an unlinked player, and a no-op suggestion; flags
      `blockedByLock` on a locked field; scopes history to the caller); schema
      cases in [`validation.test.ts`](../tests/unit/validation.test.ts); component
      coverage in
      [`suggestion-form.test.tsx`](../tests/unit/suggestion-form.test.tsx) and
      [`suggestion-list.test.tsx`](../tests/unit/suggestion-list.test.tsx); the
      page in
      [`player-suggestions-page.test.tsx`](../tests/unit/player-suggestions-page.test.tsx)
      (404, empty state, prefilled form, history render); the action in
      [`player-actions.test.ts`](../tests/unit/player-actions.test.ts); updated
      [`player-nav.test.tsx`](../tests/unit/player-nav.test.tsx) for the
      newly-built item (no Planned items remain) and the `CrawlerSheet`-shape
      fixtures touched by the new `description` field in
      [`crawler-sheet.test.tsx`](../tests/unit/crawler-sheet.test.tsx) and
      [`player-crawler-sheet-page.test.tsx`](../tests/unit/player-crawler-sheet-page.test.tsx).
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors;
      pre-existing settings-action warnings only), `npm run build` (the
      `/play/campaigns/[id]/suggestions` route registers), and the full coverage
      gate green (148 files / **1893 tests**; statements 95.4%, branches 88.93%,
      functions 96.52%, lines 96.97%). **In-browser** (reseeded `dcc` + a scratch
      script linking `player@example.com` to a CANON "Carl" crawler with a bio and
      notes): as the player, `/play/campaigns/[id]/suggestions` showed the Bio/
      Notes form prefilled from Carl's real summary/description and an empty
      "you haven't submitted a suggestion yet" history; editing the bio and
      submitting showed a success message and the new suggestion listed as
      "Pending review." As the DM, the Review Queue's `ALL` tab (and the
      `PLAYER` filter link) showed "Suggestion for Carl" with the `PLR` badge,
      the pre-existing diff editor rendering the struck-through old bio → new
      bio; accepting the field and approving the set showed "Committed to
      canon." No console errors on either side.

## M7 — Player "Ask the System" (slice 5) ✅ (2026-08-04)

**Goal:** the fifth M7 *player-UI* slice — give the player crawler interface a
scoped **"Ask the System"**: the same read-only, retrieval-augmented Q&A the DM's
"Ask the Campaign" shipped in M5 slice 5, now reachable from the player console.
No schema change and, notably, **no new visibility logic** — `askCampaign`
(`src/server/services/ask.ts`) already checks only membership (any role) and
retrieves via `searchCanon`, which is role-scoped for `PLAYER` the same way every
other player read is (invariant #5). The M5 slice 5 test suite already proved a
player's ask can never retrieve DM-only canon; this slice is pure UI wiring plus a
player-side action.

**Decision (route-agnostic `AskPanel`; a player action file, not a shared one).**
The DM's `AskPanel` client component previously imported `askCampaignAction`
directly from `(dm)/actions.ts` and bound it to `campaignId` internally, which
would have meant either the player route importing the DM's action module (a
DM/player layering smell) or duplicating the whole panel. Instead `AskPanel` now
takes a pre-bound `action` prop (`(prevState, formData) => Promise<AskActionState>`),
so it has no opinion on which route renders it — the DM page passes
`askCampaignAction.bind(null, id)` from its own actions file, the new player page
passes the same shape from a new `(player)/actions.ts`. `AskActionState` moved from
`(dm)/actions.ts` to `ask.ts` (next to `AskResult`/`AskSource`) as the shared,
service-owned shape both action files and the panel import. The player's own
`askCampaignAction` in `(player)/actions.ts` is a thin wrapper calling the same
`askCampaign` service — kept in a separate file (not reused from `(dm)/actions.ts`)
so the two consoles' action surfaces stay independent, matching how their pages
already don't share code beyond services/components. A player has no Settings
access, so the no-provider state on the player page explains the DM hasn't
configured a key yet, with no "Configure AI in Settings" link (unlike the DM page).
- [x] **Service:** no change — `askCampaign` was already role-scoped (verified by
      the existing M5 "never lets a player's ask retrieve DM-only canon (invariant
      #5)" test in [`ask.test.ts`](../tests/unit/ask.test.ts)).
- [x] **Shared type + panel** ([`ask.ts`](../src/server/services/ask.ts),
      [`ask-panel.tsx`](../src/components/ask/ask-panel.tsx)): `AskActionState`
      moved to `ask.ts`; `AskPanel` takes an `action` prop instead of a
      `campaignId` + an internal DM-actions import/bind.
- [x] **DM page** ([`(dm)/campaigns/[id]/ask/page.tsx`](<../src/app/(dm)/campaigns/[id]/ask/page.tsx>)):
      now binds and passes `askCampaignAction` itself (`AskActionState` re-imported
      from `ask.ts`); behavior unchanged.
- [x] **Player action + page** ([`(player)/actions.ts`](<../src/app/(player)/actions.ts>),
      [`(player)/play/campaigns/[id]/ask/page.tsx`](<../src/app/(player)/play/campaigns/[id]/ask/page.tsx>)):
      a player-scoped `askCampaignAction` wrapping `askCampaign`; the new
      `ConsoleScreen` + `PlayerSystemBanner` page (mirrors the DM Ask page's copy
      and provider gating, minus the Settings link) 404s a non-member and renders
      the shared `AskPanel`.
- [x] **Nav** ([`player-nav.tsx`](../src/components/console/player-nav.tsx)): the
      **Ask the System** item is now a built link (was Planned) →
      `/play/campaigns/[id]/ask`, with an active-highlight match; only Suggestions
      remains Planned.
- [x] **Tests:** the `AskPanel` refactor's own coverage
      ([`ask-panel.test.tsx`](../tests/unit/ask-panel.test.tsx)) now injects a
      mock `action` prop directly (no more mocking `(dm)/actions`); the DM
      [`ask-page.test.tsx`](../tests/unit/ask-page.test.tsx) mocks `(dm)/actions`
      so its real dependency chain (auth composition, search/embeddings) never
      loads under Vitest, same pattern applied to the new
      [`player-ask-page.test.tsx`](../tests/unit/player-ask-page.test.tsx) (404,
      panel-when-configured, no-link no-provider notice) mocking `(player)/actions`;
      the player action itself in
      [`player-actions.test.ts`](../tests/unit/player-actions.test.ts) (passes the
      question, returns answer/sources, `ServiceError` + generic fallback); updated
      [`player-nav.test.tsx`](../tests/unit/player-nav.test.tsx) for the newly-built
      item.
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors; pre-existing
      settings-action warnings only), `npm run build` (the
      `/play/campaigns/[id]/ask` route registers), and the full coverage gate green
      (145 files / **1866 tests**; statements 95.38%, branches 88.92%, functions
      96.5%, lines 96.96%). **In-browser** (reseeded `dcc` + `scripts/seed-world.ts`
      + a scratch script adding a `player@example.com` PLAYER membership and a
      placeholder Anthropic key): as the player, "Ask the System" rendered with the
      panel (provider configured), and asking "Who is Princess Donut?" retrieved
      canon and called the provider, which failed to a safe "The provider rejected
      the key (authentication failed)" alert — no key/raw text in the DOM
      (invariant #6), the same boundary the DM Ask page verification stopped at. As
      the DM, `/campaigns/[id]/ask` still rendered and worked identically after the
      shared `AskPanel` refactor. No console errors on either side.

## M7 — Player System-message feed (slice 4) ✅ (2026-07-09)

**Goal:** the fourth M7 *player-UI* slice — give the player crawler interface the
**System-message feed**: THE SYSTEM's in-fiction broadcasts to the crawlers (rule
changes, announcements, floor warnings), the "System messages / notifications"
bullet on the player surface ([`10-ui-ux.md`](./10-ui-ux.md)). No schema change —
a System message is just a `SYSTEM_MESSAGE` entity, so the feed is a new read
projection over that type. This is invariant #5 made visible again: a player sees
only `PLAYER_VISIBLE`, live-CANON messages; DM-only and pending broadcasts never
leak.

**Decision (campaign-wide visibility-projected read, not crawler-scoped; no
invented "kind").** Unlike the crawler sheet/loadout (slices 2–3), the feed is not
scoped to the caller's crawler — every player sees the same broadcast feed the DM
has published. So `getSystemMessageFeed` is a plain visibility-projected entity
read (role → `PLAYER_VISIBLE` filter, plus a belt-and-suspenders `status: CANON`
gate like the Known World), ordered newest broadcast first by the entity's
`createdAt` (when the System issued it). The mockup's per-message kind badges
(ANNOUNCEMENT / ALERT / PERSONAL / PATCH NOTE) are **not** modeled on the
`SYSTEM_MESSAGE` entity, so — rather than ship a fake classification (AGENTS.md) —
each card renders the message's real content only (headline + optional summary +
Markdown body) under a neutral "System broadcast" label and its date. A tier/kind
`data.*` field is a plausible future follow-up.

- [x] **Service** ([`system-feed.ts`](../src/server/services/system-feed.ts)):
      new player-scoped `getSystemMessageFeed(userId, campaignId)` returning
      `SystemFeedMessage[]` (id / name / summary / description / tags /
      `broadcastAt`) — CANON `SYSTEM_MESSAGE` entities, `PLAYER_VISIBLE` for a
      PLAYER, newest first; `[]` for a non-member. `SystemFeedMessage` type
      exported for the UI.
- [x] **Player UI** ([`system-feed.tsx`](../src/components/crawler/system-feed.tsx),
      [`system/page.tsx`](<../src/app/(player)/play/campaigns/[id]/system/page.tsx>)):
      a `SystemFeed` component rendering each broadcast as a left-accent-bordered
      card (headline + summary + Markdown body + date), with a single honest empty
      state; the new `/play/campaigns/[id]/system` page (ConsoleScreen +
      `PlayerSystemBanner` "live broadcast feed") fetches campaign + feed in
      parallel and 404s a non-member.
- [x] **Nav** ([`player-nav.tsx`](../src/components/console/player-nav.tsx)): the
      **System Feed** item is now a built link (was Planned) → `/play/campaigns/[id]/system`,
      with an active-highlight match; only Ask the System + Suggestions remain Planned.
- [x] **Tests:** DB-backed `getSystemMessageFeed` cases in
      [`system-feed.test.ts`](../tests/unit/system-feed.test.ts) (newest-first
      player-visible read incl. summary/description/tags; DM-only + pending +
      archived + non-`SYSTEM_MESSAGE` hidden; non-member → `[]`; DM sees all CANON
      regardless of visibility); component coverage in
      [`system-feed-panel.test.tsx`](../tests/unit/system-feed-panel.test.tsx)
      (empty note, headline/summary/Markdown body, summary/body omitted when
      absent, render order); the page in
      [`player-system-feed-page.test.tsx`](../tests/unit/player-system-feed-page.test.tsx)
      (non-member 404, empty state, projected feed); updated
      [`player-nav.test.tsx`](../tests/unit/player-nav.test.tsx) for the newly-built item.
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors; pre-existing
      settings-action warnings only), `npm run build` (the
      `/play/campaigns/[id]/system` route registers), and the full coverage gate
      green (143 files / **1859 tests**; statements 95.37%, branches 88.96%,
      functions 96.49%, lines 96.96%; `system-feed.ts` fully covered). **In-browser**
      (reseeded `dcc` + a `player@example.com` PLAYER membership; four seeded System
      messages — two `PLAYER_VISIBLE` CANON, one `DM_ONLY`, one PENDING): the feed
      rendered only the two visible broadcasts newest-first ("Floor 9 will collapse"
      Jul 7 above "Welcome to the Dungeon" Jul 1), with Markdown emphasis/strong
      rendered and the DM-only + pending messages absent; no console errors.

## M7 — Crawler loadout: inventory / loot boxes / achievements / titles (slice 3) ✅ (2026-07-02)

**Goal:** the third M7 *player-UI* slice — give the player's read-only crawler
sheet the rest of their character's game state: **inventory** (items the crawler
owns), **loot boxes** (the reward chain), **achievements** earned, and **titles**
held. This realizes the milestone's "inventory/loot (supporting the `BOX` entity
type containing items, with achievements rewarding boxes), achievements/titles"
bullet on the player surface. No schema change — every relationship already
exists (`OWNS_ITEM`, `EARNED_ACHIEVEMENT`, `HOLDS_TITLE`, `GRANTS_BOX`,
`CONTAINS`); this is a new read projection over the crawler's own edges.

**Decision (own-crawler read grant extends to the crawler's direct game edges;
loot boxes are the earned-achievement reward chain).** Like the crawler sheet
(slice 2), the caller's crawler link is the read grant, so the loadout shows the
crawler's possessions/honors even when a linked item/achievement is a `DM_ONLY`
entity — it's the player's own character. The projection stays bounded exactly as
the sheet's: only the crawler on the caller's **own** membership, only when that
crawler is live `CANON`, and — new to the edge reads — only **non-secret** edges
(a `secret` edge is DM-held knowledge, e.g. a cursed item the crawler doesn't know
about, so it stays hidden even on one's own sheet, matching
`listConnectionsForEntity`'s player rule) to **live CANON** target entities (a
pending/archived item never leaks). **Loot boxes** are derived, not a direct
crawler edge: an earned achievement `GRANTS_BOX` a box, and a box `CONTAINS`
items, so a box surfaces when the crawler earned an achievement that grants it
(deduped across achievements; the first-earned achievement is credited). The read
is a bounded 4 queries (membership → crawler edges → achievement→box →
box→contents).

- [x] **Service** ([`crawlers.ts`](../src/server/services/crawlers.ts)):
      player-scoped `getMyCrawlerLoadout` returning `{ items, lootBoxes,
      achievements, titles }` for the caller's own live-CANON crawler (else null),
      with a shared `liveOutgoingEdges` helper (non-secret, non-archived, CANON
      target) walking the reward chain. Types `CrawlerLoadout` / `CrawlerLootBox`
      / `CrawlerLoadoutEntity` exported for the UI.
- [x] **Player UI** ([`crawler-loadout.tsx`](../src/components/crawler/crawler-loadout.tsx),
      [`sheet/page.tsx`](<../src/app/(player)/play/campaigns/[id]/sheet/page.tsx>)):
      a `CrawlerLoadoutPanel` rendered alongside the sheet — Inventory / Loot Boxes
      (each with its source achievement + contents) / Achievements / Titles, each
      section shown only when non-empty (no filler — AGENTS.md), entity rows carrying
      the `entityTypeColor` type dot, and a single honest note when the whole loadout
      is empty. The sheet page fetches sheet + loadout in parallel and lays them out
      side-by-side on wide screens.
- [x] **Tests:** DB-backed `getMyCrawlerLoadout` cases in
      [`crawlers.test.ts`](../tests/unit/crawlers.test.ts) (full inventory/title/
      achievement + reward-chain read; secret + non-CANON + archived edges hidden;
      non-member / unlinked / non-CANON crawler → null; box deduped across two
      granting achievements); component coverage in
      [`crawler-loadout.test.tsx`](../tests/unit/crawler-loadout.test.tsx) (empty
      note, only-populated-sections, loot box with source + contents); the sheet
      page now mocks + renders the loadout in
      [`player-crawler-sheet-page.test.tsx`](../tests/unit/player-crawler-sheet-page.test.tsx).
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors; pre-existing
      settings-action warnings only), `npm run build` (the `/play/campaigns/[id]/sheet`
      route registers), and the full coverage gate green (140 files / **1843 tests**;
      statements 95.35%, branches 88.91%, functions 96.47%, lines 96.95%;
      `crawlers.ts` 100% stmts/funcs/lines). **In-browser** (reseeded `dcc` + a
      `player@example.com` PLAYER membership linked to a DM_ONLY "Carl" crawler with
      2 owned items, a title, an achievement granting a "Gold Loot Box" that contains
      2 items): the player's Crawler Sheet rendered the stat panel plus all four
      loadout sections — Inventory (2), Loot Boxes (1, "from Goblin Slayer" + its two
      contents), Achievements (1), Titles (1) — with correct type-dot colors and no
      console errors.

## M7 — Player↔crawler link + crawler sheet (slice 2) ✅ (2026-07-01)

**Goal:** the second M7 *player-UI* slice — let a DM link a player to the CRAWLER
entity they control, and give that player a read-only **crawler sheet**
(HP/MP/stats/gold/floor/level/kills/status). This is the "sees only shared/**own-
crawler** data" half of the milestone's "done when" bar: a player may read *their
own* crawler's stats — even a `DM_ONLY` entity — because the link is itself the
read grant, while every other read still flows through the visibility projection
(invariant #5).

**Decision (link on `Membership`, not a graph edge; not canon).** The player↔
crawler association is *membership metadata* (who plays whom), not part of the
world graph, so it is a nullable `Membership.crawlerEntityId` FK to `Entity`
(`onDelete: SetNull`) set by a **direct** membership mutation — it mirrors role
assignment and does **not** route through the review pipeline (invariant #1 is
about *canon* writes; this isn't one). The same link is the player's read grant:
`getMyCrawlerSheet` returns **only** the crawler bound to the caller's *own*
membership, so it can't leak another player's crawler or any unlinked DM-only
canon. Inviting users / managing roles stays M9; this slice only assigns crawlers
to whatever PLAYER memberships already exist. The `Crawler.stats` JSON has no
write path yet (always `{}`), so the sheet renders the stat grid **only when
populated** — no filler (AGENTS.md). The mockup's HP/MP/stamina *bars* need a
max/stamina the data model doesn't carry, so vitals render as HUD stat readouts
instead; adding max/stamina fields is a future follow-up.

- [x] **Schema** ([`schema.prisma`](../prisma/schema.prisma), migration
      `20260701010933_m7_player_crawler_link`): additive nullable
      `Membership.crawlerEntityId` + `crawlerEntity`/`playerMemberships` relation
      (`PlayerCrawler`, `SetNull`) + an index (drift gate clean).
- [x] **Service** ([`crawlers.ts`](../src/server/services/crawlers.ts)): DM-only
      `listPlayerMemberships` (players + their linked crawler),
      `listAssignableCrawlers` (the campaign's CRAWLER entities), `setPlayerCrawler`
      (validates a PLAYER target + a CRAWLER-in-campaign, or null to unlink; not a
      canon write); player-scoped `getMyCrawlerSheet` (own-membership crawler only,
      gated on `status: CANON` so a PENDING/archived link never leaks non-canon to
      the player — invariant #5, belt-and-suspenders like the Known World;
      numeric-only stat filtering). The assignable-crawler picker excludes ARCHIVED
      tombstones but still allows linking a PENDING crawler ahead of approval.
- [x] **DM UI** ([`crawler-assignment-panel.tsx`](../src/components/settings/crawler-assignment-panel.tsx),
      [`settings/page.tsx`](<../src/app/(dm)/campaigns/[id]/settings/page.tsx>),
      [`settings-nav.tsx`](../src/components/settings/settings-nav.tsx),
      [`settings/actions.ts`](<../src/app/(dm)/campaigns/[id]/settings/actions.ts>)):
      the Settings **Crawlers** section (`?section=crawlers`) is now built — a
      per-player crawler `<select>` + Save (`setPlayerCrawlerAction`); the settings
      sub-nav's items became active links, with only "General" still Planned (M9).
- [x] **Player UI** ([`crawler-sheet.tsx`](../src/components/crawler/crawler-sheet.tsx),
      [`sheet/page.tsx`](<../src/app/(player)/play/campaigns/[id]/sheet/page.tsx>),
      [`player-nav.tsx`](../src/components/console/player-nav.tsx)): the **Crawler
      Sheet** nav item is now built (was Planned) → `/play/campaigns/[id]/sheet`,
      rendering the identity block + vitals + (conditional) stat grid + fame from
      real fields, with a "no crawler linked yet" empty state. Loot boxes / titles /
      suggestions stay later slices.
- [x] **Validation** ([`validation.ts`](../src/lib/validation.ts)):
      `setPlayerCrawlerSchema` (membershipId + crawlerEntityId, empty→null).
- [x] **Tests:** DB-backed [`crawlers.test.ts`](../tests/unit/crawlers.test.ts)
      (link/unlink; reject non-crawler, foreign crawler, player caller, non-PLAYER
      or foreign target membership; list shapes; own-crawler read incl. DM_ONLY;
      null for unlinked/non-member/other player; non-numeric stat drop); component
      + page coverage in
      [`crawler-sheet.test.tsx`](../tests/unit/crawler-sheet.test.tsx),
      [`crawler-assignment-panel.test.tsx`](../tests/unit/crawler-assignment-panel.test.tsx),
      [`player-crawler-sheet-page.test.tsx`](../tests/unit/player-crawler-sheet-page.test.tsx);
      section routing in [`ai-keys-settings-page.test.tsx`](../tests/unit/ai-keys-settings-page.test.tsx),
      the action in [`ai-keys-actions.test.ts`](../tests/unit/ai-keys-actions.test.ts),
      and updated [`player-nav.test.tsx`](../tests/unit/player-nav.test.tsx) +
      [`settings-nav.test.tsx`](../tests/unit/settings-nav.test.tsx).
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors; pre-existing
      settings-action warnings only), `npm run build` (the `/play/campaigns/[id]/sheet`
      route registers), and the full coverage gate green (137 files / **1829 tests**;
      statements 95.32%, branches 88.92%, functions 96.49%, lines 96.94%).
      **In-browser** (reseeded `dcc` + a `player@example.com` PLAYER membership
      linked to a DM_ONLY "Carl" crawler): the player's Crawler Sheet rendered the
      DM_ONLY crawler's real stats (LVL 9, HP 118, MP 24, 4,200 gold, Floor 9, the
      6-stat grid, 37 kills, 1.84M watching), the DM's Settings → Crawlers section
      linked/unlinked Carl with the success message flipping accordingly, and no
      console errors on either side.

## M7 — Player crawler interface: console shell + Known World (slice 1) ✅ (2026-06-30)

**Goal:** the first M7 *player-UI* surface and the foundation every later player
slice builds on — a dedicated player console (separate from the DM console),
role-based routing that keeps players out of the DM tools and DMs out of the
player view, and a projected, read-only **Known World** that renders only the
canon a player is allowed to see. This is invariant #5 made visible: the entire
surface is the visibility projection. No schema change (reuses the existing
PLAYER-role-scoped service seams); the player↔crawler link + crawler sheet,
inventory/boxes, System feed, scoped Ask, and suggestions are the remaining
slices.

**Decision (separate `(player)` route group at `/play`, gate at the layout
chokepoint).** The DM console stays at `/campaigns/[id]`; the player crawler
interface lives at `/play/campaigns/[id]` in a new `(player)` route group with
its own console shell. Role enforcement is a single chokepoint per side: a new
`(dm)/campaigns/[id]/layout.tsx` redirects a `PLAYER` to `/play/campaigns/[id]`
(gating *all* DM campaign sub-pages at once), and `(player)/play/campaigns/[id]/
layout.tsx` redirects a DM/OWNER back to the DM console (and 404s a non-member, so
existence never leaks). The Known World forces `status: CANON` on top of the
service's PLAYER visibility filter — belt-and-suspenders so a pending proposal can
never reach a player even if a row were mis-flagged.

- [x] **Role seam** ([`campaigns.ts`](../src/server/services/campaigns.ts)):
      `getMembershipRole(userId, campaignId)` → `Role | null`, the single source
      the routing gates read (a user may DM one campaign and play another).
- [x] **Player console shell** ([`(player)/layout.tsx`](<../src/app/(player)/layout.tsx>),
      [`player-nav.tsx`](../src/components/console/player-nav.tsx),
      [`player-campaign-switcher.tsx`](../src/components/console/player-campaign-switcher.tsx)):
      brand sidebar + `PlayerNav` (Known World built; Crawler Sheet / System Feed /
      Ask the System / Suggestions shown disabled as **Planned**, so the nav doubles
      as a roadmap with no stub pages) + a `/play`-scoped campaign switcher listing
      only the user's `PLAYER` campaigns + the shared `UserMenu`.
- [x] **Known World** ([`(player)/play/campaigns/[id]/page.tsx`](<../src/app/(player)/play/campaigns/[id]/page.tsx>)):
      the in-fiction "THE SYSTEM" banner + a type-facet rail + a read-only grid of
      `PLAYER_VISIBLE` CANON entities (via `listEntitiesForUser`, type-faceted,
      unpaginated since a player's known slice is small); empty state explains the
      DM hasn't revealed that part of the world yet.
- [x] **Read-only entity detail** ([`(player)/play/campaigns/[id]/entities/[entityId]/page.tsx`](<../src/app/(player)/play/campaigns/[id]/entities/[entityId]/page.tsx>)):
      projected via `getEntityForUser` (null → 404) — header, image (avatar vs.
      illustration), summary, Markdown description, tags, and player-visible
      `listConnectionsForEntity` edges linking to other revealed entities. No edit /
      lock / AI / provenance affordances.
- [x] **Routing gates** ([`(dm)/campaigns/[id]/layout.tsx`](<../src/app/(dm)/campaigns/[id]/layout.tsx>),
      [`(player)/play/campaigns/[id]/layout.tsx`](<../src/app/(player)/play/campaigns/[id]/layout.tsx>),
      [`(dm)/dashboard/page.tsx`](<../src/app/(dm)/dashboard/page.tsx>)): the two
      role-gate layouts plus dashboard cards that link a `PLAYER` membership to
      `/play/campaigns/[id]` and a DM/owner one to `/campaigns/[id]`.
- [x] **Tests:** DB-backed `getMembershipRole` (owner/player/non-member) in
      [`campaigns.test.ts`](../tests/unit/campaigns.test.ts); jsdom coverage for the
      Known World page (forces CANON + player scope, banner, projected cards, type
      filter, empty state, non-member 404) in
      [`player-known-world-page.test.tsx`](../tests/unit/player-known-world-page.test.tsx);
      the read-only detail (player-scoped seam, render, connections link to
      `/play/...`, no edit/lock affordances, projection-null 404) in
      [`player-entity-page.test.tsx`](../tests/unit/player-entity-page.test.tsx);
      both role gates + dashboard role-linking in
      [`player-campaign-layouts.test.tsx`](../tests/unit/player-campaign-layouts.test.tsx)
      and [`dashboard-page.test.tsx`](../tests/unit/dashboard-page.test.tsx); the
      nav + console shell in [`player-nav.test.tsx`](../tests/unit/player-nav.test.tsx)
      and [`player-console-shell.test.tsx`](../tests/unit/player-console-shell.test.tsx).
      The existing service-level "filters player reads to player-visible entities"
      case already locks the projection invariant at the DB.
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors; pre-existing
      settings-action warnings only), `npm run build` (the two `/play/...` routes
      register), and the full coverage gate green (statements 95.3%, branches
      88.86%, functions 96.45%, lines 96.91%). **In-browser** (reseeded `dcc` +
      a `player@example.com` PLAYER membership with two entities revealed): signed
      in as the player, the Known World rendered only the two `PLAYER_VISIBLE`
      NPCs (the `DM_ONLY` third hidden), the read-only detail showed the Markdown
      description with no edit controls, and hitting the DM URL `/campaigns/[id]`
      server-redirected to `/play/campaigns/[id]`. No console errors.

## M7 — `BOX` entity type + reward/content graph ✅ (2026-06-30)

**Goal:** the rest of the M7 *game-progression* sub-thread — model **loot boxes**
as a first-class `BOX` `EntityType` and the reward graph the domain model already
names ([`01-domain-model.md`](./01-domain-model.md): "loot boxes … represented by
the first-class `BOX` entity type containing items"): an `ACHIEVEMENT` grants a
`BOX` (`GRANTS_BOX`), and a `BOX` contains `ITEM`s (`CONTAINS`). This is also the
long-deferred **brand-new-`EntityType` "proof"** for the ADR 0009 entity-kind
registry: `BOX` carries no bespoke `data.*` fields, so it needs **no kind
descriptor** — it rides the generic core create/read/visibility path with only
enum + registry-metadata additions, exactly as the registry intended. The reward
graph needs **no new service write path**: both edges route through the existing
reviewable relationship pipeline.

**Decision (model with edges, not bespoke data).** A box's meaning is its place in
the graph — what grants it (incoming `GRANTS_BOX` from an achievement) and what it
holds (outgoing `CONTAINS` to items). So `BOX` ships as a generic type and the two
relationships carry the semantics; `CONTAINS` already existed (FLOOR/LOCATION →
ITEM) and simply gains `BOX` as a suggested source. A box **tier/rarity** bespoke
field (Bronze/Silver/Gold/…) is a plausible future `data.*` follow-up but is
deliberately out of scope here to keep the EntityType proof minimal.

- [x] **Enums + migration** ([`schema.prisma`](../prisma/schema.prisma), migration
      `20260630183827_m7_box_entity_type`): additive `EntityType.BOX` +
      `RelationshipType.GRANTS_BOX` (`ALTER TYPE … ADD VALUE`; drift gate clean).
- [x] **Validation** ([`validation.ts`](../src/lib/validation.ts)): `BOX` added to
      `entityTypeValues` **and** `genericEntityTypeValues` (so it's a creatable
      generic type, not a satellite kind like CRAWLER); `GRANTS_BOX` added to
      `relationshipTypeValues`.
- [x] **Relationship registry** ([`relationship-types.ts`](../src/lib/relationship-types.ts)):
      a `GRANTS_BOX` descriptor in the GAME group (`ACHIEVEMENT → BOX`, "grants
      box" / "granted by"); `CONTAINS` gains `BOX` in `sourceTypes` so `BOX → ITEM`
      is a suggested edge. The exhaustive `Record<RelationshipTypeValue, …>` makes
      the new descriptor compiler-required.
- [x] **Presentation** ([`entities.ts`](../src/lib/entities.ts)): `BOX` joins the
      loot/gear `var(--import)` type-dot color (alongside ITEM); the label derives
      to "Box" via the existing title-caser (no map to touch).
- [x] **Lore seeding** ([`seeding.ts`](../src/server/services/seeding.ts)): the
      DCC classifier now maps box signals to `BOX` instead of `ITEM`, so BYO-lore
      campaigns import loot boxes as the new type — a `" Box"` title ending, an
      `"is a box"`/`"is a loot box"` body, and a **word-boundary** `\bbox\b` title
      keyword (so `Boombox`/`icebox` stay `ITEM`). DCC's loot boxes are tier-named
      (`Gold Box`, `Silver Box`, …), so these high-signal cases are reliably boxes.
- [x] **Tests:** pure picker/label coverage (GRANTS_BOX suggested + defaulted +
      directional labels for ACHIEVEMENT→BOX; CONTAINS suggested + defaulted for
      BOX→ITEM) in
      [`relationship-types.test.ts`](../tests/unit/relationship-types.test.ts); a
      DB-backed end-to-end reward-graph case (a `BOX` persists as CANON via the
      generic path; `ACHIEVEMENT --GRANTS_BOX--> BOX --CONTAINS--> ITEM` route
      through the pipeline; the box's incoming reward + outgoing content surface in
      `listConnectionsForEntity`) in
      [`relationships.test.ts`](../tests/unit/relationships.test.ts).
- [x] **Docs:** the domain model + data schema already named `BOX`/`GRANTS_BOX`
      (this realizes them); fixed a duplicate `CONTAINS` in
      [`09-data-schema.md`](./09-data-schema.md)'s `RelationshipType` enum listing
      and folded `GRANTS_BOX` into the game-edges line to match the real enum order.
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors; pre-existing
      settings-action warnings only), `npm run build` (routes unchanged), and the
      full coverage gate green (128 files / **1769 tests**; statements 95.29%,
      branches 88.94%, functions 96.56%, lines 96.92%). **In-browser** (reseeded
      `dcc`, authed as `dm@example.com`): the World Browser quick-create dropdown
      offers "Box" (25 types); creating "Bronze Loot Box" as a BOX persisted as
      `type=BOX / status=CANON` (DB-confirmed) and rendered as a CANON card with the
      loot-colored type dot, no console errors.

## M7 — `GRANT_ACHIEVEMENT` event-effect kind ✅ (2026-06-29)

**Goal:** the first M7 *game-progression* slice — let an event grant a crawler an
achievement, as the structured effect the domain model already names
([`01-domain-model.md`](./01-domain-model.md): "Crawler Y granted Achievement A
via structured `GRANT_ACHIEVEMENT`"). M6's "done when" bar is met and its
remaining slices are blocked on M10/M11, so M7 is the lowest unblocked milestone;
this slice needs no player-UI surface. No schema/migration (effects are JSON on
`Event`; the apply materializes the already-existing `EARNED_ACHIEVEMENT`
relationship type between the already-existing `ACHIEVEMENT` entity kind and the
crawler).

**Decision (reuse the CRAWLER target + a second picked entity; idempotent edge).**
`GRANT_ACHIEVEMENT` keeps the existing **CRAWLER** target machinery (the recipient
becomes an `AFFECTED` participant, validated by `loadEffectTargetCrawler`) and adds
one kind-specific field — `achievementEntityId`, the granted `ACHIEVEMENT` entity —
mirroring how `PERSONA_SHIFT` added `dialShifts`. On apply it routes through the
existing `applyCreateRelationship` path (so the grant carries provenance and is
indexed/audited like any edge) and is **idempotent**: a crawler who already holds a
live `EARNED_ACHIEVEMENT` edge to that achievement is left untouched, so
re-applying the event never duplicates the grant.

- [x] **Registry + validation** ([`event-effect-kinds.ts`](../src/lib/event-effect-kinds.ts),
      [`validation.ts`](../src/lib/validation.ts)): added `GRANT_ACHIEVEMENT` to
      `eventEffectKindValues` + a meta entry (target `CRAWLER`, new `usesAchievement`
      flag); `eventEffectSchema` carries `achievementEntityId` and `superRefine`
      requires it for the kind.
- [x] **Phrasing** ([`event-effects.ts`](../src/lib/event-effects.ts)):
      `describeEffect` gained an optional `resolveName` so a `GRANT_ACHIEVEMENT`
      can name its granted achievement inline ("Earns achievement: Goblin Slayer"),
      degrading to "Earns achievement" when no resolver is supplied.
- [x] **Service** ([`review.ts`](../src/server/services/review.ts),
      [`events.ts`](../src/server/services/events.ts)):
      `StoredEventEffect.achievementEntityId` parse/serialize; `assertValidDeclaredEffect`
      requires it; `assertDeclaredEffectTarget` validates the recipient crawler **and**
      `assertAchievementEntity` (live canon `ACHIEVEMENT`); the apply dispatch gains a
      `GRANT_ACHIEVEMENT` branch → `applyGrantAchievementEffect` (idempotent
      `EARNED_ACHIEVEMENT` edge via `applyCreateRelationship`). `EventEffectView`/projection
      + the create/update patch builders carry `achievementEntityId` (and effect-target
      revalidation now covers the granted achievement's page).
- [x] **UI** ([`effect-rows.tsx`](../src/components/entities/effect-rows.tsx),
      [`actions.ts`](<../src/app/(dm)/actions.ts>),
      [`timeline-panel.tsx`](../src/components/entities/timeline-panel.tsx),
      [`campaign-timeline.tsx`](../src/components/timeline/campaign-timeline.tsx),
      [`effect-operation-editor.tsx`](../src/components/review/effect-operation-editor.tsx),
      [`review/page.tsx`](<../src/app/(dm)/campaigns/[id]/review/page.tsx>)): the
      effect-row editor renders a second **achievement** typeahead (`effectAchievement_<i>`)
      for `GRANT_ACHIEVEMENT`; both timelines and the Review Queue effect editor thread
      an `ACHIEVEMENT` candidate pool + a `searchAchievement` action; `parseEffectRows`
      collects the field; the read-only badge/summary names the granted achievement.
- [x] **Tests:** new DB-backed
      [`grant-achievement-effect.test.ts`](../tests/unit/grant-achievement-effect.test.ts)
      (schema validation; declared-effect projection; apply creates the edge with
      provenance + `AFFECTED` participant; idempotent re-apply; declare-via-edit;
      non-achievement and non-crawler targets rejected). UI/pure cases added in
      [`effect-rows.test.tsx`](../tests/unit/effect-rows.test.tsx),
      [`effect-operation-editor.test.tsx`](../tests/unit/effect-operation-editor.test.tsx),
      [`event-effects-section.test.tsx`](../tests/unit/event-effects-section.test.tsx)
      (`describeEffect`),
      [`dm-actions.test.ts`](../tests/unit/dm-actions.test.ts) (form parsing), and
      [`campaign-timeline.test.tsx`](../tests/unit/campaign-timeline.test.tsx)
      (achievement typeahead → search action). Existing effect literals gained the
      new required field.
- [x] **Docs:** the domain model already named `GRANT_ACHIEVEMENT` (this realizes
      it); [`09-data-schema.md`](./09-data-schema.md)'s `Event.effects` comment now
      lists it.
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors; pre-existing
      settings-action warnings only), `npm run build` (routes unchanged), and the
      full coverage gate green (statements 95.35%, branches 88.95%, functions 96.61%,
      lines 96.99%). In-browser verification deferred (the local dev server occupies
      the only Next dev port — see the preview note in memory).

## Cleanup — Merge `COLLAPSE` + `ABSOLUTE_DAY` time bases ✅ (2026-06-27)

**Goal:** a backlog time-model simplification. `COLLAPSE` and `ABSOLUTE_DAY`
resolved **identically** — `resolveAbsoluteDay` returns the raw `offset` for both
(collapse = day-0 epoch) — and differed only in the generated phrase ("Day N since
the collapse" vs. the bare "Day N"). Carrying both as separately-selectable bases
was pure redundancy, so `ABSOLUTE_DAY` is retired.

**Decision (lazy read-upgrade, no DB migration).** `ABSOLUTE_DAY` is removed from
`timeBasisValues` (the single source of truth) rather than just hidden from the
picker, so no zombie enum value lingers. Existing `Event.inGameTime` rows that
still carry the old basis are normalized **on read** — `readTimeRef` maps a stored
`ABSOLUTE_DAY` to `COLLAPSE`, keeping the `offset`. This is the same lazy-upgrade
pattern as `readKindData` (ADR 0011): nothing queries on the basis at the DB level
(resolution is all in-memory), so a lazy seam is sufficient and avoids a raw
canon write that would bypass the review pipeline (invariant #1). The terse
"Day N" wording the old basis produced lives on via the existing `label` override
(legacy rows that carried one keep it through the upgrade).

- [x] **Lib** ([`time-ref.ts`](../src/lib/time-ref.ts),
      [`time-resolve.ts`](../src/lib/time-resolve.ts)): dropped `ABSOLUTE_DAY` from
      `timeBasisValues` (narrowing `TimeBasis` everywhere it's consumed); added a
      `normalizeBasis` legacy mapper used by `readTimeRef`; removed the now-dead
      `ABSOLUTE_DAY` branches in `phraseTimeRef` and `resolveAbsoluteDay` (the
      `COLLAPSE` branch already handled them identically).
- [x] **UI pickers** ([`event-time-fields.tsx`](../src/components/entities/event-time-fields.tsx),
      [`operation-diff-editor.tsx`](../src/components/review/operation-diff-editor.tsx)):
      removed the "Absolute day" option from both basis pickers (compiler-enforced
      via `Record<TimeBasisValue, string>`). `validation.ts` re-exports
      `timeBasisValues`, so its `z.enum` rejects new `ABSOLUTE_DAY` writes too.
- [x] **Tests:** new `readTimeRef` legacy-upgrade case (offset preserved, label
      survives) in [`time-ref.test.ts`](../tests/unit/time-ref.test.ts); removed the
      retired-basis phrase/resolve cases; migrated `ABSOLUTE_DAY` literals to
      `COLLAPSE` in `time-resolve`, `persona-shift-effect`, `generation`,
      `floor-collapse-effect`, and `campaign-timeline` tests (same offsets → same
      resolved days, so every numeric expectation held).
- [x] **Docs:** updated the live model docs (01-domain-model, 09-data-schema,
      10-ui-ux) and added a "retired, merged into COLLAPSE" note to ADR 0004's
      `TimeBasis` listing.
- [x] **Verification:** `npm run typecheck` clean; touched unit tests green (pure
      `time-ref`/`time-resolve` + DB-backed `persona-shift-effect`/`generation`/
      `floor-collapse-effect` + `campaign-timeline`). Full lint/build/coverage gate
      below.

## Backlog — Entity image support (URL linking) ✅ (2026-06-27)

**Goal:** the M1 follow-up — give every entity an optional main image, rendered
in the detail header (an avatar for characters, an illustration card for
places/things). Scoped to **linking by URL**; actual file upload (blob storage)
stays a later slice. `imageUrl` was already sketched in
[`09-data-schema.md`](./09-data-schema.md) and [`01-domain-model.md`](./01-domain-model.md);
this realizes it. The field is a genuinely-shared **core** entity column (like
`summary`/`description`), so it rides the existing review/lock/provenance plumbing
rather than the entity-kind registry.

- [x] **Schema** ([`schema.prisma`](../prisma/schema.prisma), migration
      `20260627200601_m1_entity_image_url`): additive `Entity.imageUrl String?`
      (drift gate clean).
- [x] **Validation** ([`validation.ts`](../src/lib/validation.ts)): `imageUrl` in
      `entityCoreSchema` — optional, trimmed, ≤2048 chars, **http(s)-only** (a
      `javascript:`/`data:` scheme is rejected at the boundary since the value is
      rendered in an `<img src>`); added to `lockableEntityFields` (so
      `lockableFields`/`lockFieldSchema` accept it automatically). A shared
      `sanitizeImageUrl` also re-validates at the review **apply** path
      (`applyCreateEntity`/`buildEntityUpdateData`), so a review-edited or
      AI/import-carried patch value can't bypass the form rule — invalid →
      null, valid http(s) untouched.
- [x] **Service** ([`entities.ts`](../src/server/services/entities.ts),
      [`review.ts`](../src/server/services/review.ts)): threaded through
      `entityCoreData`/`entityCreatePatch`/`updateEntity` + the detail/edit
      selects, and the apply paths (`applyCreateEntity`, `buildEntityUpdateData`,
      `currentEntityValue`). Provenance is generic (per patch field), so the
      `imageUrl` change records provenance with no extra wiring.
- [x] **Actions** ([`actions.ts`](<../src/app/(dm)/actions.ts>)): `imageUrl`
      added to create-generic / create-crawler / update-entity FormData parsing
      and the update value-preservation map.
- [x] **UI** ([`entity-forms.tsx`](../src/components/entities/entity-forms.tsx),
      [`entities/[entityId]/page.tsx`](<../src/app/(dm)/campaigns/[id]/entities/[entityId]/page.tsx>)):
      an Image URL input in `CoreFields` (lock-aware, value-preserving) and a
      read-view `EntityImageBlock` — a round avatar for character kinds
      (CRAWLER/NPC/SYSTEM_AI/BOSS/MOB_TYPE/DEITY), an illustration card for the
      rest, with a `FieldLockToggle` and a "No image (locked)" empty state.
      Plain `<img>` (no `next/image` server-side proxy of arbitrary external URLs).
- [x] **Tests:** validation (accept/trim http(s), blank-as-empty, reject non-http
      scheme, `imageUrl` lockable) in
      [`validation.test.ts`](../tests/unit/validation.test.ts); DB-backed
      create/edit/clear + provenance + locked-field block in
      [`entities.test.ts`](../tests/unit/entities.test.ts); the form input +
      read-only-when-locked in
      [`entity-forms.test.tsx`](../tests/unit/entity-forms.test.tsx); avatar vs.
      illustration vs. locked-empty vs. absent rendering in
      [`entity-page.test.tsx`](../tests/unit/entity-page.test.tsx).
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors;
      pre-existing settings-action warnings only), `npm run build`, and the full
      coverage gate green (1716 tests; statements 95.06%, branches 88.5%,
      functions 96.64%, lines 96.72%). **In-browser** (reseeded `dcc`, authed as
      `dm@example.com`): a CRAWLER renders an 80×80 rounded-full avatar and a
      LOCATION a 440×280 rounded illustration card (both external images loaded);
      editing the Image URL and saving round-trips through the action → review
      apply → re-rendered header, no console errors.

## Backlog — Roster ↔ connections dedup (groups) ✅ (2026-06-27)

**Goal:** the dedup half of the "Roster ↔ connections dedup + roster editor"
backlog item. On a group entity's detail page (PARTY/GUILD/FACTION/ORGANIZATION)
the rolled-up **roster** panel and the **connections** pane rendered the *same*
membership edges, because [`listConnectionsForEntity`](../src/server/services/relationships.ts)
returns every edge touching the entity while the roster
([`getGroupRoster`](../src/server/services/groups.ts)) already rolls up the
group's incoming MEMBER_OF/PART_OF/LEADS edges. The roster **editor** half (making
the roster pane editable) stays open.

**Decision (hide exact roster edges only, never silent).** The roster rolls up a
group's *incoming* membership (member/leader → group), filtered to the selected
`rosterDay` (or current membership by default). A group's *outgoing* membership —
e.g. a party that is `PART_OF` a guild — appears in the *parent's* roster, not its
own. Former/future incoming memberships are also absent from the selected roster
snapshot and must remain editable in Connections. The dedup therefore filters by
the exact relationship IDs returned by `getGroupRoster`, and surfaces a "N
membership edge(s) shown in the roster above" note so the omission is explicit.
Non-group pages have no roster IDs and keep listing membership as before.

- [x] **UI** ([`connections-panel.tsx`](../src/components/entities/connections-panel.tsx)):
      new optional `rosterRelationshipIds` prop; the panel hides only those exact
      edges, counts them, and renders the roster note. The empty state ("No
      relationships yet.") is suppressed when the only edges are roster entries
      (the note explains the list instead).
- [x] **Page** ([`entities/[entityId]/page.tsx`](<../src/app/(dm)/campaigns/[id]/entities/[entityId]/page.tsx>)):
      passes the top-level leader/member relationship IDs from the actual roster
      snapshot; nested roster edges do not touch the viewed root group and cannot
      appear in its Connections list.
- [x] **Tests:** dedup hides current roster membership while keeping a former
      incoming membership, an outgoing `PART_OF`, and a non-membership `ALLY_OF`;
      asserts the deduped count, plural/singular roster note, and empty state in
      [`connections-panel.test.tsx`](../tests/unit/connections-panel.test.tsx);
      the page passes only the day-filtered roster's relationship IDs for a PARTY
      and none for a non-group entity in [`entity-page.test.tsx`](../tests/unit/entity-page.test.tsx).
- [x] **Verification:** `npm run typecheck`, `npm run lint`, and `npm run build`
      pass; the full coverage gate is green (126 files / 1,732 tests; statements
      95.42%, branches 88.95%, functions 96.75%, lines 97.04%). Rendered QA used
      a fabricated historical Carl → Team Princess Donut membership (`Day 1 →
      10`): the current roster omitted Carl while Connections kept the edge and
      its edit controls; `?rosterDay=5` moved Carl into the roster and removed
      only that edge from Connections. No new console errors appeared during
      either verified page load.

## Backlog — Roster editor (groups) ✅ (2026-06-29)

**Goal:** the editor half of the "Roster ↔ connections dedup + roster editor"
backlog item. The dedup (2026-06-27) made a group's main-pane roster and the
Connections pane stop double-rendering the same membership edges; this makes the
roster pane itself **editable** for DMs — add/remove members and leaders,
promote/demote, and edit day-bounds — reusing the existing relationship actions
(no service-layer write path added). Only a group's **direct** roster is
editable; nested sub-group rosters stay read-only (they're edited on their own
group's page, matching how the dedup only hid top-level edges).

**Decision (co-leaders allowed; lossless edits).** A group may have multiple
`LEADS` edges — "set leader" is adding a `LEADS` edge (or promoting a member),
"clear leader" is removing it (or demoting). No leader-uniqueness is enforced (it
matches the any-to-any model and prior behavior). Because `updateRelationship`
rewrites *every* mutable field (nulling any it isn't given), a day-bounds edit or
a promote/demote would silently wipe an edge's `disposition`/`notes`/`secret`; so
those are now carried on `RosterEntry` and round-tripped as preserved hidden
fields (secret as a checkbox on edit, a `value="true"` hidden input on
promote/demote). Verified in-browser: promoting a member to leader kept its
`sinceDay`/`disposition`/`notes` intact.

- [x] **Service** ([`groups.ts`](../src/server/services/groups.ts)): additive
      `disposition`/`notes` on `RosterEntry` + the roster edge select, so the
      editor can round-trip a membership edit losslessly. No new write path —
      every roster mutation routes through the existing
      `createRelationship`/`updateRelationship`/`archiveRelationship`/
      `setRelationshipLock` (auto-approved DM change sets, invariant #1).
- [x] **Shared tree** ([`roster-tree.tsx`](../src/components/entities/roster-tree.tsx)):
      extracted the read-only `EntityRow`/`MembersTree` + a new `SubRosterBlock`
      out of `roster-panel.tsx` so both the read-only panel and the client editor
      render nested sub-rosters with identical markup and no circular import.
- [x] **Editor** ([`roster-editor.tsx`](../src/components/entities/roster-editor.tsx)):
      DM-only client component — direct leader/member rows with promote/demote
      (LEADS↔MEMBER_OF; suppressed for `PART_OF` sub-group edges), an inline
      day-bounds edit form (secret toggle, role + disposition/notes preserved),
      remove-with-undo, a lock toggle, and an "Add to roster" form (entity
      typeahead + Member/Leader role + day-bounds + secret) filed as an incoming
      `MEMBER_OF`/`LEADS` edge. Locked edges are read-only (unlock only). The add
      picker excludes the group itself and current direct roster entities.
- [x] **Panel + page** ([`roster-panel.tsx`](../src/components/entities/roster-panel.tsx),
      [`entities/[entityId]/page.tsx`](<../src/app/(dm)/campaigns/[id]/entities/[entityId]/page.tsx>)):
      `RosterPanel` gained `editable`/`candidates`; the entity page passes
      `editable={isDm}` + the campaign candidate list. Players keep the read-only
      roll-up.
- [x] **Tests:** new
      [`roster-editor.test.tsx`](../tests/unit/roster-editor.test.tsx) (render,
      remove+undo, promote preserves fields, demote, lossless day-bounds edit,
      update-error keeps the form open, add member/leader FormData shape, locked
      read-only, no promote/demote on `PART_OF`, nested sub-roster read-only); a
      `getGroupRoster` field round-trip case in
      [`groups.test.ts`](../tests/unit/groups.test.ts); `roster-panel.test.tsx`
      stubs the actions module (the read-only path now statically imports the
      editor).
- [x] **Verification:** `npm run typecheck`, `npm run lint` (0 errors;
      pre-existing settings-action warnings only), `npm run build`, and the full
      coverage gate green (127 files / **1745 tests**; statements 95.36%, branches
      88.99%, functions 96.64%, lines 97%). **In-browser** (reseeded `dcc`, authed
      as `dm@example.com`, a seeded PARTY with two members + a leader): the editor
      renders Leaders/Members with controls; promoting Donut V → leader kept
      `sinceDay:2`/`disposition:30`/`notes:"eager"` (DB-confirmed) and produced
      co-leaders; adding "Outsider V" filed the edge and re-rolled the roster; the
      Connections dedup note tracked the new edge count; no console errors.

## Testing — Branch-coverage ratchet (85→88) ✅ (2026-06-27)

**Goal:** push aggregate branch coverage up and raise the CI floor, since the
gate had been parked at 85% branches while aggregate sat ~88.5%. Targeted the
files with the most *reachable* uncovered branches (the V8 report's defensive
fail-closed guards behind `net.isIP` validation in `ssrf.ts` are deliberately
left — they're unreachable through the public API).

- [x] **`ssrf.ts`** ([`ai-ssrf.test.ts`](../tests/unit/ai-ssrf.test.ts), 80.5%→
      ~98% branches): multicast IPv6 (`ff02::1`) + unparseable IPv4-mapped form
      (`::ffff:1:2:3`, ≠2 hex groups → fails closed); `guardedLookup`'s DNS-error
      passthrough; `assertPublicEndpoint`'s unresolvable-host `catch`;
      `createSafeFetch` with URL and Request inputs (not just strings) and the
      `init ?? {}` fork (mocked global fetch, with/without `init`).
- [x] **`searchEntityCandidates`** ([`search.test.ts`](../tests/unit/search.test.ts),
      previously untested → covered): blank query short-circuit, id/name/type
      candidate shape, `types` filter, `excludeIds` drop, and the `limit` clamp.
- [x] **`getActiveSystemPersonaPrompt`** ([`persona-review.test.ts`](../tests/unit/persona-review.test.ts)):
      the recompile-on-read fallback when a snapshot's cached `compiledPrompt` is
      absent (also exercises `asRecord`'s non-object branch via nulled dials).
- [x] **Floor raised** ([`vitest.config.ts`](../vitest.config.ts)): branches
      **85→88**, functions/lines **95→96**; statements stays 95 (~0.4 margin).
- [x] **Verification:** full coverage gate green at the new floors (126 files /
      **1732 tests**; statements 95.4%, branches 88.91%, functions 96.75%, lines
      97.03%). +31 branches covered (7199→7230).

## M6 — Persona-aware dungeon-content generator (slice 6) ✅ (2026-06-22)

**Goal:** the roadmap's "full persona-aware generator family" — give the DM a way
to *create* new dungeon-voiced content (a boss, a mob type, a loot item, a System
message, an achievement, a title) in the active System AI persona's current
voice, not just enrich entities that already exist. The flesh-out generator
(slice 2) already injects the persona when *enriching* a dungeon-voiced entity;
this adds the create-from-scratch counterpart. No schema change (a new generator
files an existing `CREATE_ENTITY` proposal).

**Decision (one kind-parameterized generator).** The design lists the
encounter / monster / boss / loot / System-message generators separately, but the
entity-creating members share one shape (a fleshed entity: name + summary +
description + tags) and differ only by kind framing — so they ship as a single
generator parameterized by kind, whose creatable set is exactly
`PERSONA_VOICED_ENTITY_TYPES` (BOSS / MOB_TYPE / ITEM / SYSTEM_MESSAGE /
ACHIEVEMENT / TITLE). The **encounter** set-piece is deliberately excluded: it's
a multi-entity proposal that needs M10's generic operation aliases/dependencies,
so it stays a later slice. The generator is persona-aware but degrades gracefully
— a campaign with no active System AI persona still generates, just un-flavored
(mirroring flesh-out).

- [x] **Pure generator** ([`dungeon-content.ts`](../src/server/ai/generators/dungeon-content.ts)):
      `DUNGEON_CONTENT_GENERATOR` (id `dungeon-content`, version `1`),
      `dungeonContentOutputSchema` (strict name/summary/description/tags),
      `buildDungeonContentPrompt` (per-kind framing + a cacheable persona voice
      block with the same no-reveal rule as flesh-out + read-only related-canon
      reference), and `dungeonContentToSpec` (trims fields, normalizes tags,
      returns null on a blank name/summary/description so the service refuses a
      no-op). `dungeonContentTypeValues` re-exports the persona-voiced set.
- [x] **Create patch** ([`entities.ts`](../src/server/services/entities.ts)):
      `buildContentCreatePatch` — the fleshed-entity sibling of
      `buildStubCreatePatch` (carries a description, `isStub: false`), reusing
      `entityCreatePatch` so a generated entity is byte-identical to a manually
      created one (visibility `DM_ONLY`).
- [x] **Service** ([`generation.ts`](../src/server/services/generation.ts)):
      `generateDungeonContent(userId, campaignId, { type, brief })` — DM-only,
      campaign-AI-locked; resolves the provider, enforces the spend cap (re-checked
      after retrieval, which can spend a paid query embedding), builds consistency
      context from `searchCanon(brief)` + existing campaign tags, fetches the
      active persona via `getActiveSystemPersonaPrompt`, records usage before the
      no-op guard, and files a PENDING `CREATE_ENTITY` change set carrying the
      persona snapshot id + prompt version (copied to provenance on approval) and
      the `dungeon-content` generator provenance.
- [x] **Validation + action** ([`validation.ts`](../src/lib/validation.ts),
      [`actions.ts`](<../src/app/(dm)/actions.ts>)): `dungeonContentInputSchema`
      (kind ∈ persona-voiced set, bounded brief) and `generateDungeonContentAction`
      (validates FormData, revalidates queue + world, returns the Review Queue
      deep-link; safe error messages — invariant #6).
- [x] **UI** ([`dungeon-content-panel.tsx`](../src/components/entities/dungeon-content-panel.tsx),
      [`ai-actions-dialog.tsx`](../src/components/entities/ai-actions-dialog.tsx)):
      a "Generate dungeon content" section in the World Browser AI actions dialog
      — a kind `<select>` + brief textarea; success links the proposed change set
      in the Review Queue (nothing becomes canon until approved — invariant #1).
- [x] **Tests:** pure
      [`dungeon-content-generator.test.ts`](../tests/unit/dungeon-content-generator.test.ts)
      (per-kind framing, persona block injected/omitted, related-canon + tag
      rendering, spec normalization + blank-field rejection, schema strictness);
      DB-backed `generateDungeonContent` cases in
      [`generation.test.ts`](../tests/unit/generation.test.ts) (PENDING proposal
      shape + persona attribution + voice injection; approval creates the AI-sourced
      entity with description + persona provenance; un-flavored with no active
      persona; brief/tags in the prompt; usage recorded but no proposal on a blank
      name; no-provider, ProviderError, and player-denied paths); action coverage in
      [`dm-actions.test.ts`](../tests/unit/dm-actions.test.ts); component coverage in
      [`dungeon-content-panel.test.tsx`](../tests/unit/dungeon-content-panel.test.tsx)
      and the new section asserted in
      [`ai-actions-dialog.test.tsx`](../tests/unit/ai-actions-dialog.test.tsx).
- [x] **Verification:** `npm run typecheck`, `npm run lint`, `npm run build`, and
      the full coverage gate (see below). In-browser verification deferred (the
      local dev server occupies the only Next dev port — see the preview note in
      memory).

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

- [x] **Entity image support — URL linking (M1 follow-up).** ✅ 2026-06-27
      (dated entry below). `imageUrl String?` on `Entity`, validated as an
      optional http(s) URL, reviewable/lockable/provenance-tracked like any core
      field; an Image URL input in the entity form; avatar (characters) vs.
      illustration-card (places/things) rendering in the detail header.
      **Deferred:** actual file *upload* (needs blob storage) — linking by URL
      ships now; upload stays a later slice. The doc-09/doc-01 `imageUrl`/
      `attachments[]` sketches predate this; `attachments[]` (multi-image) is
      still unbuilt.
- [ ] **Knowledge / reveal grants.** M8 slice 3 (✅ 2026-08-04, dated entry
      above) added `MEMBERSHIP` recipients, `sourceEventId` session linking, and
      a revoke/undo affordance (all reachable from the session screen's Live
      reveal panel) — still open: `ENTITY_FIELD`/`RELATIONSHIP`/`EVENT`/`FACT`
      targets (today only `ENTITY` targets are written), and wiring these
      grants into the M7 player "known world" projection and M11 agent
      fog-of-war context (there is still no reader beyond the DM-facing
      Knowledge panel and session history).
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
- [x] **Merge `COLLAPSE` + `ABSOLUTE_DAY` time bases (time-model simplification).**
      ✅ 2026-06-27 (dated entry below). Retired `ABSOLUTE_DAY` from
      `timeBasisValues` (the single source of truth in
      [`time-ref.ts`](../src/lib/time-ref.ts), re-exported by `validation.ts`), so
      it disappears from both basis pickers and the Zod enum. Legacy
      `Event.inGameTime` rows are upgraded **lazily on read** (`readTimeRef` maps a
      stored `ABSOLUTE_DAY` → `COLLAPSE`, offset preserved) — no DB migration and no
      canon write (mirrors the `readKindData` lazy-upgrade seam; honors invariant
      #1). A DM who wants the terse "Day N" phrasing uses the existing `label`
      override.
- [x] **Roster ↔ connections dedup + roster editor (groups).** ✅ Both halves
      shipped (dedup 2026-06-27, editor 2026-06-29 — dated entries above). For
      PARTY/GUILD/FACTION/ORGANIZATION the main-pane roster (`getGroupRoster`,
      [`groups.ts`](../src/server/services/groups.ts)) and the side connections pane
      show the *same* MEMBER_OF/LEADS/PART_OF edges, because
      `listConnectionsForEntity` ([`relationships.ts`](../src/server/services/relationships.ts))
      returns all edges unfiltered.
      - [x] **Dedup.** ✅ 2026-06-27 (dated entry below). Added a
        `rosterRelationshipIds` prop to
        [`connections-panel.tsx`](../src/components/entities/connections-panel.tsx);
        the entity detail page passes the exact top-level relationship IDs from
        `getGroupRoster`. Only edges rendered by the selected/current roster
        snapshot are hidden. Outgoing membership and former/future incoming
        membership stay visible and actionable. A "N membership edge(s) shown in
        the roster above" note keeps the hide explicit.
      - [x] **Editor.** ✅ 2026-06-29 (dated entry above). The direct roster pane
        is editable for DMs — add/remove member or leader, promote/demote, edit
        day-bounds — reusing `createRelationshipAction` (`direction="in"`),
        `updateRelationshipAction`, `archiveRelationshipAction`/
        `restoreRelationshipAction`, and `toggleRelationshipLockAction`. The only
        service touch was additive (`disposition`/`notes` on `RosterEntry`) so an
        edit round-trips losslessly. **Open question resolved:** co-leaders are
        allowed (no leader-uniqueness enforced — matches the any-to-any model).
- [ ] **Reconcile `PART_OF` overload (minor).** It's registered SPATIAL
      (location→floor) in [`relationship-types.ts`](../src/lib/relationship-types.ts)
      but `getGroupRoster` also uses it for party-in-guild roll-up, and its
      `sourceTypes` exclude `PARTY` so the create-UI won't suggest it there. Decide:
      broaden PART_OF's registry metadata, or split a distinct parties-in-guild
      membership type.
- [x] **Connections dedup honors `rosterDay`/`asOfDay`.** ✅ 2026-06-27. The
      page passes the actual day-filtered roster relationship IDs into Connections,
      so only edges visible in that snapshot are deduplicated; non-current edges
      remain available for edit/archive.

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
- [ ] **Coverage ratchet.** The gate is now **95% statements / 88% branches /
      96% functions / 96% lines** (branches 85→88, funcs/lines 95→96 on
      2026-06-27, after adding `ssrf.ts` / `searchEntityCandidates` /
      persona recompile-fallback tests pushed aggregate to ~88.9% branches /
      96.8% funcs / 97.0% lines — dated entry below). Keep raising the branch
      floor toward 90%; the largest remaining uncovered-branch files are
      `review.ts` (~239 uncovered) and `actions.ts` (~83), so meaningful further
      gains live there.
- [ ] **Campaign settings page redesign & expansion (M9).** Redesign the settings
      page `/campaigns/[id]/settings` to use the three-pane layout. The middle
      pane will act as a sub-nav with options:
      - **General**: Campaign name, description, and visibility toggle (allow dungeons to be publicly visible if the DM wants).
      - **Crawlers**: Inviting other users to the campaign and managing user memberships/roles.
      - **AI Providers**: BYO API keys configuration.
- [ ] **Game-progression modeling (M7).** Implement:
      - [x] **Event achievement grants**: Allow events to grant achievements to crawlers via a structured `GRANT_ACHIEVEMENT` event effect. ✅ 2026-06-29 (dated entry below).
      - [x] **Achievement box rewards**: Model `BOX` as a new `EntityType`. Allow achievements to grant boxes (via `GRANTS_BOX` relationships). ✅ 2026-06-30 (dated entry below).
      - [x] **Box contents**: Support boxes containing items (using `CONTAINS` relationships from box entities to item entities). ✅ 2026-06-30 (dated entry below).

---

## Older milestones (archived)

Completed, green milestones below this point have been moved verbatim to
[`PROGRESS-archive.md`](./PROGRESS-archive.md) to keep this working checklist
lean: **M5.5** (entity model refactor with satellites), **M5** (search indexing, semantic search, retrieval-augmented generation), **M4** AI
generation (BYO-key storage, provider abstraction, first generator, generator-expansion tail, entity-kind registry, visibility simplification), **M3** (floor/timeline/graph/knowledge slices), **M2** (review
pipeline), **M1**, **M0**, and the early design-language/shell work. Their open
follow-ups (if any) are mirrored in the **Open backlog** section at the top of
this file, which remains the authoritative pickup list.
