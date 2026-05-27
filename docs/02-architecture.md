# 02 — Architecture

## Stack (decided)

- **Framework:** Next.js (App Router) + React + TypeScript. Server Components +
  Server Actions / Route Handlers for the API; one deployable codebase.
- **Database:** PostgreSQL.
- **ORM:** Prisma.
- **Auth:** Auth.js (NextAuth v5) with email/password + OAuth providers; session
  via database adapter. Roles enforced server-side.
- **Styling/UI:** Tailwind CSS + a component library (shadcn/ui recommended).
- **Validation:** Zod schemas shared between client and server; every Server
  Action validates input.
- **Background work:** start with synchronous server actions; introduce a job
  queue (e.g. a `Job` table polled by a worker, or a hosted queue) when AI
  generation needs to run async/batched. See [`04-ai-integration.md`](./04-ai-integration.md).
- **Testing:** Vitest (unit), Playwright (e2e), Prisma test DB.

> Rationale: the data is highly relational (graph of entities/edges/events) →
> Postgres. The product is a rich multi-user web UI with server-side auth and
> AI calls that must hold secrets → Next.js full-stack fits without a separate
> backend. Prisma gives typed access and migrations the roadmap leans on.

## High-level shape

```
┌─────────────────────────────────────────────────────────┐
│                      Next.js app                          │
│                                                           │
│  ┌────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  DM Console │   │  Player /     │   │  Auth / account │  │
│  │  (RSC + UI) │   │  Crawler UI   │   │                 │  │
│  └─────┬──────┘   └──────┬───────┘   └────────┬────────┘  │
│        │ server actions  │                     │           │
│  ┌─────▼─────────────────▼─────────────────────▼───────┐  │
│  │              Service / domain layer                   │  │
│  │  campaigns · entities · relationships · events        │  │
│  │  REVIEW PIPELINE (proposals, approve, lock, prov.)    │  │
│  │  visibility/sharing · AI generation orchestration     │  │
│  └─────┬───────────────────────────┬─────────────────────┘ │
│        │ Prisma                     │ provider abstraction   │
│  ┌─────▼──────┐              ┌──────▼───────────────────┐   │
│  │ PostgreSQL │              │  LLM providers (BYO key)  │   │
│  └────────────┘              │  Claude · OpenAI · …      │   │
│                              └───────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Layering rules

1. **UI never touches Prisma directly.** All reads/writes go through the
   service/domain layer (`/src/server/services/*`). This is where authorization,
   the review pipeline, visibility projection, and provenance live.
2. **All canon-mutating paths flow through the review pipeline.** There is no
   "back door" that writes canon without a provenance + lock check. AI, imports,
   and player suggestions all create *proposals*; only DM approval commits canon.
   (Direct DM edits are modeled as auto-approved proposals so provenance is still
   captured — see [`03-review-pipeline.md`](./03-review-pipeline.md).)
3. **Authorization is server-side and campaign-scoped.** Every service call
   takes the acting user + campaign and checks role + visibility before
   returning or mutating data. Never trust client-supplied scope.

## Multi-tenancy & roles

- **Tenant boundary = Campaign.** Every domain row carries `campaignId`.
- **Membership table** maps `(user, campaign) → role`:
  - `OWNER` (DM): full control, manages members, billing/keys.
  - `CO_DM`: edit + review, cannot delete campaign or manage owners.
  - `PLAYER`: read access to player-facing/shared data + their linked
    crawler(s); may create *suggestions* (pending proposals) but cannot approve.
- A **User** can hold different roles across different campaigns (DM in one,
  player in another).
- **Player ↔ Crawler linkage** is explicit: a membership can be associated with
  one or more Crawler entities, which the crawler interface renders.

### Visibility projection

Reads for players go through a **projection** that:
- includes only entities/fields with `visibility ∈ {SHARED_WITH_PLAYERS,
  PLAYER_FACING}` (or that belong to the player's own crawler),
- strips `secret` relationship/edge attributes and DM-only fields,
- hides everything still in `PENDING`/`DRAFT` unless the DM explicitly shares.

This projection is the *only* way player-facing surfaces read data.

## Secrets & API keys

- DM-supplied LLM API keys are encrypted at rest (envelope encryption; app holds
  a KMS/`ENCRYPTION_KEY`, keys stored encrypted per campaign or per user).
- Keys are decrypted only inside the server-side provider call; never sent to the
  client, never logged, never included in provenance.
- See [`04-ai-integration.md`](./04-ai-integration.md) for the provider
  abstraction.

## Directory layout (proposed)

```
/prisma
  schema.prisma
  migrations/
/src
  /app
    /(dm)/...            # DM console routes
    /(player)/...        # crawler interface routes
    /(auth)/...          # sign-in/up, account
    /api/...             # webhooks, AI callbacks if needed
  /server
    /services            # domain layer (campaigns, entities, review, ai, ...)
    /auth                # Auth.js config, role guards
    /ai                  # provider abstraction + generators + prompts
    /review              # proposal engine, locking, provenance
    /db.ts               # Prisma client
  /lib                   # shared utils, zod schemas
  /components            # UI components
/docs                    # these planning docs
/tests
```

## Cross-cutting concerns

- **Auditing:** every approval/rejection/lock writes an audit record (who, when,
  what diff). Provenance + audit together give full history.
- **Optimistic concurrency:** entities carry a `version`; proposals reference the
  base version they were generated against so the DM is warned if canon moved
  underneath a stale proposal.
- **Soft delete / archive** preserves causal history.
- **Performance:** index `campaignId` everywhere; the relationship/causality
  graph views need composite indexes on edge `(campaignId, sourceId)` /
  `(campaignId, targetId)`. Consider materialized views later if graph traversal
  gets heavy.
- **Search & retrieval:** a hybrid full-text + vector (pgvector) index over canon
  powers both the search/"Ask the Campaign" UI and retrieval-augmented context
  for generators/agents. Retrieval is campaign-scoped and visibility-filtered like
  every other read. Embeddings are derived data (regenerable, never in
  provenance), re-indexed asynchronously via the `Job` worker on canon change.
  See [`07-search-retrieval.md`](./07-search-retrieval.md).
- **Data portability:** because the DM owns canon and the hosting may be
  ephemeral, a campaign can be **exported** (structured JSON + human-readable
  Markdown, provenance included) and **imported** (as reviewable `IMPORT` change
  sets). Scheduled backups in production. This is a first-class trust feature, not
  an afterthought — hardened in M9.

## Deployment (deferred but noted)

Any Node-hosting + managed Postgres (e.g. Vercel + Neon/Supabase, or a single
container + Postgres). The first build session does not need to commit to a host;
local Docker Postgres is enough. Revisit at M9.
