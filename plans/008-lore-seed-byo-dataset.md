# Plan 008: Bring-your-own lore dataset (mount, don't bundle) + gate the seed checkbox

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. This work lands on the **existing** PR #115 branch
> `improve/007-lore-seed-onboarding`; your reviewer maintains `plans/`.

## Status

- **Priority**: P2 (addresses a P2 review comment on PR #115)
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 007 (this extends it; PR #115 branch is the base)
- **Category**: correctness / DX / legal
- **Planned at**: commit `b9d96d5` (tip of `improve/007-lore-seed-onboarding`)

## Why this matters

A code-review bot flagged PR #115 (P2): the `LORE_SEED` job reads
`process.cwd()/dungeon-crawler-carl.jsonl`, but that file is **gitignored and
untracked** and the Docker runner stage never copies it — so the seed checkbox
is nonfunctional in any fresh checkout/container, failing the job's
existence check.

The bot suggested "package the dataset," but the DCC lore is **copyrighted** —
it must NOT be committed or baked into the image. The chosen direction:

1. Treat the dataset as a **bring-your-own, install-time requirement**: the
   operator supplies their own dataset and **bind-mounts** it at runtime
   (not a Dockerfile `COPY`, which would bake content into the image and can't
   see a gitignored file anyway).
2. **Gate the checkbox** on dataset availability so a DM never sees a
   non-functional option, with a server-side re-check as defense in depth.
3. **Document** how to build a compatible seed file (generic schema + a small
   synthetic example, no copyrighted text).

## Current state (verified at `b9d96d5`)

- `src/server/services/seeding.ts:146` builds the path inline:
  `const filePath = path.join(process.cwd(), "dungeon-crawler-carl.jsonl");`
  then `if (!fs.existsSync(filePath)) throw new ServiceError(...)` at 147–149.
  The file is read at 165. `seedCampaignFromLore` already throws a typed
  `ServiceError` on a missing file (plan 007).
- `src/app/(dm)/dashboard/page.tsx` is a **server component** (`async function
  DashboardPage`); it renders `<CreateCampaignForm />` at line 41.
- `src/components/campaigns/create-campaign-form.tsx` is a **`"use client"`**
  component; it currently takes **no props** and unconditionally renders the
  `seedLore` checkbox.
- `src/app/(dm)/actions.ts` `createCampaignAction` (lines ~85–117): on
  `seedLore === "on"` it enqueues `LORE_SEED` in its own try/catch before the
  redirect.
- `docker-compose.yml`: `app` and `worker` services (`build: .`), both with
  `env_file: [.env (required:false)]`. No `volumes:` on either.
- `.dockerignore` already excludes the dataset (`*.md`, `docs`, `.env`, etc.);
  the file is `.gitignore`d. Leave both as-is — we are NOT shipping the file.
- `tests/unit/seeding.test.ts` **mocks** `fs.existsSync`/`fs.readFileSync`
  keyed on any path **ending in** `dungeon-crawler-carl.jsonl` (returns
  synthetic data — Carl/Donut/Katia + 97 generic items). It never reads the
  real file. **This suffix-matching is load-bearing for the test plan below.**
- `tests/unit/create-campaign-form.test.tsx` (jsdom) renders
  `<CreateCampaignForm />` with no props and mocks `@/app/(dm)/actions`.
- `tests/unit/dashboard-page.test.tsx` exists (renders `DashboardPage`).
- `tests/unit/dm-actions.test.ts` has the plan-007 `createCampaignAction`
  tests (mock-style; `enqueueJob` is mocked).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| One test file | `npx vitest run tests/unit/seeding.test.ts` | pass |
| Unit + coverage gate | `npm run test:coverage` | exit 0; floors 95/85/95/95 hold |
| Lint / typecheck / build | `npm run lint && npm run typecheck && npm run build` | exit 0 |

The worktree already has `node_modules`, `.env`, and a generated Prisma client
from the prior run — no reinstall needed. The unit suite wipes the `dcc` DB
(that's fine). The DB runs in **podman** (a `dcc-pg` container should already
be up; if a command needs it and it's down, `podman compose up -d db`).

## Scope

**In scope**:
- `src/server/services/seeding.ts` — add `resolveLoreSeedPath()` +
  `isLoreSeedDatasetAvailable()`; use the resolver where the path is built.
- `src/app/(dm)/dashboard/page.tsx` — compute availability, pass as prop.
- `src/components/campaigns/create-campaign-form.tsx` — accept
  `loreSeedAvailable` prop; render the checkbox only when `true`.
- `src/app/(dm)/actions.ts` — server-side gate: only enqueue when available.
- `docker-compose.yml` — **commented** example bind-mount on `app` + `worker`.
- `.env.example` — document `LORE_SEED_FILE`.
- `docs/14-lore-seeding.md` — new operator doc.
- Tests: `tests/unit/seeding.test.ts`, `tests/unit/create-campaign-form.test.tsx`,
  `tests/unit/dashboard-page.test.tsx`, `tests/unit/dm-actions.test.ts`.

**Out of scope** (do NOT touch):
- The dataset file, `.gitignore`, `.dockerignore` — do NOT track, copy, or
  bundle the dataset anywhere. No Dockerfile `COPY` of the dataset.
- The `Dockerfile` itself (the mount is a runtime/compose concern).
- `classifyEntity` / `extractSummaryAndDescription` heuristics.
- `clearExisting` — still must never be reachable from UI/actions.

## Git workflow

- You are already on branch `improve/007-lore-seed-onboarding` in this
  worktree — **stay on it**, do NOT create a new branch.
- One conventional commit, e.g.
  `feat(seeding): mount-your-own lore dataset + gate seed checkbox on availability`.
- Do NOT push or touch `plans/` — your reviewer pushes and maintains the index.

## Steps

### Step 1: Path resolution + availability helper (seeding.ts)

Add near the top of `src/server/services/seeding.ts` (after imports), exported:

```ts
/**
 * Resolve the lore dataset path. The DCC dataset is copyrighted and NOT shipped
 * with the repo — operators bring their own and either place it at the repo/app
 * root or point LORE_SEED_FILE at it (see docs/14-lore-seeding.md).
 */
export function resolveLoreSeedPath(): string {
  return (
    process.env.LORE_SEED_FILE ??
    path.join(process.cwd(), "dungeon-crawler-carl.jsonl")
  );
}

/** True when a lore dataset is present and readable at the resolved path. */
export function isLoreSeedDatasetAvailable(): boolean {
  return fs.existsSync(resolveLoreSeedPath());
}
```

Then in `seedCampaignFromLore`, replace the inline path build (line ~146) with
`const filePath = resolveLoreSeedPath();` (keep the existing `fs.existsSync`
guard + `ServiceError` immediately after, and the `fs.readFileSync(filePath)`).

**Test-mock note**: the existing `seeding.test.ts` fs mocks match any path
*ending in* `dungeon-crawler-carl.jsonl`. With `LORE_SEED_FILE` unset (the test
default), `resolveLoreSeedPath()` returns `<cwd>/dungeon-crawler-carl.jsonl`,
which still matches — existing tests keep passing unchanged. Do NOT set
`LORE_SEED_FILE` in the existing tests.

**Verify**: `npx vitest run tests/unit/seeding.test.ts` → all pass.

### Step 2: Gate the checkbox (form + dashboard) — mind the RSC boundary

**RSC boundary (known repo gotcha)**: a server component must NOT import a
function out of a `"use client"` module, and a client component must NOT import
the server-only seeding module. Compute availability in the **server**
component and pass it down as a plain prop.

- `create-campaign-form.tsx`: change the signature to
  `export function CreateCampaignForm({ loreSeedAvailable }: { loreSeedAvailable: boolean })`
  and wrap the existing `seedLore` checkbox block in
  `{loreSeedAvailable && ( ... )}`. Change nothing else about the checkbox
  markup (native `<input type="checkbox" id="seedLore" name="seedLore" />` in a
  label, no `value` attr).
- `dashboard/page.tsx`: import `isLoreSeedDatasetAvailable` from
  `@/server/services/seeding`, call it (it's synchronous), and render
  `<CreateCampaignForm loreSeedAvailable={isLoreSeedDatasetAvailable()} />`.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Server-side enqueue gate (actions.ts)

In `createCampaignAction`, change the seed branch so it only enqueues when the
dataset is actually available (defense in depth — never trust the client):

```ts
if (formData.get("seedLore") === "on" && isLoreSeedDatasetAvailable()) {
  try {
    await enqueueJob(user.id, campaignId, "LORE_SEED", {});
  } catch (err) {
    logActionError("LORE_SEED enqueue failed", err);
  }
}
```

Import `isLoreSeedDatasetAvailable` from `@/server/services/seeding`. (If
unavailable, silently skip — the checkbox shouldn't have been shown anyway.)

**Verify**: `npm run build` → exit 0.

### Step 4: Docker mount example + env doc

- `docker-compose.yml`: under **both** `app` and `worker` services, add a
  **commented** block (do NOT enable it by default — a bind-mount of a
  non-existent host path errors under podman / silently creates a dir under
  docker; the operator opts in):

  ```yaml
      # Optional: enable "seed with official lore" onboarding by mounting your
      # OWN dataset read-only. The DCC dataset is copyrighted and NOT shipped —
      # see docs/14-lore-seeding.md for the file format. Uncomment and point the
      # left side at your file (or set LORE_SEED_FILE for a custom container path).
      # volumes:
      #   - ./dungeon-crawler-carl.jsonl:/app/dungeon-crawler-carl.jsonl:ro
  ```

  Match the file's existing 2-space indentation.
- `.env.example`: add a short section:

  ```
  # ─── Lore seeding (optional, bring-your-own dataset) ───
  # Absolute path INSIDE the container to a JSONL lore dataset. The DCC dataset
  # is copyrighted and not shipped — see docs/14-lore-seeding.md. Leave unset to
  # use the default (<app root>/dungeon-crawler-carl.jsonl). When no dataset is
  # present, the "seed with lore" checkbox is hidden.
  LORE_SEED_FILE=""
  ```

**Verify**: `git diff --check` → no whitespace errors; `npm run build` still
exits 0 (compose/env aren't built, but run it to confirm nothing else broke).

### Step 5: Operator doc

Create `docs/14-lore-seeding.md` covering:
- What it is: optional onboarding that imports a JSONL dataset through the
  review pipeline as a background job; the checkbox only appears when a dataset
  is available.
- **Legal note**: the official DCC dataset is copyrighted and intentionally not
  distributed with this project; bring your own.
- **File format**: JSON Lines, one object per line:
  `{ "text": "#<Name>\n<markdown body...>", "meta": "<source ref>" }`. The first
  line of `text` must be `#<Name>` (the entity name); the rest is the body used
  for classification + summary/description. Lines without a leading `#` title
  are skipped.
- A small **synthetic** example (invent generic fantasy entities — do NOT use
  DCC text), e.g.:

  ```jsonl
  {"text": "#Rusty Dagger\nis an item. A worn iron blade, +1 to attack.", "meta": "example"}
  {"text": "#Goblin Scout\nis a mob. A small green skirmisher found on early floors.", "meta": "example"}
  ```
- Where to put it / how to mount: place the file and either mount it to
  `/app/dungeon-crawler-carl.jsonl` (the default) or set `LORE_SEED_FILE` to a
  custom container path; show the `docker-compose.yml` volume uncomment and a
  raw `docker run -v "$PWD/my-lore.jsonl:/app/dungeon-crawler-carl.jsonl:ro"`
  example.
- Note the worker process needs the same mount (it runs the job).

Link it from `README.md` if there's a docs index/list; otherwise leave README
alone.

**Verify**: `npx vitest run tests/unit/seeding.test.ts` still passes.

## Test plan

- `tests/unit/seeding.test.ts`:
  - add a test for `isLoreSeedDatasetAvailable()`: with the existing fs mock
    active it returns `true`; add one case where `existsSync` returns false for
    the resolved path → `false`. (You may use `vi.mocked(fs.existsSync)` /
    a one-off `mockReturnValueOnce(false)`; keep the module-level mock intact
    for the other tests.)
  - optionally a `resolveLoreSeedPath()` test: unset → ends with
    `dungeon-crawler-carl.jsonl`; with `process.env.LORE_SEED_FILE` set →
    returns exactly that (restore the env var after).
- `tests/unit/create-campaign-form.test.tsx`:
  - existing tests render `<CreateCampaignForm />` with no prop — update them to
    pass `loreSeedAvailable={true}` (or `false` where the checkbox isn't under
    test). TypeScript now requires the prop.
  - the existing "renders the seedLore checkbox" test → render with
    `loreSeedAvailable={true}`, assert the checkbox is present.
  - **new**: render with `loreSeedAvailable={false}` → assert
    `screen.queryByRole("checkbox")` is `null` (checkbox hidden).
- `tests/unit/dashboard-page.test.tsx`: it now transitively calls
  `isLoreSeedDatasetAvailable()`. Mock `@/server/services/seeding`'s
  `isLoreSeedDatasetAvailable` (or ensure the render doesn't throw) so the page
  renders; assert it still renders the existing content. Follow the file's
  existing mocking style.
- `tests/unit/dm-actions.test.ts`:
  - the plan-007 "seedLore=on enqueues" tests must now mock
    `isLoreSeedDatasetAvailable` → `true` (mock the seeding module alongside the
    existing action-dep mocks).
  - **new**: `seedLore=on` but `isLoreSeedDatasetAvailable` → `false` → no
    enqueue, still redirects.

## Done criteria

- [ ] Dataset is NOT tracked and NOT copied into any image (`git ls-files |
      grep jsonl` → empty; no `COPY`/`ADD` of the dataset in `Dockerfile`).
- [ ] Checkbox renders only when a dataset is available; absent → hidden
      (component tests pass both ways).
- [ ] `createCampaignAction` enqueues `LORE_SEED` only when available (tests).
- [ ] `docs/14-lore-seeding.md` exists with format + synthetic example + legal
      note + mount instructions.
- [ ] `docker-compose.yml` has the commented mount on `app` and `worker`;
      `.env.example` documents `LORE_SEED_FILE`.
- [ ] `grep -rn "clearExisting" src/app src/components` → no matches.
- [ ] `npm run test:coverage`, `lint`, `typecheck`, `build` all exit 0; floors
      hold.
- [ ] `docs/PROGRESS.md` gets a short dated entry (2026-06-13) for this slice.
- [ ] `git status` clean outside the in-scope list (plans/ excluded — reviewer
      handles it).

## STOP conditions (stop and report, do not improvise)

- Gating the checkbox would require importing the server seeding module into the
  `"use client"` form (RSC violation) — if you can't pass availability as a prop
  cleanly, stop and report.
- `dashboard-page.test.tsx` can't render after the change without mocking
  something out of scope — report what it needs.
- Any approach that would require committing or `COPY`-ing the dataset — stop;
  that's explicitly forbidden.

## Maintenance notes

- Reviewer focus: (1) no dataset bundled/copied anywhere; (2) the RSC boundary
  (availability computed server-side, passed as a prop); (3) the server-side
  enqueue gate matches the client gate; (4) the compose mount stays commented
  (opt-in) so a default `docker compose up` doesn't error on a missing host
  file.
- Future: if M10 (shared library import) lands, this BYO-dataset mount
  generalizes to arbitrary import sources.
