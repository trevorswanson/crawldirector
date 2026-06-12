# Plan 001: Cover the review pipeline and player visibility with end-to-end tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bd64af7..HEAD -- tests/e2e playwright.config.ts src/app src/components`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `bd64af7`, 2026-06-12

## Why this matters

The review pipeline (pending → approve → lock) is this product's signature
feature, and the player-visibility projection is product invariant #5
("pending/DM-only/secret content must never reach the client"). Both have deep
unit/integration coverage against a real Postgres, but the e2e suite contains
exactly one spec file (`tests/e2e/auth-flow.spec.ts`, 2 tests: sign-up and an
auth redirect). Nothing verifies these flows in a real browser, where RSC
boundaries, server actions, and revalidation can break in ways jsdom tests
miss (this repo has hit exactly that class of bug before — server components
calling functions from "use client" modules pass jsdom and fail in the
browser). M7 will ship a player-facing surface on top of the visibility
projection; these specs are the safety net that must exist before then, and
before any refactor of the review service (see plan 002).

## Current state

- `tests/e2e/auth-flow.spec.ts` — the only e2e spec; the structural exemplar
  for everything you write. Its sign-up preamble:

  ```ts
  // tests/e2e/auth-flow.spec.ts:5-22
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E DM");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password12345");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Your crawls" })).toBeVisible();
  await page.getByLabel("Crawl name").fill("Floor One");
  await page.getByRole("button", { name: "Create crawl" }).click();
  await expect(page).toHaveURL(/\/campaigns\//);
  ```

- `playwright.config.ts` — `testDir: "./tests/e2e"`, `workers: 1`, baseURL
  `http://localhost:3000`, `webServer: { command: "npm run dev", reuseExistingServer: !CI }`.
  The e2e tests run against the dev server and the `.env` `DATABASE_URL`
  database. Tests must therefore create their own users/campaigns with unique
  names (the `Date.now()` email pattern above) and never assume an empty DB.

- **Which flows can produce a PENDING review item through the UI** (critical —
  do not waste time hunting for others): direct DM entity/relationship/event
  edits are *auto-approved* by design. The two DM-reachable paths that land
  PENDING items in the Review Queue without an AI provider key are:
  1. **Event effects**: creating/editing an event with structured crawler
     effects (`ADJUST_STAT`, `SET_STAT`, `SET_ALIVE`) files a PENDING
     `APPLY_EVENT_EFFECTS` operation; approving it in the Review Queue applies
     the stat change to the crawler atomically.
  2. AI generation — requires a live provider key; **out of scope** for e2e.

- Key UI surfaces (read each file before writing the spec that drives it, to
  get exact labels/roles — do not guess selectors):
  - World Browser page: `src/app/(dm)/campaigns/[id]/page.tsx` — facets,
    card grid, `QuickCreateStub` (from
    `src/components/entities/entity-forms.tsx`), "Create Entity" button,
    "No entities match." empty state.
  - Entity detail/edit: `src/app/(dm)/campaigns/[id]/entities/[entityId]/`
    and `src/components/entities/` (forms, lock controls, GeneratePanel).
  - Review Queue: `src/app/(dm)/campaigns/[id]/review/page.tsx` and
    `src/components/review/` (per-operation diff editor, approve/reject,
    `EffectRows` editor for `APPLY_EVENT_EFFECTS`).
  - Campaign timeline: `src/app/(dm)/campaigns/[id]/timeline/page.tsx` and
    `src/components/timeline/` (event form incl. effects section —
    `event-effects-section`).
- There is **no UI to add a player member to a campaign** (membership
  management is M9 backlog). The visibility spec must insert the `Membership`
  row directly in the database (see Step 5) — this is test setup, not a
  product path.
- Roles: `Role` enum is `OWNER | CO_DM | PLAYER` (`prisma/schema.prisma:18`).
  Membership table: `model Membership { userId, campaignId, role, … @@unique([userId, campaignId]) }`
  (`prisma/schema.prisma:275`).
- Visibility: binary `DM_ONLY` / `PLAYER_VISIBLE` on entities; events have a
  `secret` boolean that hides them from players.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 (postinstall runs `prisma generate`) |
| Start DB | `docker compose up -d db` (or podman equivalent) | Postgres on :5432, db `dcc` |
| Migrate | `npm run db:deploy` | exit 0 |
| E2E (first run downloads a browser) | `npm run test:e2e` | exit 0, all specs pass |
| One spec | `npx playwright test tests/e2e/<file>` | exit 0 |
| Lint / typecheck | `npm run lint && npm run typecheck` | exit 0 |

Note: `npm run test` / `test:coverage` (unit suite) **wipes tables** in the
configured database. The e2e suite does not, but shares the same dev DB.
Don't run the unit suite while a dev server session you care about is live.

## Scope

**In scope** (the only files you should create/modify):
- `tests/e2e/helpers.ts` (create)
- `tests/e2e/world-browser.spec.ts` (create)
- `tests/e2e/review-effects.spec.ts` (create)
- `tests/e2e/locks.spec.ts` (create)
- `tests/e2e/visibility.spec.ts` (create)

**Out of scope** (do NOT touch):
- Any file under `src/` — if a flow can't be exercised because the UI lacks an
  affordance, that's a STOP condition, not a reason to change the app.
- `playwright.config.ts` — current config (workers: 1, dev-server) is fine.
- AI generation flows (need live provider keys).
- `tests/unit/**`.

## Git workflow

- Branch **from `main`**: `improve/001-e2e-core-flows`
- Commit style: conventional commits, e.g. `test(e2e): cover review queue effect approval`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract a shared sign-up/campaign helper

