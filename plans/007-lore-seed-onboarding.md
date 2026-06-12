# Plan 007: Offer "seed with DCC lore" at campaign creation (productize the existing seeder)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bd64af7..HEAD -- src/server/services/seeding.ts src/components/campaigns/create-campaign-form.tsx "src/app/(dm)/actions.ts" src/server/jobs prisma/schema.prisma`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/006-job-table-worker.md (hard — seeding runs as a Job); plans/003-pagination-world-browser-timeline.md (soft — a seeded campaign has 1,660 entities; ship pagination first or the browser chokes)
- **Category**: direction
- **Planned at**: commit `bd64af7`, 2026-06-12

## Why this matters

The repo ships the complete DCC lore dataset
(`dungeon-crawler-carl.jsonl`, ~1,660 records) and a finished, tested
importer — `seedCampaignFromLore` in `src/server/services/seeding.ts` —
that classifies each record into an `EntityType`, extracts
summary/description, and files everything **through the review pipeline**
(auto-approved change sets with provenance, invariant #1 intact). But the
only way to run it is a dev-only CLI (`scripts/seed-lore.ts`) hardwired to
the `dm@example.com` seed user. A new DM gets an empty world and no
discoverable path to the lore. One opt-in checkbox at campaign creation
turns the project's best onboarding asset into a product feature.

## Current state

- `src/server/services/seeding.ts` — the importer:
  - `seedCampaignFromLore(userId, campaignId, options?)` (line 132): checks
    membership (rejects PLAYER), reads
    `path.join(process.cwd(), "dungeon-crawler-carl.jsonl")`, parses each
    JSONL line (`{ text, meta }`, title from a leading `#Title` line),
    classifies (`classifyEntity`, line 22), batches `CREATE_ENTITY` patches
    100 at a time through `applyAutoApprovedEntityChangeSet`, returns
    `{ count }`. Options: `{ limit?, clearExisting? }`.
  - Convention deviations to fix while wiring (Step 1): it throws plain
    `Error`, not `ServiceError` (lines 142, 148).
  - **`clearExisting` must never be exposed to the UI**: it hard-deletes the
    campaign's entities, change history, *and audit logs* (lines 151-163) —
    in tension with invariant #3 ("provenance is permanent"). It exists for
    the dev script only.
- `scripts/seed-lore.ts` — dev CLI; stays as-is (still useful for re-seeding
  a dev DB).
- `src/components/campaigns/create-campaign-form.tsx` — the dashboard's
  "Create crawl" form ("Crawl name" label, "Create crawl" button), submitting
  to `createCampaignAction`.
- `src/app/(dm)/actions.ts:83-107` — `createCampaignAction`: parses
  `{ name, summary }` via `createCampaignSchema`, calls `createCampaign`,
  then `redirect(\`/campaigns/${campaignId}\`)`.
- Plan 006 (prerequisite) provides: `Job` model, `JobKind` enum,
  `enqueueJob(userId, campaignId, kind, payload)` in
  `src/server/services/jobs.ts`, handler registry in
  `src/server/jobs/handlers.ts`, and the worker process. **If plan 006 is
  not DONE in `plans/README.md`, stop now.**
- Why a job and not inline: 1,660 entities × review-pipeline writes ≈ 17
  batched change-set transactions — tens of seconds. That cannot run inside
  the create-campaign server action.
- Visibility: seeded lore is published source material; the importer already
  sets `PLAYER_VISIBLE` (seeding.ts:201). Keep that.
- Test conventions: `tests/unit/seeding.test.ts` exists (real Postgres) —
  extend it; it shows how the importer is currently exercised (uses
  `limit` to keep runs fast).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Start DB / migrate | `docker compose up -d db && npm run db:deploy` | exit 0 |
| Unit + coverage gate | `npm run test:coverage` | exit 0; floors hold |
| One test file | `npx vitest run tests/unit/seeding.test.ts` | all pass |
| Lint / typecheck / build | `npm run lint && npm run typecheck && npm run build` | exit 0 |
| Manual end-to-end | `npm run dev` + `npm run worker` | see Step 4 verify |

The unit suite **wipes tables** in the configured DB.

## Scope

**In scope**:
- `prisma/schema.prisma` + migration (one enum value: `LORE_SEED` on `JobKind`)
- `src/server/services/seeding.ts` (ServiceError conversion + an emptiness guard)
- `src/server/jobs/handlers.ts` (LORE_SEED handler)
- `src/components/campaigns/create-campaign-form.tsx` (checkbox)
- `src/app/(dm)/actions.ts` (`createCampaignAction` only)
- `tests/unit/seeding.test.ts`, `tests/unit/dm-actions.test.ts`,
  the create-form component test (find it: `ls tests/unit | grep -i campaign`)

**Out of scope** (do NOT touch):
- `clearExisting` exposure anywhere in UI/actions — never.
- `scripts/seed-lore.ts` — unchanged (verify it still compiles, nothing more).
- `classifyEntity` / `extractSummaryAndDescription` heuristics — imperfect
  classification is accepted; entities are editable.
- The jsonl dataset itself.
- Progress UI / streaming status — the Job status line from plan 006's panel
  pattern is not replicated here; the World Browser filling up *is* the
  feedback (plus the job row in the DB).

## Git workflow

- Branch **from `main`**: `improve/007-lore-seed-onboarding`
- Commit style: conventional commits, e.g. `feat(seeding): opt-in DCC lore seed at campaign creation`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Service hygiene + idempotency guard

In `src/server/services/seeding.ts`:

- Replace the two plain `Error` throws (membership at line 142, missing file
  at line 148) with `ServiceError` (import from `@/lib/errors`), keeping the
  messages.
- Add a guard right after the membership check: when called **without**
  `clearExisting`, refuse to seed a non-empty campaign —
  `const existing = await prisma.entity.count({ where: { campaignId } });
  if (existing > 0 && !options?.clearExisting) throw new ServiceError("This
  campaign already has entities — lore seeding only runs on an empty
  campaign.");` This makes the job safe against double-enqueue and
  re-running a failed job on a partially seeded campaign (a partial seed +
  retry would otherwise duplicate entities).

**Verify**: `npx vitest run tests/unit/seeding.test.ts` → existing tests pass
(update any that asserted plain `Error` if needed).

### Step 2: LORE_SEED job kind + handler

- `prisma/schema.prisma`: add `LORE_SEED` to `enum JobKind`;
  `npm run db:migrate` (name: `add_lore_seed_job_kind`).
- `src/server/jobs/handlers.ts`: add

  ```ts
  LORE_SEED: async (job) => {
    // Payload is empty by design — the dataset path and visibility policy are
    // fixed server-side; nothing user-controlled flows in (clearExisting is
    // deliberately not reachable from here).
    return seedCampaignFromLore(job.createdById, job.campaignId);
  },
  ```

  following the registry's existing shape from plan 006.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Checkbox + action wiring

- `create-campaign-form.tsx`: add an unchecked-by-default checkbox, name
  `seedLore`, label "Start with official DCC lore (~1,660 entities, imports
  in the background)". Match the form's existing field markup and design
  primitives exactly (read the file; no new styles, no hex).
