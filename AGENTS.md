# AGENTS.md

Operating guide for any agent (or human) working in this repository. Read this
first, then the plan. Keep it accurate — **if you change how the project is
built or run, update this file in the same change.**

## What this project is

A campaign-management and worldbuilding tool for the **Dungeon Crawler Carl
(DCC) tabletop RPG**. It models a huge, interconnected world as a graph of
entities, relationships, and events; uses AI heavily but keeps the DM in
control; and serves both DMs and players. See [`README.md`](./README.md) for the
pitch and [`docs/`](./docs) for the full plan.

## Current status

🚧 **M0–M5.5 complete; M6 slices 1–6 complete; next up the multi-entity
encounter set-piece generator (waits on M10 operation aliases) and broader
actor-profile studio reuse for M11.** M5.5 (data model hardening — ADR 0011) shipped all five slices: `data` versioning + `readKindData`
seam, the `MIGRATE_ENTITY_DATA` job, reference-integrity badge + impact-aware
archive, orphan report, the greenfield Faction satellite, and the Floor satellite
(slice 5 — the genuine `data → satellite` migration moving FLOOR's
floorNumber/theme/startDay/collapseDay into a 1:1 `Floor` table). The app is scaffolded
and runnable: Next.js 16 (App Router, TS, Tailwind) + Postgres/Prisma 7 +
Auth.js, with full CI + security/quality gates (CodeQL, dependency review,
`npm audit`, migration-drift, coverage). Milestone-by-milestone:

- **M0 — Foundation ✅.** Next.js + Postgres/Prisma + Auth.js scaffold, CI, sign-up
  → create campaign.
- **M1 — Entity core ✅.** Generic-entity + Crawler CRUD, the World Browser, entity
  detail/edit.
- **M2 — Review pipeline ✅.** Every canon write routes through the `review` service
  as a change set with provenance + audit; a Review Queue approves/rejects (with
  per-field accept/edit/reject, supersede, and batch run actions); DMs lock
  entities/fields. This underpins everything — invariants in
  [`docs/03-review-pipeline.md`](./docs/03-review-pipeline.md).
- **M3 — Relationship/event graph ✅.** Any-to-any `Relationship` edges, `Event`s
  (participants + structured effects), and `EventCausality` links route through the
  pipeline; campaign **Graph** and **Timeline** pages; group rosters; derived event
  order (typed `timeRef`, intra-floor `rank`, drag-to-order); causality-consistency
  warnings + "order from causality"; time-bounded membership; **KnowledgeGrant**
  fog-of-war foundation (ENTITY→ENTITY reveals). Floor model unified per ADRs 0004 &
  0008.
- **M3.5 — Tagging ✅(ish).** Tag service + UI (autocomplete, World Browser facet,
  clickable badges); tags are still a `String[]` on `Entity` (no normalized `Tag`
  table — backlog).
