# Plan 002: Harden bulk-approve error handling with error codes instead of message matching

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bd64af7..HEAD -- src/lib/errors.ts src/server/services/review.ts tests/unit/review-batch-actions.test.ts tests/unit/errors.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (recommended after plans/001, which adds the e2e regression net)
- **Category**: bug
- **Planned at**: commit `bd64af7`, 2026-06-12

## Why this matters

`approveChangeSetRun` (the Review Queue's "approve whole generator run"
action) decides whether a failed change set should be *held for manual
review* or should *abort the whole run* by substring-matching the error
message: `error.message.includes("stale") || error.message.includes("lock")`.
But the staleness errors thrown **inside** the apply transaction say
*"…changed since…"* — they contain neither substring. Consequences:

1. If an entity/relationship/event changes between the pre-loop flag refresh
   and the apply transaction (a real, if narrow, race), the error re-throws:
   the bulk run aborts midway, earlier change sets stay approved, later ones
   are untouched, and the `BULK_APPROVE_RUN` audit row is never written.
2. A run containing a change set whose operations are all REJECTED aborts the
   same way ("Accept at least one operation before approval." matches
   neither substring).
3. Before each `approveChangeSet` call, the loop flips operation decisions
   (PENDING → ACCEPTED, fieldDecisions rewritten) **outside any
   transaction** — so when a set is subsequently held or the run aborts,
   those flips persist: a held proposal's operations now read as
   "ACCEPTED" even though the DM never individually accepted them.

This plan replaces string matching with structured error codes, makes the
hold path restore the pre-flip decisions, and treats the all-rejected case
as held instead of aborting.

## Current state

All in `src/server/services/review.ts` (4,343 lines) unless noted.

- `src/lib/errors.ts` — the entire file today:

  ```ts
  export class ServiceError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ServiceError";
    }
  }
  ```

- The bulk approve loop, `review.ts:1615-1652` (abridged):

  ```ts
  for (const changeSet of changeSets) {
    const applicableOperations = changeSet.operations.filter(
      (operation) => operation.decision !== OpDecision.REJECTED,
    );
    const held = applicableOperations.some(
      (operation) => operation.blockedByLock || operation.isStale,
    );
    if (held) { heldIds.push(changeSet.id); continue; }

    try {
      for (const operation of changeSet.operations) {
        if (operation.decision !== OpDecision.PENDING &&
            operation.decision !== OpDecision.EDITED) continue;
        await prisma.changeOperation.update({          // ← outside any tx
          where: { id: operation.id },
          data: bulkApprovedOperationData(operation),  // ← flips decision/fieldDecisions
        });
      }
      await approveChangeSet(userId, campaignId, changeSet.id);
      approvedIds.push(changeSet.id);
    } catch (error) {
      if (error instanceof ServiceError &&
          (error.message.includes("stale") || error.message.includes("lock"))) {
        heldIds.push(changeSet.id);                    // ← decisions NOT restored
      } else {
        throw error;                                   // ← aborts run, no audit row
      }
    }
  }
  ```

- `approveChangeSet` (`review.ts:1464-1554`) refreshes flags, then runs one
  interactive `prisma.$transaction` that pre-checks
  (`review.ts:1483-1491`):

  ```ts
  if (applicableOperations.length === 0) {
    throw new ServiceError("Accept at least one operation before approval.");
  }
  if (applicableOperations.some((operation) => operation.blockedByLock)) {
    throw new ServiceError("One or more operations are blocked by locks.");
  }
  if (applicableOperations.some((operation) => operation.isStale)) {
    throw new ServiceError("One or more operations are stale.");
  }
  ```

- The in-transaction throw sites whose messages defeat the substring match.
  **Line numbers are from `bd64af7` — re-locate each with the greps below
  rather than trusting them.** Staleness ("changed since"): entity update
  `review.ts:2450`, entity delete/restore `review.ts:2555`, relationship
  `review.ts:2867` and `review.ts:2952`, event `review.ts:3830`. Locks
  (these *do* happen to match "lock"): `review.ts:2460`, `2463`, `2563`,
  `2876`, `2961`, `3839`, `4293`.
  - `grep -n '"changed since\|changed since this' src/server/services/review.ts`
  - `grep -n 'is locked\|locked entity fields\|blocked by locks\|are stale' src/server/services/review.ts`

