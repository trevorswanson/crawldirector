# Plan 003: Paginate the World Browser and campaign timeline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bd64af7..HEAD -- src/server/services/entities.ts src/server/services/events.ts "src/app/(dm)/campaigns/[id]/page.tsx" "src/app/(dm)/campaigns/[id]/timeline/page.tsx" src/components/timeline`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (plan 007 soft-depends on this)
- **Category**: perf
- **Planned at**: commit `bd64af7`, 2026-06-12

## Why this matters

The World Browser loads **every** non-archived entity in the campaign in one
query, and the campaign timeline loads **every** event with nested
participants and cause/effect joins. There is no `take`/`skip` anywhere on
either path. This is not hypothetical scale: the repo ships a lore dataset of
1,660 entities (`dungeon-crawler-carl.jsonl`) and a seeding service that
imports all of it — a seeded campaign immediately renders 1,660 cards in a
single server-component pass. Payload, query time, and client render all grow
linearly (the timeline worse, due to join fan-out). Plan 007 (lore-seed
onboarding) makes this the *default* new-user experience, so pagination
should land first.

## Current state

- `src/server/services/entities.ts:303-382` — `listEntitiesForUser(userId,
  campaignId, filters)`: builds a `where` from filters (query / tag / type /
  status / lockedOnly / source), then:

  ```ts
  const entities = await prisma.entity.findMany({
    where: { campaignId, /* …filters… */ },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    select: entityListSelect,
  });
  return { entities, role: membership.role };
  ```

  No `take`. Returns `{ entities, role }`.

- `src/app/(dm)/campaigns/[id]/page.tsx` — the World Browser server
  component. Reads filters from `searchParams` (`q`, `tag`, `type`, `status`,
  `source`, `locked`, `archivedEntity`), calls `listEntitiesForUser` at
  line ~93 inside a `Promise.all` along with `getEntityTypeCounts`,
  `listCampaignTags`, `listFleshCandidates`, `listAiKeys`. Facet counts come
  from `getEntityTypeCounts` (its own aggregate — unaffected by pagination).
  Filter links are plain `<Link>`s that rewrite the query string.

- `src/server/services/events.ts:645-760` — `listCampaignTimeline(userId,
  campaignId)`: `prisma.event.findMany` with
  `orderBy: [{ orderKey: "desc" }, { rank: "desc" }, { createdAt: "desc" }]`,
  selecting participants (with entities), `causedBy` and `causes` (each with
  cause/effect event + its participants). No `take`. Post-processes into
  `CampaignTimelineEvent[]`, applying player-visibility filtering in JS.

- `src/app/(dm)/campaigns/[id]/timeline/page.tsx` — loads
  `listCampaignTimeline`, `listCampaignFloors`, and `listEntitiesForUser`
  (the last for the participant-picker `candidates`), passes everything to
  the `CampaignTimeline` client component
  (`src/components/timeline/campaign-timeline.tsx`), which renders floor
  bands, drag-reorder, causality warnings, and a `?event=` deep link.

