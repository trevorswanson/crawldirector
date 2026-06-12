# Plan 005: Route server-action error logging through a key-safe helper

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bd64af7..HEAD -- "src/app/(dm)/actions.ts" "src/app/(dm)/campaigns/[id]/settings/actions.ts" src/server/log.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `bd64af7`, 2026-06-12

## Why this matters

Product invariant #6 (AGENTS.md): "Secrets (BYO-key API keys) never reach
the client, **logs**, or provenance." The action *responses* honor this — the
service layer maps provider failures to safe `ServiceError` text via
`describeProviderError`, which deliberately never reflects a provider's
free-text message because an OpenAI-compatible endpoint is an arbitrary
user-configured server whose error bodies can echo request headers or other
key-bearing config. But the catch blocks in the server actions also do
`console.error("…failed:", error)` with the **raw error object**. Anything a
provider SDK or proxy attached to that object (response bodies, request
config) lands verbatim in server logs — and self-hosters commonly forward
container stdout to log aggregators. This plan adds one safe-logging helper
and uses it at every action catch site.

## Current state

- The pattern, e.g. `src/app/(dm)/campaigns/[id]/settings/actions.ts:45-49`:

  ```ts
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message, timestamp: Date.now() };
    console.error("Set AI key action failed:", error);
    return { error: "Could not save the key. Please try again.", timestamp: Date.now() };
  }
  ```

- All `console.error` sites in the two action files (re-locate with
  `grep -n "console.error" "src/app/(dm)/actions.ts" "src/app/(dm)/campaigns/[id]/settings/actions.ts"`):
  - settings/actions.ts: `:47` (set AI key), `:70` (test AI connection),
    `:103` (set spend cap), `:118` (delete AI key — note this one is already
    inside an `if (!(error instanceof ServiceError)))` guard)
  - (dm)/actions.ts: `:102` (campaign creation), `:145` (create entity),
    `:234` (quick-create), `:422` (flesh out), `:448` (infer relationships),
    `:477` (scaffold stubs)
  The highest-risk sites are the four settings actions and the three
  generation actions — those catch errors from code paths that talk to
  user-configured AI endpoints.

- The existing safe-text precedent, `src/server/ai/index.ts:80-94`
  (`describeProviderError`): surfaces **only** a numeric HTTP status, never
  the message. Do not import it into the logger (it lives in the AI module,
  which pulls provider SDKs); replicate the status-only rule locally.

- Conventions: server-only modules live under `src/server/`; the coverage
  gate (95% stmts / 85% branches / 95% funcs / 95% lines) means any new
  module ships with tests; component/util tests live in `tests/unit/` and
  mock their boundaries.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Start DB / migrate (for the full suite) | `docker compose up -d db && npm run db:deploy` | exit 0 |
| Unit + coverage gate | `npm run test:coverage` | exit 0; floors hold |
| One test file | `npx vitest run tests/unit/log.test.ts` | all pass |
| Lint / typecheck | `npm run lint && npm run typecheck` | exit 0 |

The unit suite **wipes tables** in the configured DB.

## Scope

**In scope**:
- `src/server/log.ts` (create)
- `src/app/(dm)/actions.ts` (the listed catch sites only)
- `src/app/(dm)/campaigns/[id]/settings/actions.ts` (the listed catch sites only)
- `tests/unit/log.test.ts` (create)
- `tests/unit/dm-actions.test.ts` / settings-action tests — only if existing
  assertions spy on `console.error` and need the new shape

**Out of scope** (do NOT touch):
- `describeProviderError` and anything in `src/server/ai/`.
- The user-facing return values of any action (messages must stay
  byte-identical).
- `console.error` calls elsewhere in the repo (`grep -rn "console.error" src/`
  will show others, e.g. in scripts/ — leave them).

## Git workflow

- Branch **from `main`**: `improve/005-safe-error-logging`
- Commit style: conventional commits, e.g. `fix(actions): log caught action errors through a key-safe helper`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `src/server/log.ts`

```ts
// Key-safe server logging (invariant #6: secrets never reach logs). Raw error
// objects from provider SDKs / user-configured endpoints can carry request
// config or response bodies; we log name + a bounded message + stack, and for
// HTTP-shaped errors (anything exposing a numeric `status`) we follow
// describeProviderError's rule (src/server/ai/index.ts): status code only,
// never the upstream free text.
export function logActionError(context: string, error: unknown): void {
  if (error instanceof Error) {
    const status =
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : undefined;
    const message =
      status !== undefined
        ? `HTTP ${status} from upstream (message withheld — may echo endpoint config)`
        : error.message.slice(0, 500);
    console.error(`${context}: [${error.name}] ${message}`, error.stack ?? "");
    return;
  }
  console.error(`${context}: non-Error thrown (${typeof error})`);
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Replace the ten call sites

At each site from "Current state", replace
`console.error("<label>:", error)` with
`logActionError("<label>", error)` keeping the existing label text (minus
the trailing colon — the helper adds its own separator). Import once per
file. Do not restructure the surrounding catch logic; in particular keep
`deleteAiKeyAction`'s existing `!(error instanceof ServiceError)` guard
as-is around the call.

**Verify**:
`grep -n "console.error" "src/app/(dm)/actions.ts" "src/app/(dm)/campaigns/[id]/settings/actions.ts"`
→ no matches.

### Step 3: Tests

See Test plan.

**Verify**: `npm run test:coverage` → exit 0, floors hold;
`npm run lint && npm run typecheck` → exit 0.

## Test plan

`tests/unit/log.test.ts` (no DB; spy with `vi.spyOn(console, "error").mockImplementation(() => {})`):
1. Plain `Error("db went away")` → logged line contains `[Error]` and
   `db went away`.
2. HTTP-shaped error: `Object.assign(new Error("SECRET-MARKER-XYZ"), { status: 401 })`
   → logged output contains `HTTP 401` and does **not** contain
   `SECRET-MARKER-XYZ` anywhere in any argument of the spy call.
3. Message truncation: a 2,000-char message logs ≤ 500 chars of it.
4. Non-Error throw (`logActionError("x", "boom")`) → logs the non-Error line,
   does not include `"boom"`. (Matches the helper as specced; if you choose
   to include the stringified value instead, you must justify why that's
   safe — strings thrown by SDKs are rare but not impossible carriers.
   Prefer the spec.)

Existing action tests: run `npx vitest run tests/unit/dm-actions.test.ts` and
the settings-page test; if any assert on `console.error` arguments, update
those assertions to the new format — nothing else.

## Done criteria

- [ ] `grep -rn "console.error" "src/app/(dm)/"` → no matches
- [ ] `tests/unit/log.test.ts` exists; the SECRET-MARKER test passes
- [ ] `npm run test:coverage` exits 0, floors hold
- [ ] `npm run lint && npm run typecheck` exit 0
- [ ] Action return values unchanged (no diff outside catch-block logging lines)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The catch sites don't match the listed pattern (drift).
- Any existing test asserts the exact old `console.error` call in a way that
  suggests the log line is a contract for some other tooling.
- You're tempted to also "fix" generation.ts or services — they already map
  to safe ServiceError text and log nothing; out of scope.

## Maintenance notes

- New server actions should use `logActionError` from day one; a reviewer
  seeing a raw `console.error(…, error)` in an action should flag it.
- If structured logging (request ids, levels) ever lands, this helper is the
  single seam to upgrade.
- The 500-char truncation is a defense-in-depth bound, not a parser: the real
  protection for provider errors is the status-only rule.