Create `tests/e2e/helpers.ts` exporting:

- `signUpAndCreateCampaign(page, { name?: string })` — performs the exact
  preamble from `auth-flow.spec.ts` (unique email via `Date.now()` + a random
  suffix so two specs in the same millisecond don't collide), returns
  `{ email, campaignId }` (parse the campaign id from `page.url()` after the
  `/campaigns/` redirect).
- `signIn(page, email, password)` — drives `/sign-in`.

Do **not** modify `auth-flow.spec.ts` to use the helper (keep the existing
spec byte-identical; it's the known-green baseline).

**Verify**: `npx playwright test tests/e2e/auth-flow.spec.ts` → 2 passed.

### Step 2: World Browser CRUD spec

`tests/e2e/world-browser.spec.ts`, using the helper:

1. Create a campaign; quick-create a stub entity (read
   `src/components/entities/entity-forms.tsx` for the `QuickCreateStub`
   labels); assert it appears in the card grid.
2. Create a full entity via "Create Entity" (pick a simple type like NPC; fill
   name + summary); assert redirect/visibility in the browser and that the
   entity detail page renders the summary.
3. Use the type facet in the sidebar to filter; assert the list narrows.

**Verify**: `npx playwright test tests/e2e/world-browser.spec.ts` → all passed.

### Step 3: Review Queue spec via event effects

`tests/e2e/review-effects.spec.ts`:

1. Create a campaign and a CRAWLER-type entity (the crawler form has stat
   fields — read the form component for labels; HP defaults exist).
2. From the campaign timeline page (`/campaigns/<id>/timeline`), create an
   event with one structured effect (e.g. `ADJUST_STAT` on the crawler's HP —
   read `src/components/timeline/` and the `event-effects-section` component
   for the picker labels).
3. Assert the Review Queue (`/campaigns/<id>/review`) now shows a PENDING
   change set containing an `APPLY_EVENT_EFFECTS` operation.
4. Approve it; assert the queue empties and the crawler's detail page shows
   the adjusted stat.

**Verify**: `npx playwright test tests/e2e/review-effects.spec.ts` → all passed.

### Step 4: Locks spec

`tests/e2e/locks.spec.ts`:

1. Create a campaign + entity; lock it (or one field) from the entity detail
   page (read the lock controls in `src/components/entities/` for labels).
2. Assert the locked state is visible (lock badge/pill) and the edit path
   refuses or hides the locked field.

**Verify**: `npx playwright test tests/e2e/locks.spec.ts` → all passed.

### Step 5: Player-visibility projection spec

`tests/e2e/visibility.spec.ts`:

1. DM session: create a campaign; create one entity with visibility
   `DM_ONLY` and one with `PLAYER_VISIBLE` (the entity form has a visibility
   control); create one timeline event marked secret and one normal.
2. Sign up a second user via the UI (unique email). There is no invite UI, so
   add the membership directly: use the `pg` package (already a dependency)
   with `process.env.DATABASE_URL` (load via `dotenv/config`) to `INSERT INTO
   "Membership" (id, "userId", "campaignId", role, "createdAt") VALUES
   (<cuid-ish unique string>, <user id>, <campaign id>, 'PLAYER', now())`.
   Resolve the user id with a query on `"User"` by email. Close the client.
   Put this in `helpers.ts` as `addPlayerMembership(email, campaignId)`.
3. Player session: sign in as the second user, open the campaign. Assert:
   - the `PLAYER_VISIBLE` entity is listed; the `DM_ONLY` entity is **not**
     (neither in the browser list nor reachable by direct URL — expect 404);
   - the timeline shows the normal event and **not** the secret one;
   - no Review Queue / settings / generation affordances are offered to the
     player (assert at minimum that `/campaigns/<id>/review` does not render
     the queue for the player — read `review/page.tsx` to see whether it 404s
     or redirects, and assert that).

**Verify**: `npx playwright test tests/e2e/visibility.spec.ts` → all passed.

### Step 6: Full suite + gates

**Verify**: `npm run test:e2e` → exit 0, ≥ 10 tests passed (2 existing + ≥ 8
new). Then `npm run lint && npm run typecheck` → exit 0.

## Test plan

This plan *is* tests. Pattern: `tests/e2e/auth-flow.spec.ts`. Each spec is
self-contained (own user + campaign), uses role/label selectors (no CSS
classes — the design system classes are not a contract), and relies on
Playwright auto-waiting (no `waitForTimeout`).

## Done criteria

- [ ] Four new spec files + `helpers.ts` exist in `tests/e2e/`
- [ ] `npm run test:e2e` exits 0 with ≥ 10 passing tests
- [ ] `npm run lint` and `npm run typecheck` exit 0
- [ ] `git status` shows no modified files outside `tests/e2e/`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The event-effects form does not exist on the timeline page, or effects do
  not land as PENDING in the Review Queue (the product flow has changed).
- You cannot determine the campaign id from the URL after creation.
- The `Membership` insert in Step 5 fails against the live schema (column
  names drifted) — do not start mutating other tables to compensate.
- Any flow requires modifying a file under `src/` to be testable.
- A spec is flaky across 3 consecutive runs after removing timing assumptions.

## Maintenance notes

- Plan 002 (bulk-approve hardening) and any future review.ts refactor should
  land *after* this suite is green — these specs are their regression net.
- When M9 adds a real membership-invite UI, replace `addPlayerMembership`'s
  direct DB insert with the UI flow.
- When M7 builds the player surface, extend `visibility.spec.ts` rather than
  starting a new file — it already owns the projection scenario.
- The suite runs serially (workers: 1) against the dev DB; if it gets slow,
  parallelize by giving Playwright its own database before raising workers.