- Conventions: pages are server components; filter state lives in the URL
  (`searchParams`, awaited — see the page head); UI primitives come from
  `src/components/ui` and the design tokens in `src/app/globals.css` (never
  hardcode hex); the service layer is the only Prisma caller. Service tests
  hit a real Postgres (exemplar: whatever currently tests
  `listEntitiesForUser` — see `tests/unit/` , e.g. the entities service
  tests; component/page tests mock services (exemplar:
  `tests/unit/campaign-timeline-page.test.tsx`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Start DB / migrate | `docker compose up -d db && npm run db:deploy` | exit 0 |
| Unit + coverage gate | `npm run test:coverage` | exit 0; floors 95/85/95/95 hold |
| One test file | `npx vitest run tests/unit/<file>` | all pass |
| Lint / typecheck / build | `npm run lint && npm run typecheck && npm run build` | exit 0 |
| E2E | `npm run test:e2e` | exit 0 |
| Seed at scale (manual check) | `npm run db:seed && npx tsx scripts/seed-lore.ts "Demo Campaign"` | imports ~1,660 entities |

The unit suite **wipes tables** in the configured DB.

## Scope

**In scope**:
- `src/server/services/entities.ts` (`listEntitiesForUser` only)
- `src/server/services/events.ts` (`listCampaignTimeline` only)
- `src/app/(dm)/campaigns/[id]/page.tsx`
- `src/app/(dm)/campaigns/[id]/timeline/page.tsx`
- `src/components/timeline/campaign-timeline.tsx` (only to accept/display the
  truncation affordance — see Step 4)
- Tests for the above

**Out of scope** (do NOT touch):
- The participant-picker `candidates` list on the timeline page and other
  picker lists — PROGRESS.md explicitly defers picker scaling to M5
  search/typeahead ("Scale refinements for pickers and graph labels").
- `getEntityTypeCounts`, `listCampaignTags`, `listFleshCandidates` — facets
  and panels keep their own queries.
- The relationship graph page (`/campaigns/[id]/graph`) — separate surface,
  separate decision (graph deliberately shows the whole edge set; revisit
  with M12 per PROGRESS.md).
- The Review Queue page.
- Drag-reorder, causality ordering, and `rank` logic.

## Git workflow

- Branch **from `main`**: `improve/003-pagination`
- Commit style: conventional commits, e.g. `feat(entities): paginate the World Browser entity list`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add paging to `listEntitiesForUser`

Extend the signature with an optional paging arg, defaulting to existing
behavior so the timeline page's candidates call (out of scope) is untouched:

```ts
listEntitiesForUser(userId, campaignId, filters = {}, paging?: { page: number; pageSize: number })
```

When `paging` is provided: run `prisma.entity.count({ where })` and the
`findMany` with `skip: (page - 1) * pageSize, take: pageSize` in a
`Promise.all`, and return `{ entities, role, total, page, pageSize }`. When
absent: behavior and return shape unchanged (`total` etc. may be returned
always if you keep the call sites compiling — pick whichever keeps the diff
smallest, but the un-paged path must not run the extra `count` query…
returning `total: entities.length` for the un-paged path is acceptable and
avoids a second query). Offset pagination is deliberate: the list is
mutable-ordered (`updatedAt desc`), page counts are small, and cursor
pagination over a two-key sort is not worth the complexity here.

Clamp `page` to ≥ 1 and `pageSize` to ≤ 100.

**Verify**: `npm run typecheck` → exit 0; existing entities-service tests pass
(`npx vitest run tests/unit/entities.test.ts` — confirm the actual filename
with `ls tests/unit | grep -i entit` first).

### Step 2: Wire the World Browser to a `page` search param

In `src/app/(dm)/campaigns/[id]/page.tsx`:

- Add `page?: string` to the `searchParams` type; parse with
  `Math.max(1, parseInt(filters.page ?? "1", 10) || 1)`.
- Call `listEntitiesForUser(user.id, id, {…}, { page, pageSize: 60 })`.
- Below the card grid, render a pager: "Showing X–Y of Z" plus Previous/Next
  `<Link>`s that preserve every existing filter param and set `page`. Build
  hrefs with `URLSearchParams` the same way the existing filter links do
  (read how the type/status facet links construct their query strings and
  match that pattern exactly). Hide Previous on page 1, Next on the last
  page. Use existing design primitives (`src/components/ui`) — no new CSS,
  no hex values.
- A filter change naturally resets to page 1 because filter links don't carry
  `page` — verify none of the existing filter-link builders propagate
  unknown params; if they spread all current params, exclude `page` there.

**Verify**: `npm run build` → exit 0. Then manually: seed the lore campaign
(command table), open `/campaigns/<id>`, confirm 60 cards + pager, page 2
works, filters reset paging. (Also covered by tests in Step 5.)

### Step 3: Window `listCampaignTimeline`

Add an optional `{ limit?: number }` options arg. When set, apply
`take: limit` to the `findMany` (ordering is already newest-first), and
return enough information for the caller to know truncation happened. Change
the return type to `{ events: CampaignTimelineEvent[]; totalEvents: number;
truncated: boolean }` where `totalEvents` comes from a `prisma.event.count`.
Update the one production call site and any tests to destructure
(`grep -rn "listCampaignTimeline" src tests` to find them all).

**The count and the window must respect the player projection.** Today,
player visibility is applied in two layers: `secret: false` in the SQL
`where`, plus a **JS post-filter** that drops events whose participants are
all player-hidden (`if (isPlayer && participants.length === 0) continue`). A
count (or a `take` window) computed from the SQL `where` alone therefore
includes events a player will never see — exposing the existence/number of
hidden participant-only events through the "(N total)" label, and producing
under-full windows for players. Fix this by pushing the post-filter's rule
into the SQL `where` for players:

- Read the `isPlayerVisible(entity)` helper in `events.ts` to get the exact
  per-entity visibility conditions, and add (players only) a
  `participants: { some: { entity: { …those same conditions… } } }` clause to
  the shared `where` used by **both** the `findMany` and the `count`.
- Keep the existing JS per-participant filtering — it still strips hidden
  co-participants from the participant *lists* of visible events — but the
  events-with-no-visible-participants drop should now be redundant for the
  query results. Keep the JS guard in place as belt-and-braces; add a
  comment that the SQL clause is what makes `totalEvents`/`take` projection-
  correct.
- **Fallback if the rule is not expressible in a `where`** (e.g.
  `isPlayerVisible` consults something beyond entity columns): do not window
  for players at all — players get the full (projected) list, no truncation
  UI, exactly today's behavior — and only DM/co-DM roles get
  `limit`/`totalEvents`. Zero leak, and player-visible event sets are the
  smaller ones anyway. State in the code which branch was taken and why.

**Verify**: `npx vitest run tests/unit/events.test.ts` (confirm filename) →
existing tests updated for the new shape, all pass.

### Step 4: Timeline page — "Load older" growth window

In `timeline/page.tsx`:

- Add `window?: string` to `searchParams`; compute
  `limit = clamp(parseInt(window) || 1, 1, 50) * 200`.
- Call `listCampaignTimeline(user.id, id, { limit })`.
- Pass `truncated` and a pre-built "load older" href
  (`?window=<n+1>`, preserving `event` if present) into `CampaignTimeline`
  as new optional props; inside the component, when `truncated` is true,
  render a "Show older events (N total)" link at the bottom of the event
  stream using an existing button/link primitive. Growth-window (re-query
  with a larger take) rather than true paging is deliberate: the component's
  floor bands, drag-reorder, and causality warnings all assume a contiguous
  newest-first slice.
- One interaction to handle: the `?event=` deep link may point at an event
  outside the current window. Detect it server-side (the id not present in
  `events`) and, in that case, fall back to loading all (omit `limit`)
  rather than breaking the deep link. Add a code comment stating this rule.
- Role note: with Step 3's SQL-projection clause, `totalEvents` for a player
  counts only player-visible events, so the "(N total)" label is safe for
  every role. If Step 3 had to take its fallback branch instead, the page
  must not pass `limit` (and must not render the truncation link) for
  players — gate on the same role signal the page already computes for
  `canEdit`.

**Verify**: `npm run build` → exit 0; `npx vitest run tests/unit/campaign-timeline-page.test.tsx tests/unit/campaign-timeline.test.tsx` → pass after prop updates.

### Step 5: Tests

See Test plan.

**Verify**: `npm run test:coverage` → exit 0, floors hold. `npm run test:e2e`
→ exit 0 (e2e specs from plan 001, if present, must still pass — they create
few entities, so paging must not regress small campaigns).

## Test plan

- **Service (real Postgres)** — extend the existing entities/events service
  test files, matching their seed helpers:
  - paged `listEntitiesForUser`: create 5 entities, `pageSize: 2` → page 1
    has 2, page 3 has 1, `total === 5`; filters compose with paging (e.g.
    type filter + page); un-paged call shape unchanged.
  - `listCampaignTimeline` with `limit: 2` on 3 events → newest 2 returned,
    `truncated === true`, `totalEvents === 3`; without `limit` → all, not
    truncated. Player-role variant still hides secret events.
  - **Player-projection count** (the leak regression test): campaign with 3
    events — one normal, one `secret`, one whose only participant is a
    `DM_ONLY` entity. As a PLAYER with `limit: 10`: `events.length === 1`
    and `totalEvents === 1` — the count must never include the secret or
    hidden-participant events. As the DM: `totalEvents === 3`. Also assert
    the player's `take` window fills with visible events (e.g. 3 visible +
    2 hidden + `limit: 3` → 3 events returned, not 1–2).
- **Page/component (jsdom, services mocked)** — extend
  `tests/unit/campaign-timeline-page.test.tsx` and the World Browser page
  test (find it: `ls tests/unit | grep -i "page"` → the campaign page test):
  pager renders with correct prev/next hrefs at page 1 / middle / last;
  "Show older" link renders only when `truncated`.

## Done criteria

- [ ] `listEntitiesForUser` and `listCampaignTimeline` accept paging/limit
      options; default no-arg behavior preserved for out-of-scope callers
- [ ] World Browser at 61+ entities renders a pager; `?page=2` works with
      filters intact
- [ ] Timeline at 201+ events renders "Show older"; `?event=` deep links to
      old events still resolve
- [ ] Player-projection count test (Test plan) passes: `totalEvents` for a
      PLAYER never includes secret or hidden-participant events
- [ ] `npm run test:coverage`, `npm run lint`, `npm run typecheck`,
      `npm run build`, `npm run test:e2e` all exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpted query shapes in "Current state" don't match the live code.
- `CampaignTimeline` turns out to require the full event set for a feature
  not listed here (e.g. the drag-reorder needs *all* of a floor's events to
  compute neighbors and a floor straddles the window boundary in a way that
  breaks rank generation) — report the specifics instead of widening the
  window logic ad hoc.
- Making the pager work requires converting a server component to a client
  component.
- Any out-of-scope caller of these services fails to compile under the
  default-preserving signatures.

## Maintenance notes

- M5 (search/typeahead) replaces the picker lists; when it lands, revisit
  whether the World Browser should switch to search-driven retrieval rather
  than offset paging.
- Plan 007 (lore-seed onboarding) assumes this plan landed — it creates
  1,660-entity campaigns as a normal flow.
- Reviewer focus: filter links must not leak a stale `page` param; the
  timeline deep-link fallback (load-all) is the deliberate trade-off, check
  it's commented; and the timeline `count` must share the *player-projected*
  `where` (invariant #5) — a count built from the pre-projection filters
  reveals hidden-event existence to players.
- "Order from causality" (`orderEventsFromCausality`) operates server-side on
  whole floors regardless of the display window — unaffected, but a reviewer
  should confirm no UI handler passes the windowed list into it.