- **M4 — AI generation (BYO-key) ✅.** Per-campaign encrypted provider keys
  (AES-256-GCM, ADR 0006); vendor-neutral `LLMProvider` with Anthropic +
  OpenAI-compatible adapters (ADR 0007); generators (entity flesh-out single +
  bulk, relationship inference, bulk-stub scaffolding) that file **PENDING**
  proposals — never canon; usage/cost tracking + DM spend caps; async `Job` table +
  worker (`npm run worker`) for long batches. Secrets never reach client/logs/
  provenance (invariant #6).
- **Cross-cutting ✅.** Visibility collapsed to a binary `DM_ONLY`/`PLAYER_VISIBLE`
  (subset access via `KnowledgeGrant`, not a tier); entity-kind registry (ADR 0009)
  derives validation/data-keys/reviewable-set/form/display from per-type descriptors.
- **M5 — Search & retrieval ✅.** All slices done. Slice 1 (full-text foundation):
  a `SearchDoc` index kept in sync inside entity canon-write transactions + a DM
  backfill; `searchCanon` runs visibility-scoped Postgres full-text (players see
  only `PLAYER_VISIBLE` — invariant #5); a `/campaigns/[id]/search` page wired from
  the topbar + nav. Slice 2 (relationships + events): the indexer/search now cover
  `RELATIONSHIP` and `EVENT` targets too (edge/event apply paths hook the indexer
  in-transaction; typed entity/relationship/event hit union → per-type result
  cards). Their player visibility is two-layer — the doc mirrors `secret`, and the
  endpoint/participant projection is re-applied at retrieval against live canon, so
  a stale index can't leak. Slice 3 materialized the full-text vector as a
  database-generated `SearchDoc.searchVector` column with a GIN index, represented
  in Prisma as optional `Unsupported("tsvector")` so the client never writes it
  and the migration-drift gate stays clean. Slice 4a added the **semantic
  layer**: a pgvector `SearchDoc.embedding`, populated off the request path by
  `EMBED_SEARCH_DOCS` jobs (with a DM "Build semantic index" backfill) via an
  OpenAI-compatible provider — Anthropic has no embeddings API — and `searchCanon`
  now blends full-text `ts_rank` with cosine similarity (**hybrid**). Full-text
  still works with **no AI key**; semantic degrades off gracefully. Slice 4b added
  automatic, deduped `EMBED_SEARCH_DOCS` enqueueing when canon writes change
  searchable content in campaigns with an embedding-capable key, while full-text-only
  campaigns and visibility-only mirror refreshes stay cheap; the manual **Build
  semantic index** action now reuses an active QUEUED/RUNNING semantic job instead
  of creating overlapping paid rebuilds, and DMs can inspect background work in
  `/campaigns/[id]/jobs`. Slice 4c widened
  embeddings to configurable dimensions (`SearchDoc.embeddingDimensions` +
  `AiKey.embeddingDimensions`), added a raw-SQL HNSW cosine expression index for
  the default 1536-dim path, and reshaped hybrid search to preselect ANN-friendly
  semantic candidates before blending with full-text rank. Slice 5 added **Ask the
  Campaign**: a read-only, retrieval-augmented Q&A (`/campaigns/[id]/ask`) that
  retrieves the top-k visibility-scoped canon via `searchCanon`, hands it to the
  BYO-key chat model as numbered sources, and returns a grounded answer whose
  inline `[n]` citations link back to the source entity/relationship/event — never
  writing canon, scoped per requester (a player's ask can't reach DM-only canon).
  Slice 6 wired the retrieval-fed **generator** context: a `retrieval.ts` seam over
  `searchCanon` feeds two generators — relationship inference picks candidate edge
  endpoints by relevance (scoped + lock-aware) instead of an alphabetical dump, and
  flesh-out enrichment hands the model the relevant slice of surrounding canon as
  read-only reference (locked items included) instead of writing in isolation.
  Scaffold-stubs deliberately stays non-retrieval-fed because duplicate avoidance
  needs an exhaustive name check, not a relevance subset; its prompt now receives a
  bounded existing-name sample and the service performs post-hoc canon-name
  collision filtering before filing proposals. With search + Ask + retrieval-fed
  generators, M5's "done when" bar is met.
- **M6 — System AI persona engine 🚧.** Slice 1 delivered the server-side
  foundation: `PersonaSnapshot` canon rows attached to any entity (first focused
  on `SYSTEM_AI`), `CREATE_PERSONA_SNAPSHOT` / `UPDATE_PERSONA_SNAPSHOT` review
  operations, active-snapshot exclusivity, prompt-lock enforcement, compiled
  prompt provenance, a deterministic compiler, and a read-only active System AI
  prompt seam for persona-aware generators. Slice 2 added the DM-only **Persona
  Studio** (`/campaigns/[id]/persona`, built from the console shell): dial
  sliders + agenda/voice fields, a live compiled-prompt preview, prompt
  lock/unlock + activate, the snapshot timeline, and a Review Queue deep-link —
  all auto-approved DM edits. It also wired the active persona into the flesh-out
  generator for dungeon-voiced kinds (BOSS/MOB_TYPE/ITEM/SYSTEM_MESSAGE/
  ACHIEVEMENT/TITLE), recording the driving snapshot id + prompt version in
  provenance (secret agendas never leave the DM-only snapshot). Slice 3 added the
  `PERSONA_SHIFT` event-effect kind: a structured effect that drifts a target
  `SYSTEM_AI`'s active persona by per-dial deltas when the event's effects are
  applied, materializing as a new active snapshot (the prior preserved as
  history) whose provenance points back at the apply change set — so persona
  drift lives in the causality graph (manual shifts work now; it honors persona
  locks and clamps dials). Slice 4 added a compact snapshot-history diff to the
  Persona Studio: each selected snapshot compares itself with its immediate
  predecessor using before→after dial values, concise agenda additions/removals,
  and changed profile fields; the first snapshot has an explicit empty state.
  Slice 5 added the event-consequence generator (the Timeline asks the BYO model
  for bounded effects + causal links on an existing event, filed as one PENDING
  AI change set — including AI-proposed `PERSONA_SHIFT` drift through the pending
  review path). Slice 6 added the persona-aware **dungeon-content generator**: a
  DM briefs the active System AI to *create* one new dungeon-voiced entity (BOSS/
  MOB_TYPE/ITEM/SYSTEM_MESSAGE/ACHIEVEMENT/TITLE) in its current voice, filed as a
  PENDING `CREATE_ENTITY` proposal (the create-from-scratch counterpart to the
  flesh-out generator; persona attribution recorded, degrades to un-flavored when
  no persona is active). Next slices: the multi-entity **encounter** set-piece
  generator (waits on M10's generic operation aliases/dependencies) and broader
  actor-profile studio reuse for M11.

For per-slice detail (files, tests, decisions) see
[`docs/PROGRESS.md`](./docs/PROGRESS.md) — its "Open backlog" section is the
authoritative pickup list — and older completed milestones in
[`docs/PROGRESS-archive.md`](./docs/PROGRESS-archive.md).

## Start here, every session

1. **Read the plan in the order the [README](./README.md) lists** (docs are
   numbered for reading order). At minimum read
   [`docs/00-overview.md`](./docs/00-overview.md),
   [`docs/03-review-pipeline.md`](./docs/03-review-pipeline.md) (the invariants),
   and the milestone you're working on in
   [`docs/11-roadmap.md`](./docs/11-roadmap.md). Also skim the ADRs relevant to
   that milestone.
2. **Find where things stand.** Check `git log`, the codebase, and
   `docs/PROGRESS.md` (create it in M0 and keep it current). Start with
   **"Open backlog from docs / ADRs"**; it is the authoritative list for deferred
   work discovered outside the newest milestone entry.
3. **Pick the lowest-numbered unfinished milestone** in the roadmap. Don't skip
   ahead — dependencies are real (M2 underpins everything).
4. **Decompose it into small vertical slices** (schema → service → minimal UI →
   test). Full process in
   [`docs/12-working-sessions.md`](./docs/12-working-sessions.md).
5. **Build, verify, commit, push.** A milestone may span several sessions/PRs;
   keep each one coherent and green.

## Non-negotiable invariants

These define the product. Do not violate them; cover them with tests once the
relevant milestone exists.

1. **No canon write bypasses the review pipeline** (once M2 exists). All
   mutations go through the `review` service and record **provenance**. Direct DM
   edits are modeled as auto-approved proposals so history stays complete.
2. **AI and imports never silently modify locked targets.** Locked fields/entities
   surface as *blocked* operations for the DM to resolve.
3. **Provenance is permanent** — never discarded on approval. You can always
   answer "where did this come from and who approved it?"
4. **The UI never calls Prisma directly.** Everything goes through the
   service/domain layer (`/src/server/services`), where auth, review, visibility,
   and provenance live.
5. **Players read only via the visibility projection.** Never hand a player query
   raw canon; pending/DM-only/secret content must never reach the client. The
   visibility model is binary: `DM_ONLY` and `PLAYER_VISIBLE`. Subset/partial
   access is modeled via dynamic `KnowledgeGrant` (fog of war), not a visibility
   tier.
6. **Secrets (BYO-key API keys) never reach the client, logs, or provenance.**
   Decrypt only at the server-side provider call.
7. **Relationships are any-to-any** (both endpoints FK to the generic `Entity`);
   type-appropriateness is a UI concern, not a DB constraint.

## Tech stack & conventions

- **Stack:** Next.js (App Router, React, **TypeScript**) + **PostgreSQL** +
  **Prisma**. Auth via Auth.js. Tailwind + shadcn/ui. Zod for validation. Vitest
  (unit) + Playwright (e2e). See [`docs/02-architecture.md`](./docs/02-architecture.md).
- **AI:** bring-your-own-key, provider-agnostic abstraction. The review pipeline
  and persona/agent features are provider-independent.
  ([`docs/04-ai-integration.md`](./docs/04-ai-integration.md).) When writing
  Claude-backed code, prefer the official SDK and use prompt caching for stable
  context; see the `claude-api` skill.
- **Service layer is the only writer of canon.** Keep mutation logic out of route
  handlers/components.
- **Validate at boundaries** with Zod; trust internal code.
- **Design language is codified — follow it.** All UI uses the tokens + primitives
  in [`src/app/globals.css`](./src/app/globals.css) and
  [`src/components/ui`](./src/components/ui) (+ the console shell in
  `src/components/console`). **Match the milestone mockup** in
  [`docs/design/mockup/`](./docs/design/mockup); treat it as the UI acceptance
  target, not loose inspiration. **When a screen has no dedicated `screen-*`
  mockup** (e.g. Settings, Jobs, Canon Integrity), build it from the **console
  screen-shell primitives** — `<ConsoleScreen>` / `<ScreenRail>` / `<ScreenHeader>`
  in [`src/components/console/screen.tsx`](./src/components/console/screen.tsx) —
  instead of hand-rolling the full-bleed rail + HUD-header skeleton (see "Screen
  shell" in the design-language doc). If implementation constraints require a
  deviation, document it in `docs/PROGRESS.md` (or an ADR for durable decisions)
  in the same change. The spec is
  [`docs/13-design-language.md`](./docs/13-design-language.md). Honor the
  provenance/status visual semantics (AI/player/import/locked colors), **never
  hardcode hex values** (use a CSS var or shadcn alias), and keep broadcast FX
  subtle, toggleable, and `prefers-reduced-motion`-aware. **Never ship fake/filler
  data** to make a screen look full — show only real data, and represent unbuilt
  features as visibly "Planned" (the nav already does this), not as stub pages.
- **Doc numbering:** docs use `NN-topic.md` purely for reading order. If you
  insert a doc, renumber the trailing docs, fix cross-references and H1 titles,
  and update the README table. (A `grep` for the old filenames + milestone labels
  catches stragglers — see "Verify".)

## Build / test / run

```bash
# install (postinstall runs `prisma generate`)
npm install

# environment
cp .env.example .env           # then fill in AUTH_SECRET etc.

# database (local)
docker compose up -d db        # Postgres on :5432 (db "dcc"). Uses the
                               #   pgvector/pgvector:pg18 image (Postgres 18 +
                               #   the `vector` extension the M5 semantic-search
                               #   migration enables). A raw `podman/docker run`
                               #   must use that image, not stock postgres:18.
npm run db:migrate             # apply migrations (prisma migrate dev)
npm run db:seed                # seed: dm@example.com / password123

# develop
npm run dev                    # Next.js dev server on :3000
npm run worker                 # Background job worker — needed for async AI
                               #   runs queued via "Run in background" in the
                               #   bulk-flesh panel (M4, plan 006). Not needed
                               #   for synchronous generation or the dev server.

# quality gates (must pass before "done")
npm run lint
npm run typecheck
npm run build
npm run test                   # Vitest unit tests (uses DATABASE_URL; wipes
                               #   User/Campaign/Membership — use a test DB)
npm run test:coverage          # Vitest + V8 coverage; FAILS below the coverage
                               #   floors (the gate CI runs — see Testing below)
npm run test:e2e               # Playwright (downloads a browser first run)
```

Notes:
- **Prisma 7** uses a driver adapter + `prisma.config.ts`; there is no `url` in
  `schema.prisma`, and the client is imported from `@/generated/prisma/client`
  (gitignored, regenerated on install). See `docs/adr/0002`.
- **Auth** uses the JWT session strategy (credentials needs it); see
  `docs/adr/0001`. A generic OIDC provider (id `oidc`) turns on when
  `AUTH_OIDC_ISSUER`/`AUTH_OIDC_ID`/`AUTH_OIDC_SECRET` are set — e.g. a
  self-hosted Authentik. Callback URL: `/api/auth/callback/oidc`.
- Generate an `AUTH_SECRET` with `npx auth secret` or `openssl rand -base64 32`.
- **`AI_KEYS_SECRET`** (M4) encrypts DMs' BYO provider API keys at rest
  (`src/server/crypto.ts`, ADR 0006). Generate with `openssl rand -base64 32`;
  keep it **stable** — rotating it invalidates every stored key (re-entry
  required). Tests pick it up from `.env` via `dotenv/config`.

Environment: copy `.env.example` to `.env`. Never commit secrets (`.env` is
gitignored; `.env.example` is the committed template).

## Testing & coverage

**Good test coverage is part of the definition of done, not an afterthought.**
Every change ships with the tests that cover it; the bar rises as the product
grows.

- **High coverage floors**, enforced in CI. The exact per-metric floors live in
  `vitest.config.ts`. Current gate: **95% statements / 88% branches / 96%
  functions / 96% lines** (branches + funcs/lines ratcheted up 2026-06-27 as
  aggregate reached ~88.9% / 96.8% / 97.0%). Branch coverage is still the metric
  to keep ratcheting toward 90% — the big remaining gaps are `review.ts` and
  `actions.ts`. The `build-and-test` job runs
  `npm run test:coverage`, and those
  thresholds make Vitest exit non-zero (failing the merge) if aggregate coverage
  drops below a floor. Treat them as a **floor, not a target** — ratchet them
  upward as coverage improves; never lower them to make a red build pass. Add the
  missing tests instead. (The separate `Coverage` workflow posts the per-PR trend
  as a comment; that one is report-only.)
- **The service layer is tested against a real Postgres.** Tests for
  `src/server/services/*` (and anything issuing Prisma queries) run against a
  live database — CI provisions one; locally run `docker compose up -d db` (or
  `podman run … postgres:18`) then `npm run db:deploy`. Don't mock Prisma for
  these: tenancy/visibility invariants are the whole point and a mock can't
  verify them. These files share one database and wipe tables between runs, so
  Vitest file parallelism is disabled (`fileParallelism: false`).
- **Pure logic and UI mock their boundaries.** Validation, utils, server
  actions, auth callbacks, and React components/pages mock Prisma, `next-auth`,
  and `next/navigation` — they don't need a database. Keep the NextAuth
  composition in `src/server/auth/index.ts` thin (it can't be imported under
  Vitest because it pulls `next/server`); the testable auth logic lives in
  `src/server/auth/config.ts`.
- **Cover the invariants.** The non-negotiable invariants above must be backed by
  tests once their milestone exists — especially tenancy, the review pipeline,
  and the visibility projection.

## Git workflow

- **Develop on the designated feature branch** for this work (see the task /
  branch instructions). Create it locally if needed.
- Commit in coherent, descriptive chunks. Push with `git push -u origin <branch>`.
- If a full, coherent slice of a milestone has been completed, open a PR.
- Never force-push shared branches, skip hooks, or run destructive git commands
  without explicit instruction.

## Verify before reporting done

- Run lint, typecheck, and `npm run test:coverage` (must stay above the coverage
  floors — see Testing & coverage), plus e2e where relevant.
- For UI work, actually run the app and exercise the flow; for the review
  pipeline and visibility projection, verify the invariants by hand **and** with
  tests.
- Don't claim a milestone complete until its "done when" bar in the roadmap is
  met and the cross-cutting "definition of done" (migrations, tests, docs) holds.

## Keep the plan alive

- **`docs/PROGRESS.md`** — running checklist of milestones/tasks done, with dates
  and PR links. Create in M0; update every session.
- **ADRs** — record decisions future sessions must respect in
  `docs/adr/NNNN-title.md` (context → decision → consequences).
- **Docs are the shared memory across sessions.** If reality diverges from a doc,
  update the doc in the same change rather than letting it rot — especially
  [`docs/01-domain-model.md`](./docs/01-domain-model.md) and
  [`docs/09-data-schema.md`](./docs/09-data-schema.md).
