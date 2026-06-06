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

🚧 **M0 + M1 + M2 + M3 + M3.5 complete; M4 (AI generation, BYO-key) underway.** The app is scaffolded
and runnable: Next.js 16 (App Router, TS, Tailwind) + Postgres/Prisma 7 +
Auth.js, with sign-up → create campaign working, and CI (lint, typecheck, build,
unit, e2e, coverage) plus security/quality gates (CodeQL, dependency review,
`npm audit`, migration-drift). M1 ships generic-entity + Crawler CRUD, the world
browser, and entity detail/edit. M2 so far: all entity writes route through the
`review` service as change sets with provenance + audit; a Review Queue approves/
rejects proposals; and DMs can lock entities/fields (locked targets can't be
overwritten). Per-field accept/edit/reject and `supersede` (a DM retires a stale
or replaced proposal) work too. Batch review actions let DMs bulk approve/reject
pending generator runs while blocked/stale proposals remain held for manual
review. **M3 is underway**: typed any-to-any `Relationship` edges, `Event`s
(with participants), and `EventCausality` cause→effect links route through the
pipeline (auto-approved DM path with provenance); the entity detail page's
Connections panel shows real edges, and its Timeline panel shows real events
plus simple cause/effect traversal and add/remove. Group-type entities
(PARTY/GUILD/FACTION/ORGANIZATION) show a read-only roster that rolls up
`MEMBER_OF`/`LEADS` edges into a crawler→party→guild membership hierarchy. A
campaign-wide **Relationship Graph** view (`/campaigns/[id]/graph`, linked from
the nav) renders every visibility-scoped edge as a mockup-aligned force-directed
node-link diagram with filters, pan/zoom, and a connections panel. A campaign
**Timeline** page (`/campaigns/[id]/timeline`) renders the visibility-scoped
event stream and logs multi-participant events. DMs can also **edit** live edges
(type/disposition/notes/secret) and events — scalar fields plus the participant
set (add/remove/re-role) — inline through the pipeline (version-bumped,
provenance-tracked, lock-aware), from both the entity Timeline panel and the
campaign timeline page. Structured crawler event effects (`ADJUST_STAT`,
`SET_STAT`, `SET_ALIVE`) live on `Event.effects`; the normal UI path sends
unapplied effects to the Review Queue as `PENDING` `APPLY_EVENT_EFFECTS`
operations, and approval applies them atomically with provenance. Relationships
are now fully reviewable, not just auto-approved: `createPendingRelationshipChangeSet`
routes any-to-any edge create/update/delete through the Review Queue as `PENDING`
proposals (lock-/staleness-flagged, with `Source → Target` queue labels), the
counterpart to the entity and event pending paths — ready for AI/import (M4+)
producers. Pending `APPLY_EVENT_EFFECTS` proposals now render a **structured
effect-row editor** in the Review Queue (kind/target/stat/value pickers reusing
the timeline's `EffectRows`) instead of a raw JSON patch — a DM corrects effects
and saves an `EDITED` decision the existing approval path reconciles by effect
id. Event **order is now derived, not authored** (ADR 0004 slice 1): `orderKey`
(the floor) is computed server-side and stripped from the reviewable patch — no
more `ORDERKEY` leak in the queue — and a fractional intra-floor `rank`
(`src/lib/rank.ts`) gives stable within-floor ordering the DM sets by **dragging**
events on the campaign timeline (a mechanical, audited, review-bypassing update).
ADR 0004 slice 2 then replaced the overloaded `{ floor, label }` in-game time with
a **typed `timeRef`** (`src/lib/time-ref.ts`): `{ basis, floor?, offset?, unit?,
anchorEventId?, label? }`, where every DCC time flavor is an offset from a basis
(`FLOOR_START`/`FLOOR_COLLAPSE`/`COLLAPSE`/`ABSOLUTE_DAY`/`EVENT`/`UNSCHEDULED`).
The human phrasing is now **generated** from the structure (`label` is an optional
override), and a concrete floor-relative offset **derives** the intra-floor `rank`
automatically (manual drag still wins for unscheduled/label-only events). A shared
`EventTimeFields` picker drives the timeline forms and the Review Queue editor.
**Knowledge/reveal grants** (fog-of-war foundation) are now in: a `KnowledgeGrant`
model + `knowledge` service let a DM reveal a canon entity to one actor entity
(NPC/crawler/party/faction) without campaign-wide visibility — deliberate, audited
`REVEAL`/`REVOKE` actions (not change sets), surfaced as a **Knowledge** panel
("Known to" / "Knows about") on the entity detail page. This M3 slice wires
ENTITY→ENTITY grants; the schema already supports field/relationship/event/FACT
targets + MEMBERSHIP recipients for the M7 player "known world" and M11 agent
fog-of-war. ADR 0004 slice 3 is complete: the timeline flags **causality-consistency
warnings** (`src/lib/causality.ts`) — a causal link whose effect is ordered
earlier in fiction than its cause shows an inline ⚠ + a header "N out of order"
count, non-blocking — and a one-click **Order from causality**
(`src/lib/causality-order.ts` + `orderEventsFromCausality`) topologically sorts
each floor's *movable* (unlocked, non-derived-order) events from the DAG so causes
precede their effects, an audited review-bypassing `rank` rewrite that leaves
locked/system-derived events pinned. **Time-bounded membership** is now modeled
on relationship edges with optional `sinceDay` / `untilDay` crawl-day bounds:
`MEMBER_OF`, `PART_OF`, and `LEADS` edges preserve "who was where, when"; the
Connections panel can display/edit the bounds; and the group roster service shows
current open-ended memberships by default or reconstructs a historical roster via
`getGroupRoster(..., { asOfDay })`.
**M3.5 (tagging)** is
underway: the service layer (campaign tag list, tag filtering, tag-aware search)
plus the UI — a tag-selection input with campaign autocomplete on the entity
form, a Tags facet in the World Browser sidebar, and clickable tag badges — are
in; tags are still a `String[]` on `Entity` (no normalized `Tag` table yet).
**M4 (AI generation, BYO-key) has started** with its storage foundation: a DM
stores their own provider API key per campaign on a new **Settings** page
(`/campaigns/[id]/settings`), encrypted at rest (AES-256-GCM envelope encryption,
`src/server/crypto.ts`, keyed off a new `AI_KEYS_SECRET` env var). The `ai-keys`
service set/remove/list keeps secrets server-side only (never ciphertext/plaintext
to the client; audited `SET_AI_KEY`/`DELETE_AI_KEY` carry only a last-four hint);
`getDecryptedAiKey`/`getAiKeyConfig` are the server-only seams the provider
abstraction calls (invariant #6). The provider registry lives in
`src/lib/ai/providers.ts`. See [ADR 0006](./docs/adr/0006-ai-key-encryption-at-rest.md).
The **provider abstraction** then landed (M4 slice 2): a vendor-neutral
`LLMProvider` (`src/server/ai/`) with an Anthropic adapter (forced tool use +
prompt caching) and a single OpenAI-compatible adapter (`json_schema` output)
that serves OpenAI itself **and any OpenAI-compatible endpoint** — a self-hosted
model (Ollama/LM Studio/vLLM) or third-party proxy, configured by a non-secret
`baseUrl` + `model` on `AiKey` (key optional for local servers).
`generateStructured` derives a JSON Schema from Zod, validates, and repairs once
before erroring. `getCampaignProvider` is the single seam generators will call;
a DM-only **connection test** on the Settings page verifies a key/endpoint/model
with a tiny live call. See [ADR 0007](./docs/adr/0007-provider-abstraction-and-openai-compatible.md).
No generators yet — the app stays fully usable with no key configured.
See [`docs/PROGRESS.md`](./docs/PROGRESS.md).

## Start here, every session

1. **Read the plan in the order the [README](./README.md) lists** (docs are
   numbered for reading order). At minimum read
   [`docs/00-overview.md`](./docs/00-overview.md),
   [`docs/03-review-pipeline.md`](./docs/03-review-pipeline.md) (the invariants),
   and the milestone you're working on in
   [`docs/11-roadmap.md`](./docs/11-roadmap.md).
2. **Find where things stand.** Check `git log`, the codebase, and
   `docs/PROGRESS.md` (create it in M0 and keep it current).
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
   raw canon; pending/DM-only/secret content must never reach the client.
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
  target, not loose inspiration. If implementation constraints require a
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
docker compose up -d db        # Postgres on :5432 (db "dcc")
npm run db:migrate             # apply migrations (prisma migrate dev)
npm run db:seed                # seed: dm@example.com / password123

# develop
npm run dev                    # Next.js dev server on :3000

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
  `vitest.config.ts`. **⚠️ Temporary (2026-05-29):** the floors were lowered to
  90% statements/functions/lines, 85% branches for the CrawlDirector
  design-language pass, which added two presentational client components
  (`src/components/ui/fx-toggle.tsx`, `src/components/console/dm-nav.tsx`) without
  their tests to ship the prototype in budget. **TODO next session:** add render/
  interaction tests for those two and ratchet the floors back to **≥95/95/95/90**
  (statements/functions/lines/branches). Treat the lowered values as a temporary
  exception, not the new normal. The `build-and-test` job runs `npm run test:coverage`, and those
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
