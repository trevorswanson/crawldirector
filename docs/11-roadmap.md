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
  columns (columns now, enforcement in M2). Entity-type enum incl. `PARTY`,
  `GUILD`, `SYSTEM_AI`, etc.
- Entity CRUD through the **service layer** (not yet routed through the pipeline
  — but written so M2 can slot the pipeline underneath).
- World browser (list/search incl. basic keyword/full-text) + entity detail
  (fields + markdown).
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
- Connections panel on entity detail; basic relationship graph view; timeline;
  causality (cause/effect) view (start simple, list-based, then visual).
- **Group hierarchies:** crawler → party → guild membership via `MEMBER_OF` /
  `PART_OF` / `LEADS` edges (PARTY/GUILD entity types added in M1's enum);
  time-bounded membership preserves "who was where, when." A group/membership
  view that rolls up a guild's parties and members.
- **Done when:** a DM can link any entity to any other, build crawler→party→guild
  membership, log events with participants, and traverse cause→effect chains;
  relationships/events are reviewable + lockable.

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
- Visibility projection enforced for player reads; player↔crawler linking.
- Crawler sheet, inventory/loot, achievements/titles, System-message feed,
  "known world," scoped Ask, and player **suggestions** (→ pipeline).
- **Done when:** a player logs in, sees only shared/own-crawler data (verified by
  tests that pending/secret data never leaks), and can submit a suggestion.

## M8 — Live session mode & recaps
**Goal:** run a live game and turn the good bits into canon.
- `Session` + `SessionLogEntry`; fast capture log with `@`/`#` tagging; **promote**
  entries to canonical Events via the review pipeline (with AI-assisted drafting).
- **Live reveal** (flip visibility to players, recorded as `REVEAL` audit rows →
  feeds the "known world"); session & per-crawler **recap** generation
  (persona-aware, visibility-respecting).
- **Done when:** a DM can capture a session live, reveal facts to players,
  promote moments to Events, and publish recaps. See [`08-session-mode.md`](./08-session-mode.md).

## M9 — Hardening, deploy & data portability
**Goal:** make it real and keep the DM's canon safe.
- Choose host + managed Postgres; production auth/secrets; backups; rate limits;
  audit/provenance review screens; performance pass on graph/search queries
  (indexes / materialized views); accessibility + responsive polish.
- **Export/import:** campaign export to JSON + Markdown (provenance included);
  import as reviewable `IMPORT` change sets.
- **Done when:** deployed, backed up, exportable; a real campaign can be run by a
  DM + players.

## M10 — Shared canon library & event-consequence AI
**Goal:** leverage and scale.
- Importable canonical DCC content (the 18 floors, common mob types, archetypes)
  as reviewable `IMPORT` change sets.
- Event-consequence generator (propose downstream effects + causal links,
  including `PERSONA_SHIFT` effects that drift the System AI in reaction to
  events — M6); consistency-check generator (non-mutating → proposals).
- **Done when:** a DM can seed a world from the library and let AI propose
  causal consequences of logged events.

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

## M12 — Advanced worldbuilding (stretch)
**Goal:** depth features as the world grows.
- Richer graph analytics (centrality, "who's most connected", faction-power
  rollups), Faction-Wars tracker, broadcast/fan-economy modeling, map/zone
  visuals, possibly a light rules-assist layer, real-time collaboration for
  co-DMs.
- **Done when:** scoped per feature when reached.

---

## Dependency graph

```
M0 ▶ M1 ▶ M2 ▶ M3 ▶ M4 ▶ M5 ▶ M6 ▶ M7 ▶ M8 ▶ M9 ▶ M10 ▶ M11 ▶ M12
          │         │    │    │              ▲              ▲
  linchpin┘         │    │    └ M6 persona needs M2/M3/M4   │
  M5 retrieval boosts M6 & M11 context ──────┘             │
  M8 session mode needs M3 + M7 (+ M6 for in-voice recaps) │
  M11 agents need M3/M4/M6, use M5 retrieval, pair with M10┘
```

M2 is the linchpin; nothing after it should introduce a canon write path that
bypasses the pipeline. Note that **build order ≠ doc order**: the persona (M6)
and agent (M11) *designs* live in docs 05–06 alongside the other feature designs,
but the agent runtime is sequenced late because it is the heaviest feature and
pairs with M10's consequence generator.

## Definition of done (every milestone)

- Migrations committed; service layer covered by unit tests; key flows covered by
  e2e; lint/typecheck green; docs updated if the model changed; provenance/lock
  invariants intact.
