# 11 — Roadmap

Milestones are **sequenced** so each builds on the last and each is small enough
for a future session to **decompose into tasks**. Every milestone lists: goal,
the slice of work, and a "done when" bar. Treat the task bullets as a starting
decomposition, not a frozen spec — refine at the start of each session
(see [`12-working-sessions.md`](./12-working-sessions.md)).

> **Sequencing rationale:** the review pipeline is the signature feature, but it
> has nothing to operate on without a tenant model and at least one entity type.
> So M0–M1 lay the foundation, **M2 builds the pipeline as early as possible**,
> and everything after rides on it. Search/retrieval (M5) comes right after AI
> generation so the persona engine (M6) and entity agents (M11) build their
> context on principled retrieval. We deliberately avoid building lots of CRUD
> before the pipeline, so we never write a canon path that bypasses review.

---

## M0 — Project foundation
**Goal:** a running Next.js app with DB, auth, and CI.
- Scaffold Next.js (App Router, TS), Tailwind, shadcn/ui.
- Postgres + Prisma; initial migration with `User`, `Campaign`, `Membership`.
- Auth.js (email/password + one OAuth); session + role plumbing.
- Service-layer + directory structure per [`02-architecture.md`](./02-architecture.md).
- Vitest + Playwright harness; a `Job`-less baseline; local Docker Postgres;
  `.env.example`; seed script.
- **Done when:** a user can sign up, create a campaign, and see an (empty)
  campaign dashboard; tests + lint run in CI.

## M1 — Entity core + one first-class type
**Goal:** model and edit canon for the generic `Entity` plus `Crawler`.
- `Entity` table + `Crawler` satellite; Zod entity schemas; visibility/lock
  columns (columns now, enforcement in M2). Visibility is simplified to a binary
  `DM_ONLY` and `PLAYER_VISIBLE`. Entity-type enum incl. `PARTY`, `GUILD`,
  `SYSTEM_AI`, etc.
- Entity CRUD through the **service layer** (not yet routed through the pipeline
  — but written so M2 can slot the pipeline underneath).
- World browser (list/search incl. basic keyword/full-text) + entity detail
  (fields + markdown + image/avatar support).
- **Done when:** a DM can create/edit/browse crawlers and generic entities in a
  campaign, scoped by tenancy.

## M2 — Review pipeline (signature feature)
**Goal:** all canon mutations flow through proposals; locking + provenance work.
- `ChangeSet`, `ChangeOperation`, `Provenance`, `Lock` (fields), `AuditLog`.
- `review` service: create proposal, diff, per-op/field accept-edit-reject,
  approve (atomic), reject, supersede; auto-approved DM path with provenance.
- Locking + lock-aware blocking; staleness/conflict detection via `version`.
- Re-route M1's entity writes through the pipeline. Add Review Queue UI with
  diffs + batch actions.
- **Done when:** every canon change has provenance; locked fields can't be
  overwritten; a DM can review/approve/reject a proposal end to end. Invariants
  from [`03-review-pipeline.md`](./03-review-pipeline.md) are test-covered.

## M3 — Relationships & events graph
**Goal:** model the connective tissue and causality.
- `Relationship` (typed, **any-to-any** edges) + `Event` + `EventParticipant` +
  `EventCausality`, all through the pipeline.
- Knowledge/reveal foundations for fog of war: canonical facts can be granted to
  specific actor entities (NPCs, crawlers, parties, factions) without making
  them campaign-wide player-visible.
- Connections panel on entity detail; basic relationship graph view; timeline;
  causality (cause/effect) view (start simple, list-based, then visual).
