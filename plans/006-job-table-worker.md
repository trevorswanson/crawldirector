# Plan 006: Build the async Job table + worker (last M4 item, M5 prerequisite)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ffa444f..HEAD -- prisma/schema.prisma src/server/services/generation.ts src/components/entities/bulk-flesh-panel.tsx "src/app/(dm)/actions.ts" docker-compose.yml AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (plan 007 depends on this; see also plan 004's note on cross-process cap serialization)
- **Category**: direction
- **Planned at**: commit `bd64af7`, 2026-06-12; reconciled at `ffa444f`,
  2026-06-13 (drift was additive only: plan 004's `withCampaignAiLock`
  wrappers + plan 005's `logActionError` landed in the two in-scope files;
  excerpts below re-verified, line numbers refreshed)

## Why this matters

This is the last open M4 item in `docs/PROGRESS.md` ("a `Job` table + worker
for bulk/async runs — long batches off the request path, notifying the DM
when ready") and `docs/04-ai-integration.md` §"Async / batching" specifies
it: *"Introduce a `Job` table + worker for bulk runs and long generations so
the UI isn't blocked; jobs land Change Sets in the queue and notify the DM
when ready."* M5 (search/retrieval) plans async re-indexing on top of the
same primitive, so building it now as a clean slice keeps M5 from having to
build its own prerequisite mid-milestone. The concrete first consumer is the
bulk flesh-out panel, which today runs up to 20 sequential provider calls
inside one server-action request.

## Current state

- `docs/PROGRESS.md` "Open backlog" → "M4 generator expansion. Remaining: a
  `Job` table + worker for bulk/async runs (long batches off the request
  path, notifying the DM when ready)."
- `src/server/services/generation.ts:251-338` — `fleshOutEntities(userId,
  campaignId, entityIds: string[]): Promise<BulkFleshResult>`: validates,
  resolves provider once, loops ≤20 entities calling `fleshOutEntity` each,
  returns `{ outcomes, proposedCount, skippedCount, model }` (the
  `BulkFleshResult` type at line 89). This function is the job handler's
  entire payload — the worker just calls it. Note: `fleshOutEntities` is
  deliberately NOT wrapped in `withCampaignAiLock` (each per-entity
  `fleshOutEntity` acquires the lock independently — see the comment at
  lines 247-250); the handler is unaffected, it still just calls it as-is.
- `src/components/entities/bulk-flesh-panel.tsx` — "Flesh out with AI" panel
  in the World Browser header; checklist of stub candidates; submits a form
  to `fleshOutEntitiesAction` (`src/app/(dm)/actions.ts`), which reads
  multi-valued `entityIds`, calls the service synchronously, revalidates,
  and renders a per-entity Proposed/Skipped summary.
- Schema conventions (`prisma/schema.prisma`): cuid string ids, enums at the
  top of the file, `campaignId` FK with `onDelete: Cascade` to Campaign,
  `createdById` to User, `createdAt`/`updatedAt` timestamps, `@@index` on
  query patterns (see `model AiUsage` at line 653 for the closest exemplar —
  including its style of explanatory header comment).
- Migrations: `npm run db:migrate` (`prisma migrate dev`) creates them; CI
  has a migration-drift gate, so schema and migration must move together.
- Process model: `npm run dev` / `next start` is the only process today.
  `docker-compose.yml` defines `db` and the app; `scripts/seed-lore.ts` shows
  the repo's pattern for standalone tsx scripts using `@/server/*` imports.
- AGENTS.md rule: "if you change how the project is built or run, update
  this file in the same change."
- Service-layer test conventions: real Postgres, table wipes in
  `beforeEach`, no Prisma mocks (exemplar:
  `tests/unit/review-batch-actions.test.ts`); generation tests stub the
  provider seam (`tests/unit/generation.test.ts` — read it before Step 5).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Start DB | `docker compose up -d db` (or podman) | Postgres :5432, db `dcc` |
| New migration | `npm run db:migrate` | migration created + applied, client regenerated |
| Unit + coverage gate | `npm run test:coverage` | exit 0; floors 95/85/95/95 hold |
| Lint / typecheck / build | `npm run lint && npm run typecheck && npm run build` | exit 0 |
| Worker (after Step 4) | `npm run worker` | logs "worker started", polls without error |

The unit suite **wipes tables** in the configured DB.

## Scope

**In scope**:
- `prisma/schema.prisma` + the generated migration (new `Job` model + enums)
- `src/server/services/jobs.ts` (create)
- `src/server/jobs/handlers.ts` (create)
- `scripts/worker.ts` (create) + a `"worker"` script in `package.json`
- `src/app/(dm)/actions.ts` (one new action: `enqueueBulkFleshAction`)
- `src/components/entities/bulk-flesh-panel.tsx` (background-run affordance)
- `docker-compose.yml` (worker service), `AGENTS.md` (run instructions)
- Tests: `tests/unit/jobs.test.ts` (create), `tests/unit/bulk-flesh-panel.test.tsx` (extend), `tests/unit/dm-actions.test.ts` (extend)

**Out of scope** (do NOT touch):
- Push/email/real-time notification — "notify the DM" is satisfied for now
  by proposals appearing in the Review Queue plus the panel's job-status
  line; a notification system is its own slice.
- Retry UI, job-management/admin UI, cancellation.
- M5 indexing job kinds — the registry makes them one entry later.
- `fleshOutEntities` internals (the handler calls it as-is).
- Multi-worker concurrency (single worker process is an explicit assumption,
  documented in code).

## Git workflow

- Branch **from `main`**: `improve/006-job-table-worker`
- Commit per step; conventional commits, e.g. `feat(jobs): Job table + single-worker claim loop (M4)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Schema

Add to `prisma/schema.prisma`, following the `AiUsage` model's comment style:

```prisma
enum JobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
}