- `createCampaignAction` (`src/app/(dm)/actions.ts:83`): after
  `createCampaign` succeeds and before the `redirect`, when
  `formData.get("seedLore") === "on"`, call
  `enqueueJob(user.id, campaignId, "LORE_SEED", {})` inside its own
  try/catch: an enqueue failure must **not** fail campaign creation — log it
  via the action-error logging convention (use `logActionError` if plan 005
  landed — check `src/server/log.ts` exists — else `console.error`) and
  continue to the redirect. Note: code after `redirect(...)` never runs;
  the enqueue must be *before* the redirect call.

**Verify**: `npm run build` → exit 0.

### Step 4: End-to-end check

With `npm run dev` and `npm run worker` running and a clean dev login:
create a campaign with the box checked → redirected immediately; within
~a minute the worker logs the LORE_SEED job SUCCEEDED and the World Browser
shows lore entities (tags include `lore`), paginated if plan 003 landed.
A second LORE_SEED on the same campaign (enqueue manually via the service in
a node REPL, or rely on the unit test) fails with the non-empty message.

**Verify**: job row `status = SUCCEEDED`; `prisma.entity.count` for the
campaign ≈ 1,400–1,660 (some JSONL lines lack a `#Title` and are skipped —
exact count is data-dependent; assert > 1,000 in tests that seed unlimited,
but prefer `limit` in tests, see Test plan).

## Test plan

- `tests/unit/seeding.test.ts` (extend; keep runs fast with `limit`):
  - non-empty campaign without `clearExisting` → ServiceError with the
    "already has entities" message;
  - PLAYER membership → ServiceError (now typed — adjust the existing
    assertion if it expected plain Error);
  - `{ limit: 5 }` on an empty campaign still creates 5 entities with
    provenance (existing behavior pinned).
- Handler delegation test (wherever plan 006 put handler tests): LORE_SEED
  calls `seedCampaignFromLore(job.createdById, job.campaignId)` — mock the
  seeding module, assert args.
- `tests/unit/dm-actions.test.ts` (mock-style per the file): with
  `seedLore=on`, `createCampaignAction` calls `enqueueJob` with
  `("LORE_SEED", {})`-shaped args then redirects; without it, no enqueue;
  enqueue throwing still redirects.
- Create-form component test: checkbox renders unchecked with the right
  name/label.

## Done criteria

- [ ] Checkbox on the create form; unchecked default; checked path enqueues
      exactly one LORE_SEED job
- [ ] Seeding a non-empty campaign is refused (test passes)
- [ ] `grep -rn "clearExisting" src/app src/components` → no matches
- [ ] `npm run test:coverage`, `lint`, `typecheck`, `build` all exit 0
- [ ] `docs/PROGRESS.md` gets a short dated entry for this slice (match the
      existing entry format) — the repo treats PROGRESS as mandatory
- [ ] `git status` clean outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 006 is not DONE (no `Job` model / `enqueueJob` / worker present).
- `create-campaign-form.tsx` doesn't match the described form (drift).
- The seeding service's signature or batching changed since `bd64af7`.
- Adding the enum value triggers anything beyond a trivial migration
  (Postgres enum-value adds are normally additive; if Prisma generates a
  DROP/CREATE TYPE swap instead, stop — this repo has been burned by
  in-place enum swaps and stale connections before).

## Maintenance notes

- After an in-place Postgres enum migration, **restart the dev server**
  before manual verification (stale connections misread swapped enums —
  known repo gotcha).
- Future: M10 (shared library import) generalizes this into arbitrary
  imports; this checkbox is the special case. When M10 lands, fold LORE_SEED
  into the general import-job kind rather than keeping both.
- Consider (deferred, not in this plan): removing `clearExisting` from the
  service entirely once the dev script no longer needs it — its audit-log
  deletion sits badly with invariant #3.
- Reviewer focus: enqueue-before-redirect ordering in the action, and that
  a failed enqueue can't fail campaign creation.
