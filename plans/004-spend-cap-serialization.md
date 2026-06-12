# Plan 004: Serialize AI generation per campaign so concurrent runs cannot overshoot the spend cap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bd64af7..HEAD -- src/server/services/generation.ts src/server/services/ai-usage.ts tests/unit/generation.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `bd64af7`, 2026-06-12

## Why this matters

A DM-set spend cap (`Campaign.spendCapUsd`) is enforced by
`assertWithinSpendCap` — a read of summed `AiUsage` cost — called *before*
each provider call, with `recordAiUsage` writing the cost *after*. Nothing
serializes the two, so N concurrent generations (e.g. a bulk flesh-out
running while the DM triggers a single flesh-out, or owner + co-DM
generating simultaneously) all pass the check at $cap−ε and all spend. The
cap's documented semantics ("blocks generation once known spend reaches it")
already accept a one-run overshoot — cost is only known after the call — but
the concurrency window multiplies that by the number of in-flight runs.
Serializing the check→call→record span per campaign closes it.

## Current state

- `src/server/services/ai-usage.ts:77-91` — `assertWithinSpendCap(campaignId)`
  reads `Campaign.spendCapUsd`, sums `AiUsage.estimatedCostUsd`, throws a
  `ServiceError` if `spent >= cap`. `recordAiUsage` (`ai-usage.ts:29-55`)
  writes the row; no transaction or lock relates the two.

- `src/server/services/generation.ts` — the three single-run generators each
  follow the same shape (DM check → load canon → resolve provider →
  `assertWithinSpendCap` → provider call → `recordAiUsage` → no-op check →
  file PENDING change set → `linkAiUsageChangeSet`):
  - `fleshOutEntity` (lines 99-227; cap assert at 142, record at 195)
  - `inferRelationshipsForEntity` (lines 328-514; assert at 366, record at 481)
  - `scaffoldStubEntities` (lines 521-627; assert at 549, record at 591)

- `fleshOutEntities` (lines 236-323) is the bulk loop: it calls
  `assertWithinSpendCap` *itself* per iteration (line 289, as a pre-screen
  that flips a `capReached` flag) and then calls `fleshOutEntity` per entity
  (line 301). **It must not take the lock itself** — its inner
  `fleshOutEntity` calls will, per entity, and the per-entity lock is what
  gives correct interleaving between a bulk run and other runs.

- Deployment shape (why an in-process mutex is the right fix): self-hosted
  single Node process (`Dockerfile` runs one `next start`; docker-compose has
  one app service). A Postgres advisory lock held across a multi-second LLM
  call would pin a pooled connection per in-flight generation — worse than
  the disease. If the app ever scales to multiple replicas, this fix's
  limitation must be revisited (see Maintenance notes).