enum JobKind {
  BULK_FLESH
}

// Async work queue (M4 — docs/04-ai-integration.md §"Async / batching"): long
// or bulk generation runs execute off the request path in the worker
// (scripts/worker.ts). Jobs only ever *file proposals* through the existing
// services — a job never writes canon directly (invariant #1) and its payload
// carries no secret (invariant #6).
model Job {
  id         String    @id @default(cuid())
  campaignId String
  createdById String
  kind       JobKind
  status     JobStatus @default(QUEUED)
  // Handler input (e.g. { entityIds: [...] } for BULK_FLESH). No secrets.
  payload    Json
  // Handler output on success (e.g. fleshOutEntities' outcome summary).
  result     Json?
  // Safe message on failure (ServiceError text only — never raw provider text).
  error      String?
  attempts   Int       @default(0)
  maxAttempts Int      @default(1)
  runAfter   DateTime  @default(now())
  startedAt  DateTime?
  finishedAt DateTime?

  campaign  Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  createdBy User     @relation("CreatedJobs", fields: [createdById], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, runAfter])
  @@index([campaignId, createdAt])
}
```

Add the back-relations on `Campaign` (`jobs Job[]`) and `User`
(`createdJobs Job[] @relation("CreatedJobs")`). `maxAttempts` defaults to 1:
generation runs are paid and not idempotent-by-retry (each retry re-spends),
so no automatic retry for BULK_FLESH; the field exists so M5 indexing jobs
can opt in.

Run `npm run db:migrate` (name: `add_job_table`).

**Verify**: `npm run db:migrate` exits 0; `npm run typecheck` exits 0.

### Step 2: Jobs service

`src/server/services/jobs.ts`, following the service conventions (every
public function takes `userId` first and enforces membership; `ServiceError`
for expected failures):

- `enqueueJob(userId, campaignId, kind, payload)` — DM/co-DM only (copy the
  `assertCampaignDm` membership-check pattern from
  `src/server/services/generation.ts:47-56`); creates a QUEUED row; returns
  `{ id }`.
- `listRecentJobs(userId, campaignId, take = 5)` — DM/co-DM only; newest
  first; selects display fields only (id, kind, status, error, result,
  createdAt, finishedAt).
- `claimNextJob()` — **worker-internal, not user-facing**: find the oldest
  QUEUED job with `runAfter <= now()`, claim it with an optimistic
  `updateMany({ where: { id, status: "QUEUED" }, data: { status: "RUNNING",
  startedAt: new Date(), attempts: { increment: 1 } } })`; claimed only if
  `count === 1`, else retry the find (loop). Single-worker assumption — say
  so in a comment; `updateMany`'s guarded where keeps even an accidental
  second worker from double-claiming.
- `completeJob(id, result)` / `failJob(id, safeMessage)` — set
  SUCCEEDED/FAILED, `finishedAt`, `result`/`error`.

**Verify**: `npx vitest run tests/unit/jobs.test.ts` (written in Step 5,
service part) → pass. Until then: `npm run typecheck` → exit 0.

### Step 3: Handler registry + worker loop

- `src/server/jobs/handlers.ts`:

  ```ts
  import { fleshOutEntities } from "@/server/services/generation";
  import type { Job } from "@/generated/prisma/client";

  // Each handler returns a JSON-serializable result. Payloads were validated
  // at enqueue time; handlers re-validate shape cheaply and throw ServiceError
  // (safe text) on anything unexpected.
  export const jobHandlers = {
    BULK_FLESH: async (job: Job) => {
      const payload = job.payload as { entityIds?: unknown };
      if (!Array.isArray(payload.entityIds) || !payload.entityIds.every((v) => typeof v === "string")) {
        throw new ServiceError("Invalid job payload.");
      }
      return fleshOutEntities(job.createdById, job.campaignId, payload.entityIds);
    },
  } satisfies Record<JobKind, (job: Job) => Promise<unknown>>;
  ```

  (`fleshOutEntities` re-checks DM membership itself with `job.createdById`,
  so a member who lost the role between enqueue and execution fails safely.)

- `scripts/worker.ts` (model the import/bootstrap style on
  `scripts/seed-lore.ts`): a loop that calls `claimNextJob()`; when idle,
  sleep ~2s; when claimed, run the handler in try/catch —
  `completeJob(id, result)` on success; on error, `failJob(id, message)`
  where message is `error instanceof ServiceError ? error.message : "Job
  failed."` (raw text never persists — invariant #6). Handle SIGINT/SIGTERM
  by finishing the in-flight job then exiting. Log one line per
  claim/finish (job id + kind + status only).