- Note (context, not a task): several of those staleness/lock sites also do
  `await tx.changeOperation.update({ …, data: { isStale: true } })` right
  before throwing (e.g. `review.ts:2446-2449`, `2455-2458`). Those writes
  roll back with the transaction — they are no-ops today. Flags are actually
  maintained by `refreshPendingOperationFlags` (`review.ts:1673`). Leave the
  dead writes alone in this plan (see Maintenance notes).

- Repo conventions: services throw `ServiceError` for expected user-facing
  failures; server actions catch and surface `error.message`. Service-layer
  tests run against a real Postgres and wipe tables between files; the
  structural exemplar for this plan's tests is
  `tests/unit/review-batch-actions.test.ts` (seed helpers `makeUser` /
  `createEntity` / `pendingRunUpdate`, `beforeEach` table wipes).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Start DB | `docker compose up -d db` (or podman) | Postgres :5432, db `dcc` |
| Migrate | `npm run db:deploy` | exit 0 |
| Unit + coverage gate | `npm run test:coverage` | exit 0; floors 95% stmts / 85% branches / 95% funcs / 95% lines hold |
| One test file | `npx vitest run tests/unit/review-batch-actions.test.ts` | all pass |
| Lint / typecheck | `npm run lint && npm run typecheck` | exit 0 |

The unit suite **wipes tables** in the configured DB — use the local dev/test
database, never anything you care about.

## Scope

**In scope** (the only files you should modify):
- `src/lib/errors.ts`
- `src/server/services/review.ts`
- `tests/unit/errors.test.ts`
- `tests/unit/review-batch-actions.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- The dead in-transaction flag writes (e.g. `review.ts:2446-2449`) — leave
  them; removing them is a separate cleanup with its own risk.
- `rejectChangeSetRun` (`review.ts:1949`) — it has no flip/catch logic and
  needs no change.
- Any server action or component — error *messages* shown to the DM must not
  change (the UI and existing tests assert on them).
- `refreshPendingOperationFlags` internals.

## Git workflow

- Branch **from `main`**: `improve/002-bulk-approve-hardening`
- Commit style: conventional commits, e.g. `fix(review): hold bulk-approve conflicts via error codes, not message matching`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an optional `code` to `ServiceError`

In `src/lib/errors.ts`:

```ts
export type ServiceErrorCode =
  | "OPERATION_STALE"
  | "OPERATION_BLOCKED"
  | "NO_ACCEPTED_OPERATIONS";