- **Group hierarchies:** crawler → party → guild membership via `MEMBER_OF` /
  `PART_OF` / `LEADS` edges (PARTY/GUILD entity types added in M1's enum);
  time-bounded membership preserves "who was where, when." A group/membership
  view that rolls up a guild's parties and members.
- **Done when:** a DM can link any entity to any other, build crawler→party→guild
  membership, log events with participants, and traverse cause→effect chains;
  relationships/events are reviewable + lockable.

## M3.5 — Tagging system
**Goal:** Replace freeform tag strings with a structured, queryable tagging system.
- Build `listCampaignTags` service layer query to extract unique tags.
- Update `listEntitiesForUser` to support filtering by tag and matching queries against the `tags` array.
- Replace the raw text input on `EntityForm` with a tag selection UI featuring campaign autocomplete.
- Add tag filter controls to the Campaign detail sidebar.
- Style tags as clickable badges that activate tag-filtering when clicked.
- **Done when:** Users can filter the World Browser by tag, click any tag badge to search by it, autocomplete tags during creation/edit, and search tags in the general search bar.

## M4 — AI generation (BYO-key)
**Goal:** generate proposals via a provider-agnostic pipeline.
- Provider abstraction + Anthropic and OpenAI adapters; encrypted `AiKey`;
  structured-output + Zod validation; prompt templates (versioned).
- First generators: entity-fleshing, bulk-stub scaffolding, relationship
  inference. Generation panel → Review Queue. Lock-aware context building.
- `Job` table + worker for bulk/async runs; usage/cost tracking; spend caps.
- **Done when:** a DM with their own key can generate entities/relationships that
  land as PENDING proposals respecting locks, then review them.

## M5 — Search & retrieval
**Goal:** find anything at scale, and feed *relevant* canon to the AI.
- pgvector + full-text hybrid index; async re-indexing via the `Job` worker on
  canon change; `SearchDoc` mirrors source visibility for scoped retrieval.
- Search UI (filterable, all types/edges/events) + **Ask the Campaign**
  (retrieval-augmented Q&A with citations, read-only).
- Wire retrieval into the AI orchestrator's context-building (replaces ad-hoc
  canon-dumping; honors locks + scope).
- **Done when:** a DM can search and ask questions over canon with citations, and
  generators draw context from retrieval. Graceful degradation with no AI key
  (keyword/full-text still works). See [`07-search-retrieval.md`](./07-search-retrieval.md).

## M5.5 — Data model hardening
**Goal:** make `Entity.data` safe to evolve as the catalog types accumulate
fields, before M7 multiplies them. The entity-kind registry
([ADR 0009](./adr/0009-entity-kind-registry.md)) already centralized each type's
bespoke fields; what's missing is **schema evolution** — versioning, migration,
reference integrity, and the first satellite promotions. Full design in
[`adr/0011-entity-data-versioning-and-satellites.md`](./adr/0011-entity-data-versioning-and-satellites.md).
- **Versioning + migration:** add `schemaVersion` + pure per-kind `migrations` to
  the `EntityKind` descriptor; stamp a reserved `data._v` on every write; a single
  `readKindData` validate-and-upgrade read seam (lazy in-memory upgrade) replaces
  the lossy "wrong type → empty default" coercion that silently drops data; a
  one-time stamp migration marks existing rows v1.
- **Migration execution:** a `MIGRATE_ENTITY_DATA` `Job` (reusing the
  `EMBED_SEARCH_DOCS` worker/dedupe pattern) eagerly upgrades stale `_v` rows
  through an auto-approved change set — a new additive `ChangeSource.MIGRATION`
  attributed to a real account (the triggering DM via `Job.createdById`, or
  `Campaign.ownerId` for an automatic `schemaVersion` bump) so the required
  `AuditLog.actorUserId` is satisfied and history reads as a migration, not a hand
  edit — recording provenance + a `MIGRATE` audit, out of the review queue;
  idempotent. Strict unknown-`data`-key policy; derive `HANDLED_DATA_KEYS` from the
  descriptor.