- `package.json`: `"worker": "tsx scripts/worker.ts"`.

**Verify**: with the DB up, `npm run worker` starts, logs idle polling, and
exits cleanly on Ctrl-C.

### Step 4: Wire the bulk-flesh panel

- New action `enqueueBulkFleshAction` in `src/app/(dm)/actions.ts`: parse
  multi-valued `entityIds` exactly as `fleshOutEntitiesAction` does (copy its
  FormData handling), validate non-empty/≤20 (mirror the service's bounds for
  fast feedback), call `enqueueJob(user.id, campaignId, "BULK_FLESH",
  { entityIds })`, revalidate the campaign page, return a state like
  `{ success: "Background run queued — proposals will appear in the Review
  Queue when it finishes." }`. Reuse `BulkGenerateActionState` if its shape
  fits; otherwise extend it minimally. If you add a catch block, match the
  file's current convention: `logActionError("...", error)` (already imported
  from `@/server/log` at the top of `actions.ts`) for unexpected errors and
  `error instanceof ServiceError` → `{ error: error.message }` for expected
  ones — do NOT use `console.error` (the file was migrated off it in plan 005).
- `bulk-flesh-panel.tsx`: alongside the existing synchronous "Flesh out N"
  submit, add a secondary "Run in background" submit bound to the new action
  (same form, `formAction` on the button). Below the form, render the
  campaign's recent BULK_FLESH jobs (passed in as a new prop from the World
  Browser page, fetched via `listRecentJobs` — add that call next to the
  existing `listFleshCandidates` call in
  `src/app/(dm)/campaigns/[id]/page.tsx`): one line per job — status,
  relative time, and for SUCCEEDED the proposed/skipped counts from
  `result`. Real data only (repo rule: never filler); render nothing when
  there are no jobs. Match the panel's existing design primitives; no new
  hex values.
- Note in the panel near the background button (code comment, not UI): job
  freshness requires a page refresh; live polling is deferred.

**Verify**: `npm run build` → exit 0. Manual: with `npm run dev` + `npm run
worker` + a configured AI key (or observe the job FAIL with the safe
"No AI provider is configured…" message when none is set — that failure path
is itself a valid end-to-end check), queue a background run and refresh: job
line appears, transitions QUEUED → RUNNING → SUCCEEDED/FAILED.