export class ServiceError extends Error {
  readonly code?: ServiceErrorCode;
  constructor(message: string, options?: { code?: ServiceErrorCode }) {
    super(message);
    this.name = "ServiceError";
    this.code = options?.code;
  }
}
```

The one-arg form stays valid — no other call site needs to change.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Attach codes at every staleness/lock/no-op throw site in review.ts

Using the greps from "Current state", add the options arg, keeping every
message byte-identical:

- All "…changed since…" sites and the pre-check "One or more operations are
  stale." → `{ code: "OPERATION_STALE" }`
- All "…is locked…" / "locked entity fields" / "blocked by locks" /
  "causality link is locked" sites → `{ code: "OPERATION_BLOCKED" }`
- "Accept at least one operation before approval." (`review.ts:1484`) →
  `{ code: "NO_ACCEPTED_OPERATIONS" }`

Only code sites that can be reached from `approveChangeSet`'s
refresh/pre-check/apply path. If you find another "changed since" message in
a function unreachable from approval (e.g. a live-edit service path), code it
too if it's a ServiceError staleness signal — the code is descriptive either
way.

**Verify**: `npx vitest run tests/unit/review-batch-actions.test.ts tests/unit/review-helpers.test.ts` → all pass (messages unchanged, so existing assertions hold).

### Step 3: Replace the substring catch with a code catch + decision restore

In `approveChangeSetRun` (`review.ts:1598`):

1. Before the flip loop, snapshot the to-be-flipped operations:
   `{ id, decision, editedPatch, fieldDecisions }` for every operation with
   decision PENDING or EDITED.
2. Extract a module-private helper
   `async function restoreOperationDecisions(snapshots): Promise<void>` that
   writes those three fields back via `prisma.changeOperation.update` (use
   `Prisma.DbNull` when a snapshotted `editedPatch`/`fieldDecisions` was
   null — mirror how `bulkApprovedOperationData` writes
   `editedPatch: Prisma.DbNull` at `review.ts:337`).
3. Change the catch to:

   ```ts
   } catch (error) {
     if (
       error instanceof ServiceError &&
       (error.code === "OPERATION_STALE" ||
        error.code === "OPERATION_BLOCKED" ||
        error.code === "NO_ACCEPTED_OPERATIONS")
     ) {
       await restoreOperationDecisions(snapshots);
       heldIds.push(changeSet.id);
     } else {
       throw error;
     }
   }
   ```

Behavior notes:
- `approveChangeSet`'s transaction rolled back, so canon was not touched —
  restoring the decision rows returns the change set to its exact pre-run
  state.
- The all-REJECTED-operations case now lands in `heldIds` instead of aborting
  the run. The DM resolves that set manually (reject/supersede it) — this
  matches how lock/stale holds already behave.

**Verify**: `npx vitest run tests/unit/review-batch-actions.test.ts` → all pass.

### Step 4: Tests (see Test plan)

**Verify**: `npm run test:coverage` → exit 0, coverage floors hold.

## Test plan

In `tests/unit/errors.test.ts` (exists — extend):
- `ServiceError` with no options has `code === undefined`; with
  `{ code: "OPERATION_STALE" }` exposes it. Name stays `"ServiceError"`.

In `tests/unit/review-batch-actions.test.ts` (model new tests on the
existing seed helpers in the same file):

1. **All-rejected set no longer aborts the run** (deterministic): create a
   run with two change sets; on one, mark every operation REJECTED (use the
   same service the queue UI uses — find the exported decision-setting
   function in review.ts, e.g. via `grep -n "OpDecision.REJECTED" src/app`
   to see what the action calls). `approveChangeSetRun` must resolve with
   the healthy set in `approvedIds`, the all-rejected set in `heldIds`, and
   the `BULK_APPROVE_RUN` audit row written.
2. **Coded staleness from approveChangeSet**: create a pending change set
   with a stale `_baseVersion` (use `pendingRunUpdate`, then bump the entity
   via `applyAutoApprovedEntityChangeSet`); call `approveChangeSet` directly
   and assert the rejection is a `ServiceError` with
   `code === "OPERATION_STALE"` (message unchanged).
3. **Decision restore**: for the held set in test 1 (or a lock-held variant),
   assert after the run that its operations' `decision` / `editedPatch` /
   `fieldDecisions` are byte-equal to their pre-run values (read them from
   Prisma before and after).
4. Existing tests in the file must pass unchanged — they pin the
   approved/held partitioning behavior.

The mid-transaction race itself (canon write between flag refresh and apply)
is not deterministically reproducible without fault injection; the coded
throw sites (test 2) plus the catch logic (tests 1, 3) cover both halves of
the path separately. State this in the test file with a one-line comment.

## Done criteria

- [ ] `grep -n 'message.includes' src/server/services/review.ts` → no matches
- [ ] `npm run test:coverage` exits 0; new tests above exist and pass
- [ ] `npm run lint && npm run typecheck` exit 0
- [ ] All pre-existing tests pass unmodified (no assertion-message edits)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The catch block at `review.ts:1642-1651` doesn't match the excerpt (drift).
- You cannot find an exported service function to mark an operation REJECTED
  (test 1) — do not write raw decision updates that bypass the service layer
  except for *reading* state.
- Restoring decisions requires touching `approveChangeSet`'s transaction or
  signature.
- Any existing test fails for a reason other than an unmodified-behavior bug
  you can point to precisely.

## Maintenance notes

- Reviewer focus: confirm messages are byte-identical (the UI shows them) and
  that the restore helper writes `Prisma.DbNull` vs `undefined` correctly —
  Prisma treats them differently for Json columns.
- Deferred deliberately: removing the dead in-transaction
  `isStale`/`blockedByLock` writes (they roll back with the tx; flags are
  maintained by `refreshPendingOperationFlags`). Safe cleanup once this plan's
  tests are green; do it in its own change.
- Any future code that catches `ServiceError` by message should use `code`
  instead — extend `ServiceErrorCode` rather than matching strings.