- **Reference integrity:** `validateReferences` for `referenceFields` (broken-ref
  badge), an impact-aware "N entities reference this" reverse-lookup before
  archive, and a campaign-scoped orphan report (feeds the DM canon-integrity
  surface and M10's consistency-check generator).
- **Satellites:** **Faction** (`standing`/`strength`/`allegiance`/`resources`,
  indexed for M9 queries + M12 faction-power rollups) is a **greenfield** 1:1
  satellite — Faction has no bespoke `data` today, so these are new fields written
  straight to the satellite (proves the satellite *plumbing*, low-risk). The
  genuine `data → satellite` **migration** is **Floor** (real existing
  `data.floorNumber`/`startDay`/`collapseDay`, many hot readers incl.
  `campaigns.ts`): the migration job moves them to the satellite — or land the
  lighter indexed-generated-column alternative, whichever the query shapes warrant.
  (The migration *machinery* itself is proved earlier by a within-`data`
  `schemaVersion` bump on FLOOR — v1 legacy numeric strings to v2 stored numbers —
  no satellite risk.) **Landed (2026-06-19): the full Floor satellite** (a FLOOR
  v2→v3 bump moves all four fields into a 1:1 `Floor` table via the migration job);
  the query shapes warranted neither for performance, but the satellite proves the
  genuine migration before M7/M9/M10. See `PROGRESS.md` (slice 5).
- **Done when:** every `data` write is `_v`-stamped; a kind can bump its version
  and migrate existing rows (lazy + batch, provenance-tracked) with no silent data
  loss; reference fields are integrity-checked and reportable campaign-wide;
  Faction is satellite-backed with review/lock/provenance still uniform on
  `Entity`; migration round-trips and the visibility/provenance invariants are
  test-covered. See
  [`adr/0011-entity-data-versioning-and-satellites.md`](./adr/0011-entity-data-versioning-and-satellites.md).

## M6 — System AI persona engine (signature feature)
**Goal:** model the in-fiction System AI as an evolving entity whose persona
drives the generation prompts.
- `SYSTEM_AI` entity type + `PersonaSnapshot` (dials, overt/secret agendas, voice
  guide, constraints, compiled prompt, active flag), all through the pipeline +
  lockable. New relationship types (`USED_BY`, `MANIPULATES`, `CONTROLS`,
  `DEFIES`) for political entanglement.
- **Persona compiler**: snapshot → prompt fragment; inject into persona-aware
  generators (encounter, monster, boss, loot/reward, System-message). DM preview/
  edit/lock of the compiled prompt; provenance records which snapshot produced
  each generation.
- Persona studio UI (dial sliders, agenda lists, voice guide, live prompt
  preview, snapshot timeline + diff). Build the snapshot model **generically** so
  any actor entity can carry a profile (values/goals/resources/knowledge scope) —
  the foundation the M11 simulation runtime builds on, even though the studio
  ships first focused on the System AI.
- `PERSONA_SHIFT` event-effect kind so persona drift lives in the causality graph
  (AI-proposed shifts arrive with M10's consequence generator; manual shifts work
  now).
- **Done when:** a DM can author/evolve the System AI persona, generate
  persona-flavored content that lands as PENDING proposals, and see which persona
  snapshot drove each generation. Persona changes are reviewable + lockable.
  See [`05-system-ai-persona.md`](./05-system-ai-persona.md).

## M7 — Player crawler interface + sharing
**Goal:** scoped, in-fiction player experience.
- Visibility projection enforced for player reads; player↔crawler linking;
  private reveals/knowledge grants respected per player/crawler.
- Crawler sheet, inventory/loot (supporting the `BOX` entity type containing items, with achievements rewarding boxes), achievements/titles (events can grant crawlers achievements via structured `GRANT_ACHIEVEMENT` event effects), System-message feed,
  "known world," scoped Ask, and player **suggestions** (→ pipeline).
- **Done when:** a player logs in, sees only shared/own-crawler data (verified by
  tests that pending/secret data never leaks), and can submit a suggestion.

## M8 — Live session mode & recaps
**Goal:** run a live game and turn the good bits into canon.
- `Session` + `SessionLogEntry`; fast capture log with `@`/`#` tagging; **promote**
  entries to canonical Events via the review pipeline (with AI-assisted drafting).
- **Live reveal** (broad visibility flips or private knowledge grants, recorded
  as `REVEAL` audit rows → feeds the "known world" and agent fog-of-war);
  session & per-crawler **recap** generation (persona-aware,
  visibility-respecting).
- **Done when:** a DM can capture a session live, reveal facts to players,
  promote moments to Events, and publish recaps. See [`08-session-mode.md`](./08-session-mode.md).

## M9 — Hardening, deploy & data portability
**Goal:** make it real and keep the DM's canon safe.
- Choose host + managed Postgres; production auth/secrets; backups; rate limits;
  audit/provenance review screens (including global audit log and per-entity history/audit trails)
  & a unified archive/trash bin (to view and restore soft-deleted entities); performance pass on
  graph/search queries (indexes / materialized views); accessibility + responsive polish.
- **Global administration foundation** ([ADR 0012](./adr/0012-shared-canon-library-and-import.md)):
  add an app-wide super-admin capability, distinct from the per-campaign
  `OWNER`/`CO_DM`/`PLAYER` membership roles, and a guarded `/admin` shell for
  CrawlDirector-wide operations. The super-admin owns the one shared-library
  campaign; M10 adds its browsing, suggestion, and import workflows. A library
  read policy must be an explicit, DM-only exception, never a blanket bypass of
  the campaign-membership gate.
- **Campaign settings layout refactoring:** Redesign the settings page to use a three-pane layout where the middle pane is a sub-navigation for:
  - **General settings** (campaign name, description, dungeon public visibility toggle).
  - **Crawlers settings** (inviting other users to the campaign and managing user memberships/roles).
  - **AI Providers** (configured provider keys/endpoints, from M4).
- **Job history, cost, and safety** ([ADR 0013](./adr/0013-job-priorities-and-idle-maintenance.md)):
  promote the Jobs surface from a terse status list to a DM-readable operational
  record. A detail view shows affected entities/relationships, per-item outcomes,
  repair or migration impact, and the exact derived documents updated. AI jobs
  aggregate their linked `AiUsage` rows (input/output/cache tokens and known
  estimated USD; never secrets) rather than duplicating accounting data in a
  free-form result. Add user-work versus maintenance priority classes, FIFO
  within a class, and idle-only maintenance scheduling. A data migration must
  preflight every candidate: only lossless/validating rows may auto-run; a
  potential drop or other impact becomes a persisted dry-run preview for the DM,
  not an automatic write.
- **Export/import:** campaign export to JSON + Markdown (provenance included);
  import as reviewable `IMPORT` change sets. The export **stamps each entity's
  `data._v`** (M5.5 / ADR 0011) so an import into a newer app version migrates
  forward through `readKindData` instead of failing or coercing — a concrete
  reason the data-versioning layer precedes M9.
- **Done when:** deployed, backed up, exportable; a real campaign can be run by a
  DM + players; DMs can view and restore archived entities, view detailed entity edit histories, and configure campaign settings via the three-pane layout.
  The global-admin shell is access-controlled, and a DM can inspect a job's
  affected records, safety preview, and AI spend before deciding whether to run
  a non-clean maintenance repair.

## M10 — Shared canon library & event-consequence AI
**Goal:** leverage and scale.
- **Admin-controlled shared canon library** ([ADR 0012](./adr/0012-shared-canon-library-and-import.md)):
  the super-admin maintains a singleton library campaign containing reusable DCC
  canon (the 18 floors, common mob types, archetypes). Other DMs may browse it
  read-only and submit proposed library edits; those edits are attributed to the
  proposer and enter the **library campaign's** Review Queue as
  `PLAYER_SUGGESTION`, where only the library admin can approve them. Players
  receive neither the cross-campaign browse entitlement nor write access.
- **Reviewable, relationship-aware library import:** importing selected library
  entities creates a target-campaign `PENDING` change set with `IMPORT`
  provenance — never an auto-approved seed. A first-class import-link mapping,
  kept outside `Entity.data`, records each approved local entity/relationship's
  immutable library origin. The import planner re-scans library edges whenever a
  selection is made and proposes every edge whose two origins are now resident in
  the target campaign, whether the endpoints were selected together or on
  different days. Same-batch edge operations declare dependencies on their
  proposed endpoint imports, so partial review cannot create a dangling edge;
  repeat import is idempotent. Imported content is a one-way local snapshot — a
  later library edit never silently changes campaign canon.
- **Replace new-campaign lore seeding with library import.** The current
  `LORE_SEED` path auto-approves imported entities and is not the product
  onboarding flow once the shared library exists. New campaigns start empty (or
  with DM-authored setup); DMs choose and review library imports instead.
- Event-consequence generator (propose downstream effects + causal links,
  including `PERSONA_SHIFT` effects that drift the System AI in reaction to
  events — M6); consistency-check generator (non-mutating → proposals).
- **Done when:** a super-admin can curate the library and review cross-campaign
  suggestions; a DM can browse it, import entities and their recovered
  relationships through the target campaign's Review Queue, including edges
  discovered across separate import sessions; and AI can propose causal
  consequences of logged events.

## M11 — Entity agents & multi-agent simulation (signature feature)
**Goal:** let major entities role-play themselves to propose believable actions
and events from their values.
- Generalize agent profiles to all actor types (faction, sponsor, organization,
  deity, show host, NPC crawler, party, guild) with per-type value/dial schemas;
  `agentEnabled` flag; profile studio for any entity.
- **Agent runtime**: subagent orchestration behind the provider abstraction
  (parallel where supported, sequential otherwise); single-act, reactive-cascade,
  and world-tick run modes; scenario/"what-if" runs.
- Proposals = events (entity as ACTOR) + relationship/state deltas + causal links,
  landing as PENDING batches in the Review Queue. Fog-of-war knowledge scoping
  (omniscient vs. in-character; uses retrieval from M5). Bounded cascades
  (depth/fan-out caps, spend caps, DM confirmation); locks respected; provenance
  per acting agent + profile.
- Simulation panel UI; integrates with the event-consequence generator (M10).
- **Done when:** a DM can enable agents on entities, run a single act / reactive
  cascade / world tick, and review a batch of in-character proposed events with
  causal links — all bounded and provenance-tracked, nothing auto-canon.
  See [`06-entity-agents.md`](./06-entity-agents.md).

# Advanced worldbuilding (stretch block, M12–M17)

Once the platform is complete (graph + pipeline + AI generation + persona + player
UI + sessions + hardening + shared library + multi-agent sim), the remaining work
is **depth: making a now-enormous world legible and alive.** What was a single
"advanced worldbuilding" bucket is split into themed milestones, each scoped on its
own. These are **largely independent** — order them by what a campaign actually
needs; the only soft dependencies are noted per entry.

> **Scope note.** This block is *analytics and depth*, **not** data-model plumbing.
> The concern that `Entity.data` is fragile as types accumulate fields is handled
> by **M5.5 / [ADR 0011](./adr/0011-entity-data-versioning-and-satellites.md)**
> (schema versioning, migration, reference integrity, satellites) — a cross-cutting
> hardening that lands *before* the type explosion. The analytics here simply
> *benefit* from M5.5 (e.g. faction-power rollups use the Faction satellite; the
> consistency cockpit surfaces the orphan/stale-`_v` reports).

## M12 — Graph analytics & influence
**Goal:** turn the relationship graph into insight at scale.
- Centrality / "power-broker" ranking (who's most connected / influential);
  community/bloc detection (natural cliques and alliances).
- A **connection-path explainer** ("how is Carl tied to the Maestro?") over the
  any-to-any edge graph.
- **Faction-power rollups** that aggregate strength/standing across a faction's
  subtree (uses the M5.5 Faction satellite).
- Temporal graph evolution: how alliances/rivalries churned across floors.
- Resolves the deferred **relationship-graph label-crowding** backlog item (a real
  data source for the graph view's scale work).
- **Done when:** a DM can rank influence, explain how any two entities connect, and
  see faction power roll up — over scoped, visibility-correct canon.

## M13 — Faction-Wars & political tracker
**Goal:** make the Floor-9 war (and standing political conflict) legible over time.
- A **war board**: army strengths, territory, and standings over campaign time;
  battle outcomes logged as Events.
- "What shifted the war" causality rollups (builds on M12 analytics + M10's
  event-consequence generator + M11 agents).
- **Done when:** a DM can track faction standings over time and trace what caused a
  shift. *(Soft deps: M12 analytics, M10, M11.)*

## M14 — Broadcast & fan-economy
**Goal:** model the show as a show — audience and money.
- Audience-metric **trends** over time (the Crawler model already stores
  `viewCount`/`followerCount`/`favoriteCount`; this adds the series + trend views).
- Sponsor stock / value / ROI modeling; viral-moment tracking; show ratings.
- The **deferred broadcast HUD tickers** (fame / audience-rating tickers from the
  mockup) finally get an honest data source and ship here.
- **Done when:** a DM can see audience/sponsor trends over time and the broadcast
  HUD tickers render from real data (no fake/filler — see the design language).

## M15 — Spatial / floor maps
**Goal:** a spatial view over the FLOOR / NEIGHBORHOOD / LOCATION structure.
- Floor / neighborhood / location **map visuals**; a "where is everyone now"
  snapshot per floor/day.
- Crawler movement **traces** reconstructed from the event log.
- **Done when:** a DM can view a floor's spatial layout and where entities are on a
  given day, derived from canon (not a separately-authored map).

## M16 — Advanced authoring depth
**Goal:** richer authoring and world-consistency tooling.
- **Structured per-type relationship `attributes`** — when edge types start
  carrying real structured fields, apply the same versioning discipline ADR 0011
  defines for entity `data` (the relationship-registry parity follow-up).
- Saved views / dashboards / smart filters over the graph.
- A world **"consistency cockpit"** that surfaces M5.5's orphan + stale-`data._v`
  reports and M10's consistency-check proposals in one place.
- Bulk authoring tools.
- **Done when:** scoped per feature when reached.

## M17 — Rules-assist layer (gated on the published DCC RPG)
**Goal:** a *light, advisory* mechanical layer — encounter/loot/stat-block hints.
- **Explicitly deferred until the DCC RPG is published**, so rules are implemented
  against the real, released ruleset rather than guessed.
- **Advisory only** — never authoritative; the DM still owns canon (every
  suggestion is a reviewable proposal, like all AI output).
- **Done when:** the ruleset exists and a DM can get non-binding mechanical hints
  that route through the review pipeline.

> **Not yet scheduled:** real-time co-DM collaboration (presence, simultaneous
> editing) is a plausible later capability but is not prioritized into this block.

---

## Dependency graph

```
M0 ▶ M1 ▶ M2 ▶ M3 ▶ M3.5 ▶ M4 ▶ M5 ▶ M5.5 ▶ M6 ▶ M7 ▶ M8 ▶ M9 ▶ M10 ▶ M11 ▶ ┐
                                                                              │
       ┌──────────────────────────────────────────────────────────────────────┘
       └▶ { M12 analytics · M13 faction-wars · M14 broadcast · M15 maps ·
            M16 authoring depth · M17 rules-assist }   ← flexible-order stretch block

  M2   is the linchpin — every later canon write rides on the review pipeline
  M5   retrieval boosts M6 & M11 context
  M5.5 hardens Entity.data before M7/M9/M10 stress it
  M6   persona needs M2/M3/M4
  M8   session mode needs M3 + M7 (+ M6 for in-voice recaps)
  M11  agents need M3/M4/M6, use M5 retrieval, pair with M10
  M12+ stretch block — mostly independent; M13 leans on M12/M10/M11; M17 waits on
       the published DCC RPG
```

M2 is the linchpin; nothing after it should introduce a canon write path that
bypasses the pipeline. **M5.5** is a small `.5` hardening insertion (like M3.5):
it adds `Entity.data` schema versioning/migration + the first satellite tables
*before* M7's catalog types, M9's export/import, and M10's library import put real
weight on the JSON `data` field. Note that **build order ≠ doc order**: the persona (M6)
and agent (M11) *designs* live in docs 05–06 alongside the other feature designs,
but the agent runtime is sequenced late because it is the heaviest feature and
pairs with M10's consequence generator.

## Cross-cutting refinements (ADR-driven)

These are not new milestones but cross-cutting refactors recorded as ADRs and
scheduled into the flow of milestone work. Track active slices in
[`PROGRESS.md`](./PROGRESS.md).

- **Entity-kind registry ([ADR 0009](./adr/0009-entity-kind-registry.md), accepted).**
  Consolidate each entity type's bespoke `data.*` fields into one per-type
  `EntityKind` descriptor and derive validation, the data-key lists, the
  reviewable/lockable field set, the form fields, and the detail display from it —
  replacing the `type === "X"` branches scattered across `validation.ts`,
  `entities.ts`, `review.ts`, the entity form, and the detail page. Pure
  application-layer refactor: the hybrid `Entity` + `data` JSON + `Crawler`
  satellite + typed-graph **data model is untouched** (no migration). Delivered in
  three behavior-preserving phases — (1) registry scaffold + FLOOR, (2) ITEM +
  derive the reviewable-field set wholesale, (3) the display slot + the next
  bespoke type as proof. **Should land before the catalog types (BOX, SKILL,
  SPELL, ACHIEVEMENT, TITLE, …) gain their own fields** and multiply the inline
  pattern — i.e. ahead of the M7 game-progression types.

- **Entity `data` versioning + satellites ([ADR 0011](./adr/0011-entity-data-versioning-and-satellites.md), accepted — planned M5.5).**
  **Extends ADR 0009.** The registry centralized each type's bespoke fields but
  deferred *schema evolution*. ADR 0011 adds a `schemaVersion` + pure per-kind
  `migrations`, a reserved `data._v` stamp, a `readKindData` validate-and-upgrade
  read seam (replacing the lossy coercion that silently drops data), a
  `MIGRATE_ENTITY_DATA` job, reference-integrity checks for `referenceFields`, and
  the first satellite promotions (Faction, then Floor) — using the migration
  machinery as the promotion mechanism. **Scheduled as M5.5** (this resolves the
  "deferred satellites (Faction/Floor)" note carried in ADR 0009 and
  [`09-data-schema.md`](./09-data-schema.md)). Lands before the M7 catalog types
  and the M9/M10 import-export round-trip stress `Entity.data`.

- **Shared library / global administration ([ADR 0012](./adr/0012-shared-canon-library-and-import.md), proposed — M9/M10).**
  M9 establishes the guarded app-wide administrator and library-campaign
  identity; M10 supplies the external-DM read/suggestion policy and the
  dependency-aware, provenance-preserving library importer. The library origin
  is relational import metadata, not a type-specific `Entity.data` field, so it
  survives schema evolution and can reliably reconnect graph edges across import
  sessions.

- **Job priorities & idle-time maintenance ([ADR 0013](./adr/0013-job-priorities-and-idle-maintenance.md), proposed — M9).**
  The worker must favor DM-initiated work over maintenance, make job outcomes and
  AI spend inspectable, and never auto-apply a data migration that has a detected
  loss or impact. This closes the safety gap left by one-way schema migrations
  before M9/M10 make import and repair operations more common.

## Design-driven refinements (proposals, 2026-05-29)

Building the [design language](./13-design-language.md) from the
[mockup](./design/mockup) surfaced concrete additions. These are **proposals** to
fold into the named milestones — not a re-sequencing:

- **Provenance/status visual contract from M2's first UI.** The source-badge /
  status-pill / lock-chip system is built now (`src/components/ui`). M2's Review
  Queue and every later canon surface should reuse it rather than inventing
  per-screen treatments — it's the cross-cutting "AI vs. human vs. locked"
  language the product promises.
- **Canon-integrity meter** (DM / AI-origin / locked %) — the mockup's nav footer.
  Real once provenance exists: **M2** computes the figures; surface it in the
  shell and in **M9**'s audit/provenance review screens. Once **M5.5** lands it
  can gain a **data-health** dimension (entities on a stale `data._v`, broken
  `referenceFields`) from ADR 0011's orphan report.
- **Global "Search · Ask the Campaign" affordance** lives in the shell from day
  one but is shown disabled until **M5** wires hybrid search + RAG Q&A. Keep the
  "Planned · M5" treatment until then.
- **Per-DM theme preference** (accent color + FX toggles, per the mockup's tweaks
  panel) — small **M9** polish item. The FX toggle already ships.
- **Entity-type taxonomy reconciliation.** The mockup uses a smaller set
  (CRAWLER, NPC, SYSTEM_AI, FACTION, ORGANIZATION, FLOOR, LOCATION, MOB_TYPE,
  TITLE); our enum is broader (adds PARTY, GUILD, BOSS, SPONSOR, SHOW, SPELL,
  ACHIEVEMENT, DEITY, …). The app's enum is the source of truth; `entityTypeColor`
  in `lib/entities.ts` already assigns category colors across the full set.
  Nothing to change — noted so the mockup's narrower list isn't mistaken for a
  spec.

### Deferred broadcast-HUD features (captured from the mockup so we don't lose them)

The mockup's topbar/ticker chrome was intentionally **not** shipped now (no honest
data source yet — see the no-fake-data principle in
[`13-design-language.md`](./13-design-language.md)). Each lands with the milestone
that produces its data:

- **Live broadcast ticker** (scrolling world events: siege timers, faction
  standings, viral clips, pending persona drift) → **M8 (live session mode)**: a
  feed of live session events + reveals. Captured in `PROGRESS.md`'s open backlog.
- **In-game clock HUD** ("Floor N · Day D") → Displays the campaign's current floor and inferred day (from the most recent event's absolute day using `resolveAbsoluteDay`) globally in the top-right header on all pages. Built as an M3 follow-up.
- **Fame / audience-rating tickers** (views/followers/favorites trends, sponsor-
  stock moves) → the `Crawler` model already tracks views/followers/favorites;
  trends + fan-economy modeling are **M14 (broadcast & fan-economy)**. Captured in
  `PROGRESS.md`'s open backlog.

## Definition of done (every milestone)

- Migrations committed; service layer covered by unit tests; key flows covered by
  e2e; lint/typecheck green; docs updated if the model changed; provenance/lock
  invariants intact.