### Step 5: Tests

See Test plan.

**Verify**: `npm run test:coverage` → exit 0, floors hold;
`npm run lint && npm run typecheck && npm run build` → exit 0.

### Step 6: Ops + docs

- `docker-compose.yml`: add a `worker` service mirroring the app service's
  image/env, `command: npm run worker`, `depends_on: db`.
- `AGENTS.md`: in "Build / test / run", add `npm run worker` with one line on
  when it's needed (background AI runs); mention the Job table in the M4
  status paragraph. Update `docs/PROGRESS.md`: check off the Job backlog
  item with date + a short section describing the slice (match the existing
  entry format).

**Verify**: `docker compose config` → exit 0 (valid compose file);
`grep -n "worker" AGENTS.md docs/PROGRESS.md` → entries present.

## Test plan

- `tests/unit/jobs.test.ts` (real Postgres; copy the wipe/seed pattern from
  `tests/unit/review-batch-actions.test.ts`, adding `job` to the wiped
  tables): enqueue requires DM (PLAYER gets ServiceError); claim returns the
  oldest due QUEUED job and flips it RUNNING with `attempts: 1`; a second
  claim with nothing queued returns null; complete/fail set status +
  timestamps + result/error; `listRecentJobs` is DM-only and returns display
  fields.
- Handler test (in the same file or `tests/unit/job-handlers.test.ts`):
  BULK_FLESH with an invalid payload throws ServiceError; with a valid
  payload it delegates to `fleshOutEntities` (stub the provider seam the way
  `tests/unit/generation.test.ts` does, or `vi.mock` the generation module
  and assert the delegation args — prefer whichever pattern that file
  already uses for unit-vs-integration).
- `tests/unit/dm-actions.test.ts`: `enqueueBulkFleshAction` parses form data,
  calls `enqueueJob` with the right args (mock the service, matching the
  file's existing mock style), returns the queued message.
- `tests/unit/bulk-flesh-panel.test.tsx`: panel renders the background
  button; renders job status lines from the new prop; renders no job section
  when the list is empty.
- The worker loop itself (`scripts/worker.ts`) is excluded from the coverage
  gate only if `scripts/` is outside the coverage `include`
  (`vitest.config.ts` includes `src/**` only — it is). Keep all logic worth
  testing in `src/server/` (claim/complete/fail/handlers); the script stays
  a thin loop.

## Done criteria

- [ ] Migration adds `Job` + enums; `npm run db:migrate` clean; CI
      migration-drift gate would pass (schema and migration committed together)
- [ ] `npm run worker` processes a queued job end-to-end locally
- [ ] Panel can enqueue a background run; job status visible after refresh
- [ ] Raw provider/unknown error text never persisted to `Job.error`
      (test asserts the generic fallback)
- [ ] `npm run test:coverage`, `lint`, `typecheck`, `build` all exit 0
- [ ] AGENTS.md + docs/PROGRESS.md updated in the same change
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `prisma migrate dev` wants to do anything beyond adding the new
  table/enums (unexpected drift in the schema baseline).
- `BulkGenerateActionState` / the panel's form structure has changed such
  that adding a second submit button requires restructuring the component.
- You find an existing queue/job abstraction already started anywhere in
  `src/` (`grep -rin "job" src/server --include="*.ts" -l`) — reconcile,
  don't duplicate.
- The delegation test cannot stub the provider without real network calls.

## Maintenance notes

- **Cross-process spend-cap note (from plan 004)**: the per-campaign AI lock
  is in-process; a worker-run generation and an in-request generation do not
  serialize against each other. Bounded overshoot (one run per process);
  acceptable now, revisit if workers multiply.
- M5 re-indexing becomes: new `JobKind` value + one handler entry + enqueue
  calls on canon change. That's the test of this design — it should require
  no changes to the service/worker.
- Single-worker is load-bearing: before running two workers, replace the
  optimistic claim with `FOR UPDATE SKIP LOCKED`.
- Deferred deliberately: DM notification beyond the panel status line;
  retry semantics for paid generation jobs (maxAttempts stays 1); job
  cancellation; live status polling.