- Test conventions: `tests/unit/generation.test.ts` exists and tests these
  functions against the real Postgres with a **stubbed provider** — read it
  first; new tests must use the same stubbing seam (it mocks
  `@/server/ai`'s `resolveCampaignProvider` via `vi.mock`) and the same
  table-wipe `beforeEach` pattern.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Start DB / migrate | `docker compose up -d db && npm run db:deploy` | exit 0 |
| Unit + coverage gate | `npm run test:coverage` | exit 0; floors 95/85/95/95 hold |
| One test file | `npx vitest run tests/unit/generation.test.ts` | all pass |
| Lint / typecheck | `npm run lint && npm run typecheck` | exit 0 |

The unit suite **wipes tables** in the configured DB.

## Scope

**In scope**:
- `src/server/services/ai-lock.ts` (create)
- `src/server/services/generation.ts` (wrap three functions)
- `tests/unit/ai-lock.test.ts` (create)
- `tests/unit/generation.test.ts` (extend)

**Out of scope** (do NOT touch):
- `src/server/services/ai-usage.ts` — the check and record stay as they are;
  the lock provides the atomicity.
- `testAiConnection` (`src/server/ai/index.ts`) — connection tests are tiny,
  capless by design, and shouldn't queue behind generations.
- Any UI or action file.
- Database schema.

## Git workflow

- Branch **from `main`**: `improve/004-spend-cap-serialization`
- Commit style: conventional commits, e.g. `fix(ai): serialize per-campaign generation so concurrent runs respect the spend cap`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the per-campaign async mutex

`src/server/services/ai-lock.ts`:

```ts
// Serializes AI generation per campaign so the spend-cap check, the provider
// call, and the usage record behave as one atomic unit (docs/04-ai-integration
// spend caps). In-process only: this app deploys as a single Node process
// (see Dockerfile); with multiple replicas this lock no longer guards the cap.
// NOT re-entrant — a holder calling withCampaignAiLock again deadlocks, so
// batch orchestrators (fleshOutEntities) must never wrap their per-entity calls.
const tails = new Map<string, Promise<void>>();

export async function withCampaignAiLock<T>(
  campaignId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(campaignId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  // Store the chained promise in a local: the cleanup below must compare
  // against the EXACT object placed in the map. Comparing against `current`
  // instead would never match, every campaign's entry would live forever,
  // and a long-running process would leak one stale promise per campaign.
  const tail = previous.then(() => current);
  tails.set(campaignId, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    // Drop the tail entry when no one queued behind us, so the map can't grow
    // unboundedly across campaigns.
    if (tails.get(campaignId) === tail) tails.delete(campaignId);
  }
}

// Test-only introspection: how many campaigns currently hold a tail entry.
// Pins the cleanup behavior above; not for production use.
export function lockTailCountForTests(): number {
  return tails.size;
}
```

The cleanup comparison is the easy thing to get wrong here — the unit test
in the Test plan pins it via `lockTailCountForTests()`, so a wrong
comparison fails the suite instead of silently leaking.

**Verify**: `npx vitest run tests/unit/ai-lock.test.ts` (written in Step 3)
→ all pass.

### Step 2: Wrap the three single-run generators

In `src/server/services/generation.ts`, for each of `fleshOutEntity`,
`inferRelationshipsForEntity`, `scaffoldStubEntities`: keep the function's
signature and its DM-permission check (`assertCampaignDm`) and cheap input
validation outside, then wrap **everything from the canon loads through the
final return** in `withCampaignAiLock(campaignId, async () => { … })`. The
critical invariant: `assertWithinSpendCap`, the `provider.generateStructured`
call, and `recordAiUsage` (+ `linkAiUsageChangeSet`) all execute inside one
lock acquisition.

Smallest-diff approach: extract each existing body (after the DM assert)
into a private `…Locked` function and have the public function be
`assertCampaignDm` + `return withCampaignAiLock(campaignId, () => …Locked(args))`.

Do **not** wrap `fleshOutEntities` (see Current state — its per-entity
`fleshOutEntity` calls take the lock; wrapping the batch too would deadlock
on the first entity). Add a one-line comment on `fleshOutEntities` saying
exactly that.

**Verify**: `npx vitest run tests/unit/generation.test.ts` → all existing
tests pass unchanged (single-caller behavior is identical).

### Step 3: Tests

See Test plan.

**Verify**: `npm run test:coverage` → exit 0, floors hold;
`npm run lint && npm run typecheck` → exit 0.

## Test plan

`tests/unit/ai-lock.test.ts` (pure logic, no DB):
- Two `withCampaignAiLock("c1", …)` calls with deferred-resolution stubs run
  strictly serially: record start/end order into an array; the second `fn`
  must not start before the first finishes.
- Different campaign ids do **not** serialize against each other (both `fn`s
  in flight at once — assert via a shared "currently running" counter
  reaching 2).
- A rejected `fn` releases the lock (the next caller still runs) and the
  rejection propagates.
- **Cleanup (leak regression)**: after awaiting a single run,
  `lockTailCountForTests() === 0`; after two queued runs on the same
  campaign both settle (including the rejected-`fn` case), it is `0` again;
  while a run is in flight it is ≥ 1. This is the test that fails if the
  `finally` compares against the wrong promise.

`tests/unit/generation.test.ts` (extend, matching its existing provider-stub
and DB-seed patterns):
- **Cap race regression**: campaign with `spendCapUsd` set so that exactly
  one run fits (price one run via a stub model present in
  `src/lib/ai/pricing.ts` — read how existing tests control cost, or set a
  per-key price override via the `AiKey` row as the existing usage tests do).
  Stub the provider with an artificial ~50ms delay before returning. Fire
  `Promise.allSettled([fleshOutEntity(...A), fleshOutEntity(...B)])` for two
  different entities. Assert exactly one fulfilled and one rejected with the
  spend-cap `ServiceError` message ("spend cap"), and exactly **one**
  `AiUsage` row exists.
- **Bulk + single interleave smoke**: a `fleshOutEntities` batch of 2 with a
  concurrent single `fleshOutEntity` completes without deadlock (this is the
  re-entrancy guard regression test — set a generous vitest timeout, e.g.
  10s, so a deadlock fails fast rather than hanging CI for the default).

## Done criteria

- [ ] `grep -n "withCampaignAiLock" src/server/services/generation.ts` → 3
      wrap sites (one per single-run generator), none in `fleshOutEntities`
- [ ] New + existing tests pass: `npm run test:coverage` exits 0, floors hold
- [ ] `npm run lint && npm run typecheck` exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `tests/unit/generation.test.ts` stubs the provider through a different seam
  than described — adapt to its actual pattern only if the change is
  mechanical; if the tests construct providers per-call in a way the lock
  test can't reuse, report instead.
- The cap-race test is flaky across 3 runs (timing assumptions leaking in) —
  report rather than padding delays.
- You find a fourth call site of `assertWithinSpendCap` outside
  `generation.ts`/`ai-usage.ts` (`grep -rn assertWithinSpendCap src/`) — the
  plan's inventory is then stale.

## Maintenance notes

- **Multi-replica deployments break this guarantee** — the lock is
  in-process. If the app ever runs >1 instance, replace with a DB-side
  reservation (e.g. write a provisional AiUsage row before the call inside a
  short transaction) — do not just move this mutex to Redis without
  reconsidering the held-across-LLM-call duration.
- Plan 006's Job worker runs in a **separate process**: a worker-executed
  generation and an in-request generation will not serialize against each
  other. Acceptable for now (same single-overshoot bound as today across two
  processes); note it in the worker plan's review.
- Reviewer focus: the lock must not enclose `assertCampaignDm` (permission
  failures shouldn't queue); `fleshOutEntities` must remain unwrapped; and
  the `finally` cleanup must compare against the stored `tail` promise (the
  `lockTailCountForTests()` assertions guard this — don't let a refactor
  drop them).
