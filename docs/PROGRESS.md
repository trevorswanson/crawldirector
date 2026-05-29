# PROGRESS

Running checklist of milestones/tasks, newest first. See
[`11-roadmap.md`](./11-roadmap.md) for the full plan and
[`12-working-sessions.md`](./12-working-sessions.md) for how to pick up work.

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
