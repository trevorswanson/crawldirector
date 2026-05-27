# 07 — Roadmap

Milestones are **sequenced** so each builds on the last and each is small enough
for a future session to **decompose into tasks**. Every milestone lists: goal,
the slice of work, and a "done when" bar. Treat the task bullets as a starting
decomposition, not a frozen spec — refine at the start of each session
(see [`08-working-sessions.md`](./08-working-sessions.md)).

> **Sequencing rationale:** the review pipeline is the signature feature, but it
> has nothing to operate on without a tenant model and at least one entity type.
> So M0–M1 lay the foundation, **M2 builds the pipeline as early as possible**,
> and everything after rides on it. We deliberately avoid building lots of CRUD
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
  columns (columns now, enforcement in M2).
- Entity CRUD through the **service layer** (not yet routed through the pipeline
  — but written so M2 can slot the pipeline underneath).
- World browser (list/search) + entity detail (fields + markdown).
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
- `Relationship` (typed edges) + `Event` + `EventParticipant` +
  `EventCausality`, all through the pipeline.
- Connections panel on entity detail; basic relationship graph view; timeline;
  causality (cause/effect) view (start simple, list-based, then visual).
- **Done when:** a DM can link entities, log events with participants, and
  traverse cause→effect chains; relationships/events are reviewable + lockable.

## M4 — AI generation (BYO-key)
**Goal:** generate proposals via a provider-agnostic pipeline.
- Provider abstraction + Anthropic and OpenAI adapters; encrypted `AiKey`;
  structured-output + Zod validation; prompt templates (versioned).
- First generators: entity-fleshing, bulk-stub scaffolding, relationship
  inference. Generation panel → Review Queue. Lock-aware context building.
- `Job` table + worker for bulk/async runs; usage/cost tracking; spend caps.
- **Done when:** a DM with their own key can generate entities/relationships that
  land as PENDING proposals respecting locks, then review them.

## M5 — Player crawler interface + sharing
**Goal:** scoped, in-fiction player experience.
- Visibility projection enforced for player reads; player↔crawler linking.
- Crawler sheet, inventory/loot, achievements/titles, System-message feed,
  "known world," and player **suggestions** (→ pipeline).
- **Done when:** a player logs in, sees only shared/own-crawler data (verified by
  tests that pending/secret data never leaks), and can submit a suggestion.

## M6 — Hardening & deploy
**Goal:** make it real.
- Choose host + managed Postgres; production auth/secrets; backups; rate limits;
  audit/provenance review screens; performance pass on graph queries (indexes /
  materialized views); accessibility + responsive polish.
- **Done when:** deployed, a real campaign can be run by a DM + players.

## M7 — Shared canon library & event-consequence AI
**Goal:** leverage and scale.
- Importable canonical DCC content (the 18 floors, common mob types, archetypes)
  as reviewable `IMPORT` change sets.
- Event-consequence generator (propose downstream effects + causal links);
  consistency-check generator (non-mutating → proposals).
- **Done when:** a DM can seed a world from the library and let AI propose
  causal consequences of logged events.

## M8 — Advanced worldbuilding (stretch)
**Goal:** depth features as the world grows.
- Richer graph analytics (centrality, "who's most connected", faction-power
  rollups), Faction-Wars tracker, broadcast/fan-economy modeling, map/zone
  visuals, possibly a light rules-assist layer, real-time collaboration for
  co-DMs.
- **Done when:** scoped per feature when reached.

---

## Dependency graph

```
M0 ──▶ M1 ──▶ M2 ──▶ M3 ──▶ M4 ──▶ M5 ──▶ M6 ──▶ M7 ──▶ M8
                 ▲                          │
                 └────────── M5 also depends on M2 (visibility/pipeline)
```

M2 is the linchpin; nothing after it should introduce a canon write path that
bypasses the pipeline.

## Definition of done (every milestone)

- Migrations committed; service layer covered by unit tests; key flows covered by
  e2e; lint/typecheck green; docs updated if the model changed; provenance/lock
  invariants intact.
