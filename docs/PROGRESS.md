# PROGRESS

Running checklist of milestones/tasks, newest first. See
[`11-roadmap.md`](./11-roadmap.md) for the full plan and
[`12-working-sessions.md`](./12-working-sessions.md) for how to pick up work.

## Open backlog from docs / ADRs (authoritative pickup list)

This section is the first stop for deferred work found outside the newest
milestone entries. Older sections may preserve historical context, but open
items should be mirrored here so agents do not have to rediscover them by
keyword-scanning every doc.

### Active next slices

All milestones through **M5 — Search & retrieval** are complete; per-slice detail
lives in the dated sections below (and older milestones in
[`PROGRESS-archive.md`](./PROGRESS-archive.md)). The cross-cutting **ADR 0009
entity-kind registry** is also fully delivered — only the brand-new-`EntityType`
"proof" remains, and it rides along with M7's `BOX` (see the game-progression item
under *Deferred design options*). So is the **visibility-model simplification** and
the full **M4 generator expansion** (scaffolding, usage/cost + spend caps, bulk
flesh-out, async `Job` worker).

**Next milestone: M6 — System AI persona engine**
([11-roadmap.md](./11-roadmap.md),
[05-system-ai-persona.md](./05-system-ai-persona.md)) — not yet started or
decomposed into slices. Decompose it into vertical slices per
[`12-working-sessions.md`](./12-working-sessions.md) when picking it up. (Open,
non-milestone-blocking follow-ups and deferrals live in the subsections below.)

### Follow-ups captured from delivered slices

- [ ] **Entity image support (M1 follow-up).** Support uploading or linking a main image (`imageUrl`) for any entity:
      - Add `imageUrl String?` to the `Entity` database model and validate on writes.
      - Add image upload/input to `EntityForm` (fully reviewable, lockable, and provenance-tracked).
      - Render the image/avatar in the entity detail header (avatar size for characters, card/illustration style for items/locations/floors).
- [ ] **Knowledge / reveal grants.** Extend beyond ENTITY→ENTITY to
      field/relationship/event/FACT targets and MEMBERSHIP recipients; wire the
      M7 player "known world" projection and M11 agent fog-of-war context; add a
      reveal undo affordance and source-event linking for M8 session reveals.
- [ ] **Event effects ergonomics.** Deep-link timeline pending-effect badges to
      their Review Queue proposals, and design compensating change sets for
      undo/revert of already-applied effects.
- [ ] **Timeline roster snapshots.** Let the timeline pass an inferred/current day
      into `getGroupRoster({ asOfDay })` when the DM wants a roster snapshot from
      a selected event or floor-day band.
- [ ] **Scale refinements for pickers and graph labels.** Revisit connection /
      timeline target lists with M5 search/typeahead, and revisit relationship
      graph label crowding with M12 graph analytics.
- [ ] **M8/M12 broadcast HUD chrome.** Add a live broadcast ticker with session
      events/reveals in M8, and at-a-glance audience-rating tickers with M12
      broadcast/fan-economy modeling.

### Deferred design options, not current blockers

- [ ] **Review Queue auto-supersede.** Optional: auto-supersede fully obsolete
      proposals when canon changes underneath. Current design deliberately keeps
      stale proposals pending for DM three-way review.
- [ ] **Relationship per-edge display labels.** Optional schema addition:
      per-edge display/inverse-label overrides. ADR 0003 intentionally defers
      this until real one-off phrasing needs appear.
- [ ] **Time model refinements.** Cross-floor wall-clock ordering, per-event
      time uncertainty/ranges, recurring scheduled events, floor-duration
      uncertainty, sub-floor "current zone," and per-crawler spatial history
      beyond the event log remain intentionally out of scope unless a campaign
      needs them.
- [ ] **Coverage ratchet.** `FxToggle` and `DmNav` render/interaction tests now
      exist. The current gate is 95% statements / 85% branches / 95% functions /
      95% lines; raise the branch floor toward 90% when aggregate branch coverage
      supports it.
- [ ] **Campaign settings page redesign & expansion (M9).** Redesign the settings
      page `/campaigns/[id]/settings` to use the three-pane layout. The middle
      pane will act as a sub-nav with options:
      - **General**: Campaign name, description, and visibility toggle (allow dungeons to be publicly visible if the DM wants).
      - **Crawlers**: Inviting other users to the campaign and managing user memberships/roles.
      - **AI Providers**: BYO API keys configuration.
- [ ] **Game-progression modeling (M7).** Implement:
      - **Event achievement grants**: Allow events to grant achievements to crawlers via a structured `GRANT_ACHIEVEMENT` event effect.
      - **Achievement box rewards**: Model `BOX` as a new `EntityType`. Allow achievements to grant boxes (e.g. via `GRANTS_BOX` relationships).
      - **Box contents**: Support boxes containing items (using `CONTAINS` relationships from box entities to item entities).

### Done — non-M6 backlog follow-ups (2026-06-17)

- [x] **Global current floor & day HUD.** Added a route-aware topbar HUD
      (`GlobalCampaignStatus`) that fetches through `getCampaignHeaderStatusAction`
      / `getCampaignHeaderStatus` and renders the current floor from
      `Campaign.currentFloorId`; when event times resolve via `resolveAbsoluteDay`,
      it appends the latest inferred absolute day (e.g. `Floor 9 · Day 52`). The
      read model is membership-scoped and mirrors timeline player projection for
      floor/event visibility.
- [x] **Scaffold-stubs dedup at scale.** `scaffoldStubEntities` now keeps the
      prompt's existing-name sample bounded while retaining the full live canon
      name set for service-side post-hoc exact-name collision filtering before
      filing `CREATE_ENTITY` operations. `SCAFFOLD_STUBS_GENERATOR.version` is
      now `2` because the prompt contract changed.

### Done — DM job queue + semantic rebuild duplicate guard (2026-06-17)

- [x] **DM job queue page.** Added `/campaigns/[id]/jobs`, linked from the DM nav,
      showing the recent safe job display fields across `BULK_FLESH`,
      `LORE_SEED`, and `EMBED_SEARCH_DOCS`: kind, status, timing, safe failure
      text, and known success summaries such as semantic docs embedded.
- [x] **Semantic rebuild guard.** Added `enqueueBuildSemanticIndexJob()` in
      `src/server/services/jobs.ts`; manual **Build semantic index** clicks
      serialize on the campaign row and return an existing active
      `EMBED_SEARCH_DOCS` job when one is already `QUEUED` or `RUNNING`, instead
      of queueing overlapping paid embedding work. This deliberately does not
      change the auto re-embed scheduler's ability to queue a follow-up while a
      worker is running and canon content changes underneath it.
- [x] **Search page UI.** The build button receives the active semantic job,
      disables itself while a rebuild is queued/running, and points the DM to the
      Job Queue for status. The server action revalidates both the search page
      and the jobs page after enqueue/duplicate detection.
- [x] **Tests:** `jobs.test.ts` covers active semantic job dedupe (`QUEUED` and
      `RUNNING`) plus new active-job lookup; `dm-actions.test.ts`,
      `build-semantic-index-button.test.tsx`, and `search-page.test.tsx` cover
      action/UI disable behavior; `job-queue.test.tsx`, `jobs-page.test.tsx`, and
      `console-shell.test.tsx` cover the queue surface and nav link.

### Done — bring-your-own lore dataset + seed-checkbox gating (2026-06-13)

- [x] `resolveLoreSeedPath()` and `isLoreSeedDatasetAvailable()` exported from `seeding.ts`; `seedCampaignFromLore` uses the resolver (respects `LORE_SEED_FILE` env var).
- [x] `CreateCampaignForm` accepts a required `loreSeedAvailable: boolean` prop; the seedLore checkbox renders only when `true`.
- [x] `DashboardPage` (server component) calls `isLoreSeedDatasetAvailable()` and passes the result down as `loreSeedAvailable`.
- [x] `createCampaignAction` gates the `LORE_SEED` enqueue on `isLoreSeedDatasetAvailable()` (defense in depth).
- [x] `docker-compose.yml`: commented-out bind-mount example on both `app` and `worker` services (opt-in; missing host file would error).
- [x] `.env.example`: documents `LORE_SEED_FILE`.
- [x] `docs/14-lore-seeding.md`: operator doc with legal note, JSONL format, synthetic example, mount instructions for docker-compose and raw `docker run`.
- [x] Tests: `seeding.test.ts` gains `resolveLoreSeedPath` + `isLoreSeedDatasetAvailable` tests; `create-campaign-form.test.tsx` passes `loreSeedAvailable` prop + new "false → checkbox hidden" case; `dashboard-page.test.tsx` mocks `isLoreSeedDatasetAvailable`; `dm-actions.test.ts` mocks seeding module + new "available=false → no enqueue, still redirects" test.
- [x] Dataset is NOT tracked or bundled anywhere (`git ls-files | grep jsonl` → empty).

### Done — opt-in DCC lore seed at campaign creation (2026-06-13)

- [x] Added `LORE_SEED` to `enum JobKind` (additive `ALTER TYPE ... ADD VALUE` migration).
- [x] `seedCampaignFromLore` now throws `ServiceError` (was plain `Error`) for the membership and missing-file cases; added an idempotency guard that rejects re-seeding a non-empty campaign unless `clearExisting` is set.
- [x] `jobHandlers.LORE_SEED` delegates to `seedCampaignFromLore(job.createdById, job.campaignId)`; `clearExisting` is not reachable from the handler.
- [x] `CreateCampaignForm` has an unchecked-by-default native checkbox (`name="seedLore"`, no `value` attribute); submits `"on"` when checked.
- [x] `createCampaignAction`: after campaign creation, if `seedLore === "on"` enqueues a `LORE_SEED` job in its own try/catch — enqueue failure never blocks the redirect.
- [x] Tests: seeding ServiceError assertions updated; non-empty campaign guard test added; LORE_SEED handler delegation test (mocked seeding module); dm-actions tests for seedLore=on/off/enqueue-throw; form checkbox test.

## M5 — Retrieval-fed generator context: flesh-out enrichment (slice 6, part 2) ✅ (2026-06-17)

**Goal:** the second consumer in [`07-search-retrieval.md`](./07-search-retrieval.md)
§"Retrieval-augmented context" — give the entity flesh-out generator the *relevant*
slice of surrounding canon as read-only reference so its proposed summary/
description stay consistent with the world, instead of writing in isolation
(today it sees only its own target + the campaign's tag vocabulary). This is
additive enrichment, not a dump replacement, which is why it was tracked separately
from part 1. With both retrieval-shaped generators wired, **M5's "done when" bar is
met**. Branch: `feat/m5-search-slice6-flesh-enrichment`. No schema change.

- [x] **Flesh-out rewired** ([`generation.ts`](../src/server/services/generation.ts)):
      `fleshOutEntityLocked` now calls `retrieveRelatedEntityIds` (the existing
      slice 6 seam) for the target, hydrates the top `FLESH_RELATED_LIMIT` (8)
      relevant CANON entities preserving retrieval rank order, and passes them to
      the prompt as `relatedCanon`. **Locked entities are intentionally kept** as
      reference (doc 07: "locked items relevant to the task are retrieved and
      included as read-only do-not-modify context") — unlike relationship inference,
      which excludes locked endpoints from its *proposable* set; flesh-out only ever
      proposes against its own target, so referencing locked canon can't violate
      invariant #2. Because `bulk-flesh` calls `fleshOutEntity` per entity, the bulk
      panel and the `BULK_FLESH` job inherit the enrichment with no extra wiring.
- [x] **Prompt builder** ([`flesh-entity.ts`](../src/server/ai/generators/flesh-entity.ts)):
      `FleshEntityContext` gains an optional `relatedCanon`; the volatile user
      message lists each related entity (`type · name: summary [tags]`, honest
      `(no summary yet)` fallback) under a "reference — keep your additions
      consistent with this; do not restate or modify it" header, and the cacheable
      system block gains a read-only-reference rule. `FLESH_ENTITY_GENERATOR.version`
      bumped **1 → 2** (the prompt framing changed meaningfully — provenance now
      distinguishes enriched runs).
- [x] **Cost discipline.** The query-embed inside `searchCanon` is already metered
      + cap-gated (slice 4a), and `fleshOutEntityLocked` now **re-checks the spend
      cap after retrieval** and before the chat call (mirrors
      `inferRelationshipsForEntityLocked`), so a campaign just under its cap can't
      incur the extra paid generation call after a paid query-embed. With no
      embedder, retrieval is free full-text and the prompt still gains relevant
      reference context.
- [x] **Tests:** pure
      [`flesh-entity-generator.test.ts`](../tests/unit/flesh-entity-generator.test.ts)
      gains related-canon rendering (present → reference block + system rule;
      no-summary fallback; absent → no section) and the v2 provenance assertion.
      DB-backed [`generation.test.ts`](../tests/unit/generation.test.ts) gains a
      real-Postgres + real-`searchCanon` case that a term-sharing entity is surfaced
      into the prompt while an unrelated one is excluded, and that a **fully locked**
      related entity is still offered as read-only reference (the doc-07 contract
      that distinguishes flesh-out from inference). The existing flesh-out cases
      (style guide, campaign tags, locked-field exclusion, usage/cap) stay green.
- [x] **Verification:** RED/GREEN, then `npm run test -- tests/unit/retrieval.test.ts
      tests/unit/search.test.ts tests/unit/embeddings.test.ts
      tests/unit/dm-actions.test.ts tests/unit/flesh-entity-generator.test.ts
      tests/unit/generation.test.ts` (259 tests), `npm run lint` (0 errors;
      pre-existing settings-action warnings only), `npm run typecheck`,
      `npm run build`, and the full coverage gate green (100 files / 1356 tests;
      statements 95.82%, branches 88.94%, functions 97.98%, lines 97.65%). The
      retrieval → prompt assembly runs end-to-end against **real Postgres + the real
      `searchCanon`**; the provider call stays the documented key-gated M4/M5
      boundary (a synthesized run needs the DM's own valid BYO key + spend), covered
      by the mocked-provider service tests. **No new UI surface** (flesh-out is
      triggered from existing buttons and the enrichment changes only the prompt the
      server builds), so — as with slice 6 part 1 — no browser smoke this slice.

## M5 — Retrieval-fed generator context: relationship inference (slice 6, part 1) ✅ (2026-06-17)

**Goal:** the second consumer in [`07-search-retrieval.md`](./07-search-retrieval.md)
§"Retrieval-augmented context" — replace ad-hoc canon-dumping in the M4 generators
with principled retrieval over scoped canon. The one generator that *literally*
dumped canon was relationship inference: it offered the model the first 40
**alphabetical** entities as candidate edge endpoints, so at DCC's scale the
genuinely related entities rarely fell inside that window. Branch:
`feat/m5-search-slice6-retrieval-context`. No schema change.

- [x] **Retrieval seam** ([`retrieval.ts`](../src/server/services/retrieval.ts)):
      a thin wrapper over `searchCanon`. `buildEntityRetrievalQuery` (pure) OR-joins
      a seed entity's salient identifiers (name + tags) so the full-text arm matches
      *any* shared term — `websearch_to_tsquery` ANDs whitespace-separated words, so
      a natural-language seed would over-constrain and match almost nothing in a
      no-embedder campaign. `retrieveRelatedEntityIds(userId, campaignId, seed)` runs
      `searchCanon`, returns the entity-hit ids in rank order, and excludes the seed
      itself. Two guarantees fall out of reusing `searchCanon`: **scope** (it projects
      by the requester's role — a DM generator sees full canon; a future in-character
      agent path would see only player-visible canon, invariant #5) and **graceful
      degradation** (semantic ranking is additive inside `searchCanon`; a campaign
      with no embedding-capable key still gets full-text retrieval).
- [x] **Relationship inference rewired** ([`generation.ts`](../src/server/services/generation.ts)):
      `inferRelationshipsForEntityLocked` builds its candidate set from
      `retrieveRelatedEntityIds` (relevance-ranked) instead of the alphabetical
      `take: 40`, then hydrates details under the existing `locked: false` / `CANON`
      filter so locked endpoints still stay out of the proposable set (invariant #2 —
      a relationship create never modifies its endpoints, but we keep the prior
      contract). An alphabetical baseline is kept as a **coverage floor** (deduped,
      capped at 40): retrieval orders the relevant entities first and guarantees they
      reach the model even in a large campaign, while a small campaign keeps full
      coverage and the never-empty guard is unchanged. Retrieval is therefore purely
      **additive** — it can only re-order and widen which related entities the model
      sees, never narrow below the old behavior.
- [x] **Deliberate deferrals (documented).** Flesh-out and scaffold-stubs were *not*
      rewired in this part. Flesh-out loaded only its own target at the time — there
      was no cross-canon dump to replace; adding related-canon *reference* context
      was additive enrichment (and, with an embedder, a paid per-run query embed), so
      it was tracked separately and delivered in slice 6 part 2. Scaffold-stubs
      deliberately remains not retrieval-fed because dedup needs an *exhaustive*
      existing-name check, not a relevance subset; its scaling fix is now the
      post-hoc service dedupe noted in the 2026-06-17 non-M6 backlog follow-ups.
- [x] **Tests:** new pure + DB-backed
      [`retrieval.test.ts`](../tests/unit/retrieval.test.ts) (query builder OR-join /
      trim / empty; term-sharing retrieval returns the related id and excludes the
      seed; **a player never retrieves DM-only canon — invariant #5**; non-member and
      empty-seed → `[]`). `generation.test.ts` gains a real-Postgres assertion that a
      term-sharing, alphabetically-*last* candidate is offered to the model ahead of
      an alphabetically-*first* unrelated one (proving retrieval re-ordering); its
      `@/server/ai` mock became a **partial** mock (`importOriginal`) so retrieval's
      real `searchCanon` runs (full-text, no key), and `searchDoc` is cleaned per
      test. All existing infer-relationships cases (locked-endpoint exclusion,
      candidate/edge prompt framing, pending-dupe suppression) stay green.
- [x] **Verification:** RED/GREEN, then `npm run test -- tests/unit/retrieval.test.ts
      tests/unit/generation.test.ts tests/unit/search.test.ts
      tests/unit/embeddings.test.ts tests/unit/dm-actions.test.ts` (236 tests),
      `npm run lint` (0 errors; pre-existing settings-action warnings only),
      `npm run typecheck`, `npm run build`, and the full coverage gate green (100
      files / 1349 tests; statements 95.79%, branches 88.85%, functions 97.97%,
      lines 97.65%). The retrieval candidate-selection runs end-to-end against
      **real Postgres + the real `searchCanon`** in the service tests; the provider
      call stays the documented key-gated M4/M5 boundary (a fully synthesized
      inference run needs the DM's own valid BYO key + spend), covered by the
      mocked-provider service tests. No new UI surface, so no browser smoke this
      slice.
- [x] **Review fixes (Codex on PR #141).** (1) `searchCanon` gained an optional
      `targetTypes` filter (threaded into `buildSearchDocSearchSql`'s candidate
      scan) and `retrieveRelatedEntityIds` constrains retrieval to ENTITY docs, so
      relationship/event matches can't consume the LIMIT window and push relevant
      entities off the page. (2) `inferRelationshipsForEntityLocked` re-checks the
      spend cap *after* retrieval (which may have spent a paid query-embed) and
      before the chat generation call, so a campaign just under its cap can't incur
      an extra paid inference call. Tests: `search.test.ts` (SQL `targetType IN`
      shape + a behavioral ENTITY-only filter case) and `retrieval.test.ts` (a
      relationship matching the seed term doesn't block entity retrieval).

## M5 — Ask the Campaign: retrieval-augmented Q&A with citations (slice 5) ✅ (2026-06-16)

**Goal:** the user-facing half of [`07-search-retrieval.md`](./07-search-retrieval.md)
§"Ask the Campaign" — a natural-language Q&A that retrieves the relevant slice of
canon and has a BYO-key model synthesize a **cited** answer. Strictly read-only:
answering never writes canon (invariant #1); it is a synthesized view with
citations, not a proposal. Visibility is enforced **at retrieval** (invariant #5)
— a player's ask can only ever see what `searchCanon` already projected for their
role, so the model never receives DM-only or secret canon. Branch:
`feat/m5-ask-the-campaign`. No schema change (answers aren't persisted).

- [x] **Pure generator** ([`ask-campaign.ts`](../src/server/ai/generators/ask-campaign.ts)):
      `ASK_CAMPAIGN_GENERATOR` identity, `buildAskPrompt` (a cacheable system
      block that frames a grounded, read-only, `[n]`-cited answer + optional
      cacheable style-guide block + a player fog-of-war reminder; numbered source
      list + question in the volatile user message), and `parseCitedIndices`
      (extracts sorted, de-duplicated, **in-range** `[n]` markers so a
      hallucinated `[9]` against 3 sources can't produce a dangling link). No DB,
      no SDK, no secrets — exhaustively unit-tested.
- [x] **Service** ([`ask.ts`](../src/server/services/ask.ts)): `askCampaign(userId,
      campaignId, question)` — checks membership, validates the question (non-empty,
      ≤ `MAX_QUESTION_LENGTH`), requires a chat provider (`resolveCampaignProvider`;
      none → safe `ServiceError` — Ask needs a model, unlike full-text search),
      honors the spend cap **before** any paid work, then retrieves the top
      `ASK_RETRIEVAL_LIMIT` (12) hits via `searchCanon` (role-scoped). No hits →
      returns a "canon is silent" answer **without** a provider call (no cost, no
      hallucination from an empty context). Otherwise it hands the model the
      retrieved docs' denormalized `SearchDoc.content` as numbered sources, calls
      `provider.generate`, records `AiUsage` (`generatorId: "ask-campaign"`,
      best-effort — never loses a paid answer over a usage write), and maps the
      `[n]` citations back to per-source `{ kind, label, href }` (entity detail /
      graph / timeline) with a `cited` flag. Provider failures → safe
      `describeProviderError` message (invariant #6).
- [x] **Action + UI.** `askCampaignAction` ([`actions.ts`](<../src/app/(dm)/actions.ts>))
      returns `{ answer, grounded, sources, model, error }` (read-only — no
      revalidate). A new `/campaigns/[id]/ask` page (server component) gates on a
      configured chat provider — renders the panel, or a "configure a key in
      Settings" notice otherwise (full-text/semantic search keep working without
      one). The client `AskPanel` ([`ask-panel.tsx`](../src/components/ask/ask-panel.tsx))
      is a question textarea + a citation-aware answer renderer that linkifies each
      `[n]` to its source, plus a "Sources · retrieved from canon" list (icon +
      kind + label, "Cited" tag) for verification, and a "never saved as canon"
      note. **Nav:** added an **Ask the Campaign** DM-nav item and retired the
      topbar's "Ask · M5" planned badge (now `Search · Ask the Campaign…`, matching
      the mockup).
- [x] **Tests:** pure `ask-campaign.test.ts` (prompt framing/numbering/style-guide/
      player-reminder; citation parse incl. out-of-range/dedup/empty). DB-backed
      `ask.test.ts` — grounded cited answer surfaces the retrieved canon as numbered
      source context; only model-cited sources flagged; **a player's ask never
      retrieves DM-only canon and the DM-only doc never reaches the model's context
      (invariant #5)**; relationship + event sources link to graph/timeline; no-hit
      → "canon is silent" with no provider call; no-provider / blank / oversized /
      non-member / spend-cap rejections; a provider failure becomes a safe
      ServiceError that doesn't echo the key (invariant #6); usage row recorded.
      `dm-actions.test.ts` (action passes the question, returns answer/sources, no
      revalidate, ServiceError + generic fallback); `ask-panel.test.tsx` (form +
      read-only note; cited `[n]` link + sources list; ungrounded no-list; error);
      `ask-page.test.tsx` (404; provider-gated panel vs. configure-a-key notice);
      `console-shell.test.tsx` + `global-search-link.test.tsx` updated for the new
      nav/topbar.
- [x] **Verification:** RED/GREEN, then `npm run test -- tests/unit/ask.test.ts
      tests/unit/ask-campaign.test.ts tests/unit/ask-panel.test.tsx
      tests/unit/ask-page.test.tsx`, `npm run lint` (0 errors; pre-existing
      settings-action warnings only), `npm run typecheck`, `npm run build` (the
      `/campaigns/[id]/ask` route compiles), and the full coverage gate
      (`npm run test:coverage`) green — statements 95.77%, branches 88.91%,
      functions 97.94%, lines 97.6%. **In-browser** (reseeded `dcc` + `scripts/seed-world.ts`,
      authed as `dm@example.com`): the Ask page renders with the new nav item /
      topbar / provider-gating notice and no console errors; with a placeholder
      Anthropic key the panel renders, a long natural-language question over
      full-text-only retrieval correctly returns the "canon is silent" answer with
      **no** provider call, and a keyword question (`Princess Donut`) retrieves
      canon → calls the provider → the placeholder key fails to a safe
      "authentication failed" alert with **no key/raw text in the DOM**
      (invariant #6). A fully synthesized answer needs the DM's own valid BYO key +
      spend (the documented M4/M5 boundary), covered by the mocked-provider service
      tests.

## M5 — Semantic layer: ANN index + embedding dimensions (slice 4c) ✅ (2026-06-16)

**Goal:** finish the deferred semantic-search performance/config slice from
[`07-search-retrieval.md`](./07-search-retrieval.md): keep the default
OpenAI-compatible path fast with a pgvector ANN index, while letting DMs name
the vector dimension for compatible custom embedding models.

- [x] **Schema + migration** (`20260616193000_m5_embedding_ann_dimension`):
      `AiKey.embeddingDimensions` stores the DM's optional non-secret vector-width
      config, and `SearchDoc.embeddingDimensions` records the actual dimension
      written beside each derived embedding. `SearchDoc.embedding` is widened from
      `vector(1536)` to unconstrained `vector`; existing rows backfill their
      dimension via `vector_dims(embedding)`.
- [x] **ANN index decision:** added raw SQL
      `SearchDoc_embedding_hnsw_1536_idx` on
      `(embedding::vector(1536)) vector_cosine_ops` for rows with
      `embeddingDimensions = 1536`. Prisma still cannot represent pgvector HNSW
      indexes in `@@index`, so the index intentionally lives in the migration
      and the query shape is kept aligned with that expression.
- [x] **Hybrid query shape** ([`search.ts`](../src/server/services/search.ts)):
      semantic search now preselects nearest candidates in a
      `semantic_candidates AS MATERIALIZED` CTE ordered by raw cosine distance
      (`embedding::vector(1536) <=> query::vector(1536)` for the indexed default
      path), then blends those candidates with full-text `ts_rank`. Non-1536
      dimensions remain supported through exact vector search, filtered by both
      `embeddingModel` and `embeddingDimensions`.
- [x] **Config plumbing:** provider metadata exposes default embedding dimensions,
      `setAiKey` / Settings UI accept an optional dimension, and
      `resolveCampaignEmbedder` passes it to the OpenAI-compatible adapter. Legacy
      configs still default to 1536 unless a DM sets a dimension.
- [x] **Embedding freshness:** `embedSearchDocs` treats model or dimension changes
      as stale, writes `embeddingDimensions` with the vector, and content changes
      clear both the model and dimension markers so stale vectors are excluded
      until the worker refreshes them.
- [x] **Tests / verification:** RED/GREEN focused suite covers the HNSW index DB
      contract, ANN-friendly SQL shape, custom-dimension config path, custom
      vector storage/re-embed, adapter/factory plumbing, Settings UI/action
      propagation, and existing search visibility invariants:
      `npm run test -- tests/unit/search.test.ts tests/unit/embeddings.test.ts tests/unit/ai-keys.test.ts tests/unit/ai-keys-actions.test.ts tests/unit/ai-provider-factory.test.ts tests/unit/ai-keys-panel.test.tsx tests/unit/ai-provider-adapters.test.ts`
      (127 tests). Also verified `npm run db:deploy`, Prisma migration drift
      (`npx prisma migrate diff --from-config-datasource --to-schema=./prisma/schema.prisma --exit-code`),
      `npm run lint` (0 errors; existing settings-action / `.claude/worktrees`
      warnings), `npm run typecheck`, `npm run build` (existing Turbopack NFT
      seeding trace warning), `npm run test:coverage` (93 files / 1275 tests;
      statements 95.76%, branches 88.91%, functions 97.91%, lines 97.62%), and a
      local browser smoke of `/campaigns/[id]/settings` as seeded
      `dm@example.com` confirming the embedding-dimensions controls render with
      no console errors.

## M5 — Semantic layer: auto re-embed on canon change (slice 4b) ✅ (2026-06-16)

**Goal:** finish the semantic-index freshness loop from
[`07-search-retrieval.md`](./07-search-retrieval.md): when approved canon changes
the denormalized `SearchDoc.content`, schedule the existing worker-based embed
job automatically instead of requiring a DM to click **Build semantic index**.
The explicit button remains useful as a recovery/backfill action.

- [x] **Indexer scheduling** ([`search-index.ts`](../src/server/services/search-index.ts)):
      `upsertSearchDoc` still invalidates changed content by clearing
      `embeddingModel`, and now also creates a campaign-level
      `EMBED_SEARCH_DOCS` job inside the same transaction when an embedding-
      capable key is configured. Queue rows are deduped while an embed job for
      the campaign is `QUEUED`, but not while one is `RUNNING`: a content change
      during an in-flight worker pass records a follow-up refresh.
- [x] **Review apply paths** ([`review.ts`](../src/server/services/review.ts)):
      entity, relationship, and event canon writes pass the applying DM/co-DM
      into the indexer so the worker can later re-check job permissions with
      `job.createdById`. Auto-approved DM writes and pending proposal approvals
      both use the same path.
- [x] **No noisy visibility refreshes.** SearchDoc visibility mirrors still
      update in transaction, but unchanged searchable content does not enqueue
      semantic work. Archived targets drop their SearchDoc and do not enqueue,
      because there is nothing to embed.
- [x] **Review fix (PR #126).** A `RUNNING` embed job no longer suppresses a
      queued follow-up, and `embedSearchDocs` writes a vector/model marker only
      when the row's current `content` still matches the worker snapshot it
      embedded. If canon changes under a running worker, the stale write is
      skipped and the queued follow-up embeds the new content.
- [x] **Tests:** `tests/unit/search.test.ts` covers the RED/GREEN slice:
      changed entity docs enqueue exactly one pending semantic refresh while one
      is already queued; relationship and event docs enqueue after previous jobs
      finish; full-text-only campaigns and visibility-only reindexing do not
      enqueue; review regressions cover the `RUNNING` follow-up and stale worker
      snapshot race.
- [x] **Verification:** targeted RED/GREEN for the new search cases, then
      `npm run test -- tests/unit/search.test.ts` (34 tests),
      `npm run test -- tests/unit/embeddings.test.ts` (19 tests), sequential
      `jobs.test.ts` and `review.test.ts`, `npm run lint` (0 errors; existing
      settings-action warnings), `npm run typecheck`, `npm run build`, and
      `npm run test:coverage` (93 files / 1271 tests; statements 95.76%,
      branches 88.97%, functions 97.91%, lines 97.63%).

## M5 — Semantic layer: pgvector + hybrid search (slice 4a) ✅ (2026-06-15)

**Goal:** add the semantic half of the hybrid retrieval in
[`07-search-retrieval.md`](./07-search-retrieval.md) — embed the `SearchDoc`
index and let `searchCanon` rank by *meaning*, not just keywords. Scoped to the
foundation + hybrid query; auto re-embed on canon change landed in slice 4b, and
the ANN index (4c) remains deferred. Still degrades cleanly: a campaign with no
embedding-capable key keeps the exact slice-3 full-text behaviour. Branch:
`feat/m5-search-slice4a-pgvector`.

- [x] **Infra: pgvector.** Switched the Postgres image from `postgres:18` to
      `pgvector/pgvector:pg18` in `docker-compose.yml` and all three CI service
      definitions (`ci.yml` ×2, `coverage.yml`). The stock image lacks the
      `vector` extension the migration enables. Local `dcc` DB recreated on the
      same image.
- [x] **Schema + migrations.** `20260615120000_m5_pgvector_embeddings`:
      `CREATE EXTENSION IF NOT EXISTS vector` + `SearchDoc.embedding vector(1536)`
      and `embeddingModel text` (both nullable). `20260615120100_add_embed_search_docs_job_kind`:
      additive `EMBED_SEARCH_DOCS` `JobKind`. In [`schema.prisma`](../prisma/schema.prisma)
      the vector is `Unsupported("vector(1536)")?` (written via raw SQL, never by
      the typed client) and `embeddingModel String?`. **No ANN index this slice**
      — campaign-scoped cosine over a sequential scan is fast at search result
      sizes, and Prisma's `@@index` can't represent an HNSW/IVFFlat type without
      breaking the drift gate (same deferral reasoning slice 1 used for GIN). Drift
      gate verified clean.
- [x] **Provider `embed()`** ([`types.ts`](../src/server/ai/types.ts),
      [`openai.ts`](../src/server/ai/openai.ts), [`anthropic.ts`](../src/server/ai/anthropic.ts)):
      new `EmbedResult` + `embed(texts)` on `LLMProvider`. The OpenAI adapter calls
      `client.embeddings.create` (separate `embeddingModel`, order-preserving,
      usage mapped); the Anthropic adapter **throws a safe `ProviderError`** — the
      Messages API has no embeddings endpoint. `resolveCampaignEmbedder`
      ([`index.ts`](../src/server/ai/index.ts)) returns the first OpenAI-compatible
      provider with a usable key configured for `EMBED_MODEL_DEFAULT`
      (`text-embedding-3-small`, 1536-dim), else null → graceful degrade.
- [x] **Embedding service** ([`embeddings.ts`](../src/server/services/embeddings.ts)):
      `embedSearchDocs(userId, campaignId, { force? })` — DM-only, cap-checked.
      Embeds docs missing/stale for the current model (or all with `force`) in
      batches, writes each vector via raw SQL, records `AiUsage` (tokens; embedding
      models are usually unpriced → null cost). A wrong-dimension model is rejected
      with a clear message; provider failures become safe `ServiceError`s
      (invariant #6). Pure helpers `embeddingInputForDoc` / `searchVectorLiteral`.
- [x] **Hybrid ranking** ([`search.ts`](../src/server/services/search.ts)):
      `searchCanon` embeds the query once when an embedder is configured and
      `buildSearchDocSearchSql` blends `ts_rank` with `1 - (embedding <=> q)` for
      same-model rows, with the candidate set = full-text matches **OR** same-model
      embedded rows above a similarity floor. Any embed failure (or no embedder)
      falls back to the unchanged full-text path. The visibility pre-filter +
      two-layer hydration projection are **untouched** — semantic only changes
      candidate selection/ordering, so a player can never retrieve more than
      full-text would surface (invariant #5).
- [x] **Job + action + UI.** `EMBED_SEARCH_DOCS` handler delegates to
      `embedSearchDocs` ([`handlers.ts`](../src/server/jobs/handlers.ts));
      `enqueueBuildSemanticIndexAction` queues it; a DM-only **Build semantic
      index** button ([`build-semantic-index-button.tsx`](../src/components/search/build-semantic-index-button.tsx))
      renders on the search page only when an embedder is configured. Intro copy
      now describes hybrid + the graceful-degrade note.
- [x] **Tests:** new `embeddings.test.ts` (pure helpers; DB-backed `embedSearchDocs`
      writes 1536-dim vectors + model + usage, default-skip vs. `force`, DM-only,
      no-embedder/wrong-dim/spend-cap rejections; hybrid `searchCanon` surfaces a
      non-keyword query's closest doc, keeps exact keyword hits, and **never lets a
      player's semantic query retrieve a DM-only doc — invariant #5**). Extended
      `search.test.ts` (hybrid SQL shape), `ai-provider-adapters.test.ts` (OpenAI
      embed mapping + Anthropic-unsupported throw), `ai-provider-factory.test.ts`
      (`resolveCampaignEmbedder`), `jobs.test.ts` (handler delegation),
      `dm-actions.test.ts` (action), `search-page.test.tsx` (button gating), +
      `build-semantic-index-button.test.tsx`. lint (0 errors; pre-existing settings
      warnings only), typecheck, build, and the full coverage gate green (1256
      tests; statements 95.73%, branches 89.12%, functions 97.89%, lines 97.61%;
      `embeddings.ts` 96.96%, `search.ts` 98.61%, `ai/index.ts` 100%).
- [x] **Review fixes (Codex on PR #124).** (1) The request-path query embed now
      honors the spend cap (cap reached → degrade to full-text) and records its
      cost as a `search-query-embed` `AiUsage` row, so a player/repeated search
      can't spend past the cap untracked. (2) The in-transaction index write paths
      now clear `embeddingModel` when a doc's `content` changes (shared
      `upsertSearchDoc` helper in [`search-index.ts`](../src/server/services/search-index.ts)),
      so an edited doc's stale vector is excluded from ranking and re-embedded on
      the next "Build semantic index" (the unexposed `force` path is no longer
      required to repair edits).

## M5 — Search perf: materialized tsvector + GIN index (slice 3) ✅ (2026-06-14)

**Goal:** keep the slice 1–2 search behavior intact while moving the full-text
match/rank off query-time `to_tsvector('english', content)` and onto a stored,
indexed Postgres vector.

- [x] **Schema + migration** (`20260614170000_m5_search_vector_gin`): added
      `SearchDoc.searchVector` as a generated stored `tsvector` column
      (`to_tsvector('english'::regconfig, content)`) and
      `SearchDoc_searchVector_idx` as a GIN index. Existing rows materialize
      automatically from `content`; app write paths still only write `content`.
- [x] **Prisma drift handling** ([`schema.prisma`](../prisma/schema.prisma)):
      the generated column is represented as optional `Unsupported("tsvector")`
      with `@default(dbgenerated(...))`, and the GIN index is represented with
      `@@index([searchVector], type: Gin, map: "SearchDoc_searchVector_idx")`.
      Because the unsupported field is optional, Prisma Client create/update/
      upsert calls for `SearchDoc` remain available and the client never writes
      the derived vector directly.
- [x] **Search service** ([`search.ts`](../src/server/services/search.ts)):
      extracted `buildSearchDocSearchSql` and changed `searchCanon` to rank and
      filter with `"searchVector" @@ websearch_to_tsquery(...)` plus
      `ts_rank("searchVector", ...)`. Campaign scoping, visibility prefiltering,
      over-fetch hydration, and live entity/relationship/event projection are
      unchanged.
- [x] **Tests / verification:** `search.test.ts` now asserts the generated
      column + GIN index exist, and that the search SQL uses `searchVector`
      instead of recomputing `to_tsvector` from `content`. Red/green verified
      locally; `npm run db:deploy`, Prisma migration drift check,
      `npm run test -- tests/unit/search.test.ts`, lint (0 errors; existing
      settings-action warnings), typecheck, build, and the full coverage gate are
      green (statements 95.71%, branches 89.1%, functions 97.87%, lines 97.61%;
      `search.ts` 100%).

## M5 — Search: index relationships + events (slice 2) ✅ (2026-06-14)

**Goal:** broaden the M5 search subsystem ([`07-search-retrieval.md`](./07-search-retrieval.md))
from ENTITY-only (slice 1) to also index and retrieve **RELATIONSHIP** and
**EVENT** canon — the schema's `SearchDoc.targetType` already allowed all three.
Still AI-key-free keyword/full-text; the semantic layer, Ask, and generator
wiring remain later M5 slices.

- [x] **Indexer** ([`search-index.ts`](../src/server/services/search-index.ts)):
      generalized alongside `indexEntity`. New pure builders `buildRelationshipContent`
      (the type's forward phrase + both endpoint names + notes) and
      `buildEventContent` (title + summary + description), plus `indexRelationship`
      / `indexEvent` (upsert the doc, or drop it when archived/missing — the
      mirror is regenerable). New `SEARCH_TARGET_RELATIONSHIP` / `SEARCH_TARGET_EVENT`
      constants. `reindexCampaign` now rebuilds all three target types (and clears
      the whole campaign's docs, not just ENTITY).
- [x] **Visibility is two-layer (invariant #5).** A relationship/event's player
      visibility is *derived* — an edge needs both endpoints player-visible, an
      event needs ≥1 player-visible participant — and those can change **without an
      edge/event write**, so a single stored `visibility` can't stay authoritative.
      The doc `visibility` therefore mirrors only the cheap `secret → DM_ONLY`
      signal (a coarse SQL pre-filter), and the **authoritative** endpoint/
      participant projection is re-applied at retrieval against *live* canon (the
      same projection graph/timeline use). A stale index row can never leak: even
      if the mirror says PLAYER_VISIBLE, hydration drops a hit whose endpoints/
      participants are hidden. (Entity docs keep their authoritative `visibility`
      mirror, kept fresh by `indexEntity` on every entity write.)
- [x] **Hooked into the canon write paths** ([`review.ts`](../src/server/services/review.ts)):
      `applyCreateRelationship` / `applyUpdateRelationship` / `applyDeleteRelationship`
      call `indexRelationship`, and `applyCreateEvent` / `applyUpdateEvent` call
      `indexEvent`, all **in the same transaction** (covering both the auto-approved
      DM path and reviewed approvals). UPDATE_EVENT covers both field edits and
      soft-archive; DELETE_RELATIONSHIP archives then drops the doc. **Deliberate
      deferral:** an entity *rename* leaves its edges' denormalized endpoint names
      stale until the next reindex (the doc-07 "stale-but-close between writes"
      tolerance) — no cascade re-index on entity writes this slice.
- [x] **Search service** ([`search.ts`](../src/server/services/search.ts)):
      `searchCanon` drops the ENTITY-only filter and ranks across all three types
      in one `ts_rank` query, then hydrates each type from live canon with the
      requester's projection (entities: not archived; relationships: both endpoints
      player-visible for players; events: ≥1 player-visible participant). Returns a
      discriminated `SearchHit` union (`EntitySearchHit | RelationshipSearchHit |
      EventSearchHit`).
- [x] **UI** ([search page](<../src/app/(dm)/campaigns/[id]/search/page.tsx>)): a
      `ResultCard` dispatcher renders per-type cards — relationships show
      `source → forward-phrase → target` + notes and link to the **Graph**; events
      show title + summary and link to the **Timeline**; entities are unchanged and
      link to detail. Honest empty states (`No notes.` / `No summary yet.`). Intro
      copy updated to name relationships + events.
- [x] **Tests:** DB-backed `search.test.ts` extended — pure
      `buildRelationshipContent`/`buildEventContent`; relationship + event index on
      create/update/archive; **secret edges + edges to hidden endpoints hidden from
      players**; **secret events + events with only hidden participants hidden from
      players** (invariant #5, DM 3 / player 1 each); `reindexCampaign` rebuilds all
      three types. `search-page.test.tsx` gains relationship/event card render +
      graph/timeline link + empty-state cases. lint (0 errors; pre-existing settings
      warnings only), typecheck, build (the `/search` route compiles), and the full
      coverage gate green (statements 95.69%, branches 89.09%, functions 97.87%,
      lines 97.59%; `search-index.ts` 100%, `search.ts` 97.77%).
- [x] **In-browser verification** (2026-06-14): reseeded `dcc` + ran
      `scripts/seed-world.ts` (12 entities, 11 edges, 4 events **via the real
      service layer**). Confirmed the write-path hooks fired: **11 RELATIONSHIP docs
      (10 PLAYER_VISIBLE / 1 secret→DM_ONLY)** and **4 EVENT docs**, content
      byte-matching the builders. Drove the running app authenticated as the DM:
      `/search?q=Donut` renders **11 results** mixing entity, relationship
      (`Carl ALLY OF Princess Donut` — notes "Bonded under fire."), and event
      (`Carl & Donut breach Floor 9`) cards with correct Graph/Timeline hrefs and no
      console errors. **Invariant #5 confirmed live** via a throwaway player (removed
      after): `Maestro` → DM sees the DM-only entity **and** the secret
      `Maestro → Borant Syndicate` edge (2), player **0**; `manipulates` (the secret
      edge's type phrase) → DM 1, player **0**.

## M5 — Search foundation: full-text over canon (slice 1) ✅ (2026-06-14)

**Goal:** stand up the M5 search subsystem ([`07-search-retrieval.md`](./07-search-retrieval.md))
with its first, AI-key-free layer: keyword/full-text search over a campaign's
canon. This is the foundation the semantic (pgvector) layer, "Ask the Campaign",
and retrieval-fed generator context build on. Scoped to **ENTITY** targets;
relationships/events and perf materialization were later slices, while embeddings,
Ask, and generator wiring remain tracked in the open backlog.

- [x] **Backfill migration** (`20260614160000_backfill_search_docs`): a one-time
      data migration that seeds a `SearchDoc` for every pre-existing non-archived
      entity, mirroring the indexer (`content` = name+summary+description+tags one
      per line, blanks dropped; `visibility` mirrors the source). Without it, an
      already-populated DB would create an empty index and pre-existing canon would
      stay unsearchable until each entity was next edited (the write-path hooks only
      catch *future* writes). Idempotent via `ON CONFLICT DO NOTHING` (a no-op on a
      fresh DB whose seeds already ran through the indexed write paths). Verified
      against the seeded world: 12 rows, content + visibility byte-match
      `buildEntityContent` for all 12, searchable, second run inserts 0. *(Addresses
      Codex's P2 review note on PR #117.)*
- [x] **Schema + migration** (`20260614143421_m5_search_doc`): the `SearchDoc`
      model from [`09-data-schema.md`](./09-data-schema.md) — `campaignId`,
      `targetType` (ENTITY|RELATIONSHIP|EVENT), `targetId`, `content`
      (denormalized name+summary+description+tags), `visibility` (mirror of the
      source, for scoped retrieval), `updatedAt`; `@@unique([targetType,targetId])`
      + `@@index([campaignId, targetType])`. Fully Prisma-managed (no raw-SQL DB
      objects) so the migration-drift gate stays clean. **Deliberate deferral:** a
      materialized `tsvector` generated column + GIN index lands in a later perf
      slice (it needs an `Unsupported`/out-of-schema decision vs. the drift gate);
      slice 1 computes the tsvector at query time, which is correct and fast at the
      campaign-scoped result sizes search returns.
- [x] **Indexer** (`src/server/services/search-index.ts`): `buildEntityContent`
      (pure — name+summary+description+tags, blanks dropped), `indexEntity(tx, …)`
      (upsert the doc, or drop it when the entity is archived/missing — the index
      is a regenerable mirror), `removeSearchDoc`, and `reindexCampaign` (DM-only
      backfill that rebuilds the campaign's entity docs from current canon).
- [x] **Hooked into the canon write paths** ([`review.ts`](../src/server/services/review.ts)):
      `applyCreateEntity` / `applyUpdateEntity` / `applyDeleteEntity` call
      `indexEntity` in the **same transaction** (both the auto-approved DM path and
      the reviewed-approval path funnel through these, so one hook point covers all
      entity writes). The index is fresh the moment a write commits; archive drops
      the doc. (Embeddings — expensive — will move to the async `Job` path in the
      semantic slice, per doc 07's "enqueue re-embed on canon change".)
- [x] **Search service** (`src/server/services/search.ts`): `searchCanon(userId,
      campaignId, query)` runs Postgres full-text (`to_tsvector` /
      `websearch_to_tsquery`, ranked by `ts_rank`) over `SearchDoc`, always
      campaign-scoped and **visibility-filtered** — players retrieve only
      `PLAYER_VISIBLE` docs (invariant #5: a player query can never surface DM-only
      canon). Blank query → no hits; non-member → empty result; bounded limit.
      Hits are hydrated from live canon (re-confirming non-archived — defence in
      depth against a stale index row).
- [x] **UI**: a `/campaigns/[id]/search` page (server component) with a debounced
      `SearchBar` and ranked result cards (TypeDot/SourceBadge/StatusPill, honest
      prompt + no-match empty states) linking to entity detail. Wired the topbar's
      previously-disabled "Search · Query the System…" affordance into a working
      `GlobalSearchLink` (active inside a campaign; "Ask · M5" still flagged
      planned) and added a **Search** item to the DM nav.
- [x] **Tests:** DB-backed `search.test.ts` (pure `buildEntityContent`; index on
      create/update/archive; campaign scoping; **DM-only hidden from players**;
      blank/non-member/limit/tag cases; `reindexCampaign` rebuild + player
      rejection + empty-campaign clear) + real-component `search-page` /
      `search-bar` / `global-search-link` suites. lint (0 errors; pre-existing
      settings warnings only), typecheck, build (the `/search` route compiles), and
      the full coverage gate green (statements 95.65%, branches 89.03%, functions
      97.85%, lines 97.58%; the new search files covered).
- [x] **In-browser verification** (2026-06-14): reseeded the `dcc` DB + ran
      `scripts/seed-world.ts` (12 entities via the real service layer). Confirmed
      the write-path hook fired — **12 `SearchDoc` rows, visibility mirror exact**
      (7 `PLAYER_VISIBLE` / 5 `DM_ONLY`). Drove the running app authenticated
      (Auth.js credentials login → session cookie): `/search?q=donut` renders
      "3 results" cards (Princess Donut, Team Princess Donut, Mordecai);
      `/search?q=maestro` shows the DM-only "The Maestro" to the DM; an empty query
      shows the prompt state; a no-match query shows "No matches for …"; the topbar
      `GlobalSearchLink` + nav **Search** item render with the correct hrefs.
      **Invariant #5 confirmed live:** a player query for "maestro" returns 0 hits
      while the DM gets 1. The `OR` operator (`websearch_to_tsquery`) and multi-
      field ranking both work against real seeded canon.

## M4 — Async Job table + worker ✅ (2026-06-13)

**Goal:** the last open M4 item from [`04-ai-integration.md`](./04-ai-integration.md)
§"Async / batching" — a `Job` table + single-worker loop for long/bulk generation
runs off the request path. M5 re-indexing builds on the same primitive (one new
`JobKind` entry + one handler). "Notify the DM when ready" is satisfied for now
by proposals appearing in the Review Queue plus a job-status line in the panel
(live polling deferred).

- [x] **Schema** (`prisma/schema.prisma`): `JobStatus` and `JobKind` enums + `Job`
      model with `status`, `payload` (no secrets), `result`, `error` (safe text
      only — invariant #6), `attempts`, `maxAttempts`, `runAfter`, `startedAt`,
      `finishedAt`. FK to Campaign + User with Cascade. Migration
      `add_job_table` applied.
- [x] **Jobs service** (`src/server/services/jobs.ts`): `enqueueJob` (DM-only, invariant),
      `listRecentJobs` (DM-only, display fields only), `claimNextJob` (worker-internal
      optimistic claim guard), `completeJob`, `failJob`.
- [x] **Handler registry** (`src/server/jobs/handlers.ts`): `jobHandlers` record keyed
      by `JobKind`; `BULK_FLESH` validates payload shape and delegates to
      `fleshOutEntities` (which re-checks DM membership with `job.createdById`).
- [x] **Worker loop** (`scripts/worker.ts`, `npm run worker`): polls queue every 2s,
      claims oldest due job, runs handler, completes/fails; graceful SIGINT/SIGTERM
      shutdown (finishes in-flight job then exits). Raw unknown-error text never
      persisted — only `ServiceError.message` or generic fallback.
- [x] **UI** (`enqueueBulkFleshAction` + `BulkFleshPanel`): "Run in background" button
      in the bulk-flesh panel queues a `BULK_FLESH` job; recent job statuses shown
      below the form (page-refresh freshness; live polling deferred).
- [x] **Ops**: `docker-compose.yml` worker service; `AGENTS.md` updated with
      `npm run worker` guidance.
- [x] **Tests**: `tests/unit/jobs.test.ts` (real Postgres — enqueue DM gate, claim
      lifecycle, complete/fail, safe-fallback assertion, handler invalid-payload guard,
      handler delegation with provider stub); `tests/unit/dm-actions.test.ts`
      (`enqueueBulkFleshAction` form parsing + validation + mock); `tests/unit/bulk-flesh-panel.test.tsx`
      (background button render, job status lines, empty job list).

**Single-worker note:** before running two workers, replace the optimistic claim
with `FOR UPDATE SKIP LOCKED`. The spend-cap lock (plan 004) is in-process;
two workers do not serialize against each other — bounded overshoot, acceptable now.

## M4 — Bulk multi-entity flesh-out panel ✅ (2026-06-11)

**Goal:** the "generation panel for bulk runs (multi-entity selection)" from
[`04-ai-integration.md`](./04-ai-integration.md) §"Async / batching" — the
multi-entity counterpart to the single-entity "Flesh out" on the entity rail.
A DM picks several stub entities in the World Browser and fleshes them in one
run; each lands as its own PENDING `UPDATE_ENTITY` proposal (never canon —
invariant #1), respecting locks (invariant #2) and recording AI provenance on
approval (invariant #3). Per the doc's "start synchronous" guidance this slice
runs in-request (one provider call per selected entity); the async `Job` worker
for long batches stays the last M4 expansion item. The spend cap is enforced
per entity, so a batch stops spending the moment the cap is reached. The app
stays fully usable with no key and no candidates.

- [x] **Service** (`fleshOutEntities`, `src/server/services/generation.ts`):
      DM/co-DM only. Normalizes the selection (drops blanks, dedupes
      order-preserving, bounds the batch to ≤20). Resolves the provider **once**
      so a missing key fails the whole batch with one clear `ServiceError`
      (instead of repeating per entity). Loads names up front so every outcome —
      including ids that vanished between page load and submit — is labelled.
      Then loops the selection, **reusing the existing `fleshOutEntity`** per
      entity (so each is byte-identical to a single-entity run and one entity's
      failure never blocks the others): a per-entity `try/catch` records a
      `{ status: "proposed" | "skipped", detail? }` outcome, with locked /
      no-usable-change / transient-provider failures surfaced as safe
      ServiceError text (invariant #6). Before each entity it re-checks
      `assertWithinSpendCap`; the first cap hit flips a `capReached` flag so the
      remaining entities short-circuit to "Spend cap reached." with **no further
      provider calls**. Returns `{ outcomes, proposedCount, skippedCount, model }`.
- [x] **Candidate query** (`listFleshCandidates`, `entities.ts`): non-locked,
      non-archived **stub** entities (`{ id, name, type }`), the natural bulk
      targets (a full entity is fleshed one-off from its rail). DM-only (returns
      `[]` for players / non-members), so the panel is gated the same way as the
      AI key list.
- [x] **Action** (`fleshOutEntitiesAction`, `src/app/(dm)/actions.ts`) +
      `BulkGenerateActionState`: reads the multi-valued `entityIds` from the
      form, calls the service, revalidates the queue + World Browser, and returns
      a summary — a success line when ≥1 was proposed (singular/plural noun, a
      "N skipped" suffix), an `error` when none were ("No drafts were proposed —
      see the details below."), and the per-entity outcomes (display fields only,
      never internal ids). Failures map to safe ServiceError text or a generic
      fallback.
- [x] **UI** (`src/components/entities/bulk-flesh-panel.tsx`): a DM-only
      **`BulkFleshPanel`** ("Flesh out with AI") in the World Browser header,
      beside "Scaffold with AI", shown only when a provider key is configured
      **and** there's at least one stub candidate. It toggles a checklist of
      candidates (TypeDot + type + name) with Select-all/Clear-all and a live
      "N selected" count; the submit button is disabled at zero and labelled
      "Flesh out N". On a successful run it shows the summary + a link to the
      Review Queue and a per-entity Proposed/Skipped list (skips show the reason).
      Selection clears once per successful run via a render-time guard keyed off
      the run timestamp (the React-recommended "adjust state when input changes"
      pattern — no `useEffect`/`setState`-in-effect).
- [x] **Tests:** DB-backed `fleshOutEntities` (one PENDING set per entity all
      proposed; locked/no-change skipped without blocking others; not-found
      label; cap stops spending + skips the rest with no provider call; empty /
      oversized / no-provider rejections; player denial); `listFleshCandidates`
      (returns non-locked non-archived stubs, excludes full/locked/archived;
      `[]` for a player); `fleshOutEntitiesAction` (ids passed + summary/outcomes
      + revalidate; singular noun + it/them; error-when-none keeps outcomes;
      ServiceError + generic fallback); `BulkFleshPanel` component (collapsed →
      open → candidate list; select toggles count + enables submit; select-all /
      clear-all; success + outcomes + queue link; error); campaign-page gating
      (hidden without a key, hidden with a key but no candidates, shown with both).
      lint (0 errors; 2 pre-existing settings warnings), typecheck, build, and the
      full coverage gate green (1116 tests; statements 95.65%, branches 89.23%,
      functions 97.76%, lines 97.52%; the new files covered).
- [x] **Verified in-browser** against the seeded Demo Campaign (placeholder
      Anthropic key + two stub NPCs): the "Flesh out with AI" button appears
      (gated by the key + candidates), opens the checklist, Select-all checks both
      and enables "Flesh out 2"; submitting routed through the action → service →
      per-entity provider call. The placeholder key made each call fail, and the
      bulk loop **continued past the per-entity failures** rather than aborting:
      both entities rendered as **Skipped — "The provider rejected the key
      (authentication failed)"** with the panel's "No drafts were proposed" alert,
      and no key/raw-SDK text reached the DOM (invariant #6). No console errors. A
      **successful** generation needs the DM's own valid BYO key + spend (the
      documented M4 boundary), covered by the mocked-provider service tests.
- [x] **Remaining M4 expansion:** only the async `Job` table + worker (long
      batches off the request path, DM notification) stays in the open backlog.

## M4 — Usage tracking + spend caps ✅ (2026-06-11)

**Goal:** the cost/trust control from [`04-ai-integration.md`](./04-ai-integration.md)
§"Async / batching" + §"Safety, cost, and trust controls": record what BYO
generation costs and let a DM cap it. Every successful provider call now writes a
usage row (tokens + estimated USD); the Settings page surfaces campaign spend; and
a DM-set spend cap blocks generation once known spend reaches the ceiling. The
record carries **no secret** (the API key is never referenced — invariant #6), and
it's a cost/usage trail distinct from review-pipeline provenance. The app stays
fully usable with no key and no cap.

- [x] **Schema + migration** (`20260611162129_m4_ai_usage`): new `AiUsage`
      (`campaignId`, `createdById`, `providerId`, `model`, `generatorId`,
      `changeSetId?`, input/output/cacheRead/cacheCreation token counts,
      `estimatedCostUsd Float?`, `createdAt`; FK to Campaign+User, indexed by
      `(campaignId, createdAt)`) and `Campaign.spendCapUsd Float?` (null = no cap).
      `changeSetId` is a plain id (no FK) so the usage trail outlives a deleted
      change set.
- [x] **Pure pricing** (`src/lib/ai/pricing.ts`, client-safe): a per-model price
      table (USD / 1M tokens, input/output/cache-read/cache-write) for the models
      the app defaults to, plus `estimateCostUsd(model, usage, override?)` that
      returns **`null` for an unpriced model** (a custom endpoint / unknown model)
      rather than inventing `$0` — tokens stay authoritative either way — and
      `formatUsd` (extra precision for sub-cent amounts so single runs don't all
      read "$0.00"). `resolvePricing` lets a complete **DM-supplied override** win
      over the built-in table (cache rates derived from the input rate, 0.1×/1.25×).
- [x] **Custom per-token rates (follow-up).** A DM can store their own
      `inputPerMTokUsd`/`outputPerMTokUsd` on the `AiKey` (migration
      `20260611164233_m4_ai_key_custom_pricing`) — the only way to cost a
      **self-hosted/proxy** model the table doesn't know (and overrides the table
      for first-party providers too). `recordAiUsage` reads the key's override at
      record time, so an otherwise-unpriced run becomes priced, drops out of the
      "unpriced runs" note, and **counts toward the spend cap**. Both rates are
      required for the override to apply; surfaced as optional "$ / 1M tokens"
      inputs per provider row in `AiKeysPanel`, plumbed through `setAiKeySchema` +
      `setAiKey` (non-secret config, audited in the existing `SET_AI_KEY` detail).
- [x] **Service** (`src/server/services/ai-usage.ts`): `recordAiUsage` (estimate +
      persist), `assertWithinSpendCap` (throws a `ServiceError` once the sum of
      **priced** usage reaches the cap; unpriced runs can't trip it, since their
      cost is unknown), `getCampaignAiUsage` (DM-only aggregate: spend, runs,
      tokens, unpriced-run count + the current cap), and `setCampaignSpendCap`
      (DM-only, audited `SET_SPEND_CAP`; rejects a negative cap; null clears it).
- [x] **Wired into all three generators** (`generation.ts`): `fleshOutEntity`,
      `inferRelationshipsForEntity`, and `scaffoldStubEntities` now assert the cap
      **before** spending, capture the provider result's `usage`, and record it
      **immediately after the provider call — before any no-op check** (so a paid
      run that yields nothing reviewable still counts toward spend + the cap),
      backfilling `changeSetId` on the happy path (`linkAiUsageChangeSet`). Cap
      reached → no provider call, no proposal, safe message. Token usage threads
      through tolerantly (`?? emptyUsage()`). *(Both refinements — and the
      cached-token fix below — came from Codex review of PR #91.)*
- [x] **Disjoint token buckets** (`LLMUsage`): `inputTokens` is **uncached** input
      (cached input lives in `cacheReadTokens`), so cost is `Σ tokens × rate` with
      no overlap. Anthropic already reports it this way; the OpenAI adapter
      (`src/server/ai/openai.ts`) subtracts the cached subset out of
      `prompt_tokens` — otherwise cached OpenAI tokens were billed twice (once at
      the input rate, once at the cache-read rate), overstating spend.
- [x] **UI** (`src/components/settings/usage-panel.tsx`): a DM-only **Usage & spend**
      panel on the Settings page — estimated spend / runs / input+output token
      totals (honest empty state before any run), an unpriced-run note, and a spend
      cap form (`setSpendCapAction`; blank = clear). Costs are labelled estimates;
      token counts are exact. No fake/filler data.
- [x] **Validation:** `setSpendCapSchema` (empty → null, else a non-negative amount
      bounded to ≤100k) in [`validation.ts`](../src/lib/validation.ts).
- [x] **Tests:** pure pricing unit (rates, cache pricing, unpriced → null, format);
      DB-backed `ai-usage` (record priced/unpriced, aggregate + unpriced flag, cap
      set/clear/negative + player rejection, cap allows-under / blocks-at / ignores
      unpriced); generation suite extended (usage row written with tokens/cost/no
      key; cap blocks before the provider call); `UsagePanel` component, settings
      page (renders + wires both panels), and `setSpendCapAction` (set/clear/invalid/
      ServiceError/generic). lint (0 errors; 2 pre-existing settings warnings),
      typecheck, build, and the full coverage gate green (statements 95.61%,
      branches 89.12%, functions 97.72%, lines 97.51%; new pricing/ai-usage files
      100%).
- [x] **Verified in-browser** against a seeded campaign (two usage rows — one priced
      opus run, one unpriced local-model run — and a $5 cap): the panel shows
      **Est. spend $0.20 · Runs 2 · 9,200 in · 2,700 out**, the unpriced-run note,
      and the cap line; saving a new cap ($12.50) routed through the action →
      service → DB (confirmed `Campaign.spendCapUsd = 12.5` + a `SET_SPEND_CAP`
      audit row) and re-rendered "Capped at $12.50." No new console errors.
- [x] **Remaining M4 expansion:** a bulk *multi-entity* generation panel and an
      async `Job` table + worker stay in the open backlog. (A live generation still
      depends on the DM's own BYO key/spend — usage recording + cap enforcement are
      covered by mocked-provider service tests + the in-browser seeded check.)

## Visibility model simplification — binary DM_ONLY / PLAYER_VISIBLE ✅ (2026-06-10)

**Goal:** collapse the three-state `Visibility` enum
(`DM_ONLY`/`SHARED_WITH_PLAYERS`/`PLAYER_FACING`) to a clean binary
(`DM_ONLY`/`PLAYER_VISIBLE`), per the user decision recorded in the backlog. The
two non-DM states were always projected **identically** (every player query used
`visibility in [SHARED_WITH_PLAYERS, PLAYER_FACING]`), so the distinction carried
no behavior — only ambiguity. Subset/partial access is modeled exclusively via
dynamic `KnowledgeGrant` (fog of war), not a visibility tier. Invariant #5 holds
unchanged: players still read only via the visibility projection, and `DM_ONLY`
content never reaches the client.

- [x] **Schema + migration.** `enum Visibility { DM_ONLY PLAYER_VISIBLE }` in
      `prisma/schema.prisma`. Migration `20260610120000_binary_visibility` swaps the
      Postgres enum type (rename-old → create-new → `ALTER COLUMN … USING CASE` →
      drop-old), mapping every `SHARED_WITH_PLAYERS`/`PLAYER_FACING` row on
      `Entity.visibility` (the sole column using the enum) to `PLAYER_VISIBLE` and
      preserving `DM_ONLY`. Applied to the local `dcc` DB; client regenerated.
- [x] **Validation.** `visibilityValues` in [`validation.ts`](../src/lib/validation.ts)
      is now `["DM_ONLY", "PLAYER_VISIBLE"]`; the entity form's visibility control
      derives from it (binary toggle), and `formatVisibility` renders "Player Visible"
      automatically (no per-label change).
- [x] **Projections.** The player-visible predicate/where-clauses in
      [`entities.ts`](../src/server/services/entities.ts),
      [`events.ts`](../src/server/services/events.ts),
      [`groups.ts`](../src/server/services/groups.ts), and
      [`relationships.ts`](../src/server/services/relationships.ts) collapse from
      `visibility in [SHARED, FACING]` / a two-arm `===` test to a single
      `visibility === PLAYER_VISIBLE`. Seeding (`seeding.ts` + the `seed-world` /
      `seed-timeline-demo` scripts) seeds canon as `PLAYER_VISIBLE`.
- [x] **Tests.** All test fixtures/assertions updated from the legacy literals to
      `PLAYER_VISIBLE` (no test relied on distinguishing the two — they were used
      interchangeably as "a player-visible value"). The visibility-projection
      coverage (DM-only hidden, player-visible shown) is unchanged in intent.
- [x] **Docs.** `01-domain-model.md` + `09-data-schema.md` already described the
      binary model (updated ahead of the code); AGENTS.md status + invariant #5 note
      now state the model is binary (transition complete).
- [x] **Gates:** lint / typecheck / build / `test:coverage` (see the verification
      note in the commit).

## M4 — Bulk-stub scaffolding generator (slice 5) ✅ (2026-06-08)

**Goal:** the third generator family from
[`04-ai-integration.md`](./04-ai-integration.md) and the first **batch**
generator: from a DM's free-text instruction ("the shopkeepers and stalls of
the Bone Market"), scaffold a set of thin **stub** entities and route them to
the Review Queue as a single PENDING change set of `CREATE_ENTITY` proposals.
Nothing becomes canon until the DM approves it (invariant #1); approved stubs
carry AI provider/model/prompt provenance (invariant #3). The app stays fully
usable with no key.

- [x] **Generator** (`src/server/ai/generators/scaffold-stubs.ts`): pure
      prompt/schema/spec logic, no DB/SDK. `buildScaffoldStubsPrompt` frames the
      task with the instruction, the allowed types (CRAWLER excluded —
      protagonists are created deliberately and the generic create path doesn't
      populate the crawler satellite), existing entity names to avoid duplicating,
      and existing campaign tags to reuse; stable framing + style guide are
      cacheable. `scaffoldStubsOutputSchema` bounds the batch to ≤20 stubs of
      `{ type, name, summary?, tags }`. `scaffoldStubsToSpecs` normalizes/dedupes:
      drops blank names, names colliding (case-insensitively) with existing canon
      or earlier in the batch, and trims/dedupes tags. `SCAFFOLD_STUBS_GENERATOR
      { id, version }` is the versioned identity recorded for provenance.
- [x] **Stub create-patch reuse** (`entities.ts`): exported `buildStubCreatePatch`
      reuses the canonical `entityCreatePatch` so a scaffolded stub is
      byte-identical to a manually quick-created one (visibility `DM_ONLY`,
      `isStub`, kind-data defaults).
- [x] **Service** (`src/server/services/generation.ts`): `scaffoldStubEntities`
      — DM/co-DM only — validates the instruction (non-empty, ≤2000 chars),
      resolves the provider (graceful `ServiceError` when none), gathers tags + a
      bounded existing-name sample + the campaign style guide, calls
      `generateStructured`, normalizes to specs, post-hoc filters proposed names
      against the full live canon name set (refuses an empty/no-op result), and
      files them via `createPendingEntityChangeSet` with `source: AI` +
      provider/model/prompt metadata. Provider failures become safe
      `ServiceError`s (ProviderError message preserved; raw SDK text never
      reflected — invariant #6).
- [x] **Action + UI:** `scaffoldStubsAction` returns a safe success (with a link
      to the proposed change set) / error state and revalidates the queue + world
      browser. A DM-only **`ScaffoldStubsPanel`** ("Scaffold with AI") sits in the
      World Browser header, shown only when a provider key is configured
      (`listAiKeys`, which is DM-only — gating both role and key in one check). It
      toggles open a textarea; success links straight to the Review Queue.
- [x] **Tests:** pure generator unit (prompt framing/style-guide/existing-names/
      tags/CRAWLER-exclusion; spec normalize/dedupe/blank-drop; schema bounds +
      CRAWLER/unknown-type rejection); DB-backed `scaffoldStubEntities` (PENDING AI
      change set of CREATE_ENTITY ops + provenance metadata, bounded prompt
      context + full-set post-hoc existing-name dedupe, empty/over-long
      instruction + no-provider + no-usable + ProviderError + player rejections,
      AI provenance + AI-sourced stub on approval); action coverage
      (success/link/revalidate + singular noun +
      ServiceError/generic); `ScaffoldStubsPanel` component (collapsed→open,
      success-link, error); campaign-page gating (panel shown with a key, hidden
      without). lint (0 errors; 2 pre-existing settings warnings), typecheck,
      build, and the full coverage gate green (statements 95.55%, branches 89.08%,
      functions 97.69%, lines 97.46%; the new files fully covered).
- [x] **Verified in-browser** against the seeded Demo Campaign with a placeholder
      Anthropic key: the "Scaffold with AI" button appears in the World Browser
      header (gated by the configured key), opens the instruction panel, and
      submitting routes through the action → service → provider; the placeholder
      key surfaces the safe, key-free error "The provider rejected the key
      (authentication failed)" via the alert path (no raw SDK/key text — invariant
      #6). A **successful** generation needs the DM's own valid BYO key + spend
      (the documented M4 boundary), verified via mocked-provider service coverage.
- [x] **Remaining M4 expansion:** a generation panel for *bulk runs* (multi-entity
      selection), an async `Job` table + worker, and usage/cost tracking with spend
      caps remain in the open backlog.

## Entity-kind registry — display + form client slots (ADR 0009 slice 3b) ✅ (2026-06-08)

**Goal:** finish [ADR 0009](./adr/0009-entity-kind-registry.md) (accepted) — move
the **last** per-type UI branches (the ITEM read-view display + the ITEM form)
into the entity-kind client companions, retiring the `type === "ITEM"/"FLOOR"`
ladders in [`entity-forms.tsx`](../src/components/entities/entity-forms.tsx) and
the [entity detail page](<../src/app/(dm)/campaigns/[id]/entities/[entityId]/page.tsx>).
Pure application-layer refactor: **no schema change, no migration.** With this,
ADR 0009 is fully delivered.

- [x] **ITEM form → `kind-fields.tsx`.** Moved `ItemFields` (Item Type select +
      divine/unique/fleeting attributes) **and** the `aiDescription` textarea
      (previously a `type === "ITEM"` block in `CoreFields`) into the client
      companion, registered as `KIND_FIELDS.ITEM`. `KindFieldsProps` gained an
      optional `itemTypes` candidate list and its value reader (`getVal`) was
      widened to `(key, dbVal: unknown) => unknown` (a bespoke field can be any
      primitive — ITEM's flags are booleans). `EditEntityForm`/`CoreFields` now
      render ITEM/FLOOR fields through the single registry slot;
      [`entity-forms.tsx`](../src/components/entities/entity-forms.tsx) keeps only
      the `CRAWLER` branch (its satellite-table path, not a registry entry). The
      ITEM bespoke fields now render in the kind slot (between Summary and
      Description) instead of after the form — a deliberate, minor reorder; all
      fields still validate/persist/lock identically.
- [x] **ITEM display → `kind-display.tsx` (new).** A `<KindDisplay>` **client
      dispatcher** the server detail page renders unconditionally in read mode; it
      does the `KIND_DISPLAY[type]` lookup on the client and renders the type's
      panel or `null`. (A server component **cannot call** a function exported
      from a `"use client"` module — the first cut exported a `kindDisplayPanel()`
      lookup the page called on the server and Next.js threw at runtime; the
      dispatcher pattern is the fix, caught in browser verification, not by the
      jsdom unit tests.) `ItemDisplayPanel` renders the AI-description blockquote
      (flags → "This is a divine/unique/fleeting item." + flavor text, with the
      empty-locked placeholder) and the `data.itemTypeId/divine/unique/fleeting`
      field rows with lock toggles. The ITEM branch was removed from the page's
      `entityFields()` (CRAWLER + the universal `tags` row stay).
- [x] **Registry-driven reference resolution.** Added optional
      `EntityKind.referenceFields` (a `data` field → target `EntityType` map);
      `ITEM_KIND` declares `{ itemTypeId: "ITEM_TYPE" }`. The page resolves the
      display name from this map (no `type === "ITEM"` branch) and passes
      `resolvedNames` to the panel (a client component without DB access).
- [x] **Shared `FieldLockToggle`** extracted to
      [`field-lock-toggle.tsx`](../src/components/entities/field-lock-toggle.tsx)
      and reused by the detail page (summary/description) and the new display panel.
- [x] **Tests:** extended `kind-fields` (ITEM form render/locked-mirrors/no-data);
      new `kind-display` suite (dispatcher null for non-kind types, ITEM rows +
      resolved item-type name, blockquote composition + not-italic, omitted when
      empty, empty-locked placeholder + lock button, null-data tolerance). Existing
      `entity-forms`/`entity-page` real-component suites pass unchanged. lint (0
      errors; 2 pre-existing settings warnings), typecheck, build, and the full
      coverage gate green (1024 tests; statements 95.54%, branches 89.09%,
      functions 97.67%, lines 97.44%; the new `kind-display.tsx`/`field-lock-toggle.tsx`
      fully covered).
- [x] **Verified in-browser** against a seeded ITEM ("Gourd of Doom", an
      ITEM_TYPE "Legendary Gourd"): the read view composes the flags + flavor into
      the blockquote and shows the resolved **Item Type → Legendary Gourd** row +
      Divine/Unique/Fleeting; the edit form renders AI Description / Item Type /
      flags through the registry; toggling **Unique** and saving routed through the
      pipeline (auto-approved DM change set; a `data.unique` `Provenance` row, no
      bypass — invariant #1) and the read view updated. No runtime/console errors.
- [x] **ADR 0009 fully delivered (slices 1–3b).** No registry follow-up remains;
      the new-type "proof" lands with M7's BOX (one descriptor + companion entries).

## Entity-kind registry — registry-driven apply-path `data` builder (ADR 0009 slice 3a) ✅ (2026-06-07)

**Goal:** continue [ADR 0009](./adr/0009-entity-kind-registry.md) (accepted) —
retire the **last** hardcoded `type === …` / per-field `data.*` switches, the
**canonical apply-path `data` assembly** in
[`review.ts`](../src/server/services/review.ts). Slices 1–2 derived validation,
the key lists, and the reviewable/lockable set from the descriptors; the review
service still hand-composed the stored `Entity.data` JSON on three paths. This
slice makes that composition registry-driven too. Pure application-layer
refactor: **no schema change, no migration.** (Scoped down from the full slice 3
in the backlog: the `DisplayPanel`/form client slots + a new-type proof are now
**slice 3b**.)

- [x] **Registry primitives** (`src/lib/entity-kinds/index.ts`): `buildKindData(type,
      read)` composes the full `data` object for a create from the type's
      descriptor (every declared field, normalized, empty→default), and
      `normalizeKindFieldValue(key, raw)` normalizes one bespoke field looked up
      globally by name (for the update-merge + current-value paths, which key off
      the field name, not the type). A private `fieldValueType` reads each field's
      primitive (string/number/boolean) from its Zod schema via `z.toJSONSchema`,
      so the normalization mirrors the prior `nullableString` / `optionalNumber` /
      `booleanWithDefault(false)` handling without a per-field switch — a new
      bespoke field is composed and read back automatically.
- [x] **`applyCreateEntity`** now builds `data: buildKindData(type, …)` instead of
      the unconditional five ITEM fields + a `type === "FLOOR"` spread.
- [x] **`entityUpdateData`** merges each touched `data.*` field via
      `normalizeKindFieldValue`, iterating `allKindDataKeys()` (type-agnostic, only
      keys present in the patch — faithful to the prior `if ("data.X" in patch)`
      ladder) instead of nine hand-written field assignments.
- [x] **`currentEntityValue`** reads a bespoke `data.*` field through
      `normalizeKindFieldValue` (gated by the existing `dataFields` set) instead of
      a nine-case switch.
- [x] **One intentional, strictly-more-correct cleanup (documented):** the old
      create path stored the five ITEM fields (`itemTypeId`/`divine`/`unique`/
      `fleeting`/`aiDescription`) on **every** entity regardless of type (plus FLOOR
      fields on FLOORs). The registry builder stores **only the type's own kind
      fields**, so a FLOOR/NPC no longer carries spurious ITEM `data.*` keys — the
      same class of cleanup slice 2 made for provenance rows. Reads already default
      a missing field to its empty value (`?? null` / `?? false`), so display,
      review, and locking are unchanged; existing rows are untouched (no
      migration). ITEM create/update/lock/provenance and the stored ITEM `data`
      shape are byte-identical.
- [x] **Tests:** extended `entity-kinds` (string/number/boolean
      `normalizeKindFieldValue`, unknown-key → null, `buildKindData` full ITEM
      object, FLOOR-only fields with no spurious ITEM keys, no-kind type → `{}`);
      new DB-backed `entities` assertions that a created FLOOR stores only its own
      fields and a non-kind NPC stores no ITEM keys. Existing `entities`/`review`/
      `events`/`generation`/`validation` suites pass unchanged. lint (0 errors; 2
      pre-existing settings warnings), typecheck, build, and the full coverage gate
      green (statements 95.52%, branches 88.94%, functions 97.66%, lines 97.42%).
- [x] **Verification boundary:** pure, behavior-preserving server refactor (no
      schema/migration, identical stored ITEM data, missing fields default on read),
      covered by the DB-backed `entities`/`review`/`events` suites — same precedent
      + port-3000 constraint as prior slices; not browser-observable.
- [x] **Remaining:** slice 3b (the `DisplayPanel` detail-page slot + the ITEM
      form/display client branches; new-type proof deferred to M7 BOX) stays in the
      open backlog.

## Entity-kind registry — ITEM + derive the reviewable set (ADR 0009 slice 2) ✅ (2026-06-07)

**Goal:** continue [ADR 0009](./adr/0009-entity-kind-registry.md) (accepted) —
port the ITEM type's bespoke `data.*` fields into the registry, **derive the
reviewable/lockable field set wholesale** from all registered descriptors, and
shrink `entityCoreSchema` back to genuinely shared fields. Pure application-layer
refactor: **no schema change, no migration**, behavior preserved (the same fields
validate, persist, review, lock, and render).

- [x] **ITEM descriptor** (`src/lib/entity-kinds/item.ts`): `itemDataSchema` +
      `ITEM_KIND` hold ITEM's five `data.*` fields (`itemTypeId`/`divine`/`unique`/
      `fleeting`/`aiDescription`) once. The boolean flags stay `.optional()` (so the
      input key stays optional — `.default(false)` flips the inferred key to
      *required*); instead the descriptor declares `dataDefaults:
      { divine:false, unique:false, fleeting:false }`, the new optional
      `EntityKind.dataDefaults` slot that tells the patch builders an unset flag
      persists as `false` (everything else defaults to `null`), preserving the
      prior `?? false` / `?? null` handling.
- [x] **Registry** (`src/lib/entity-kinds/index.ts`): registered `ITEM` (before
      `FLOOR`, to match the historical `dataKeys` order). Added `allKindDataShape()`
      (the merged Zod shape for the write schemas) and `kindDataDefaults(type)` (the
      per-field empty-value map). `allKindDataKeys`/`dataKeysFor` unchanged.
- [x] **`entityCoreSchema` is core again** (`validation.ts`): dropped the ITEM
      fields *and* the `...floorDataSchema.shape` spread — it now validates only
      `name`/`summary`/`description`/`visibility`/`tags`/`isStub`. The bespoke
      fields are spread into the **write** schemas
      (`createGenericEntitySchema`/`updateEntitySchema`) via `allKindDataShape()`.
      `itemKeys`/`floorKeys` are now `dataKeysFor("ITEM"|"FLOOR")` and `dataKeys` is
      `allKindDataKeys()` — every key list derives from the descriptors.
- [x] **Deviation from the ADR's "validate for its type only" sketch (noted):** a
      static Zod schema can't know the entity type at parse time, so the write
      schema accepts the *union* of all kinds' fields; the patch builders persist
      only `dataKeysFor(type)`, so off-type fields are validated-then-ignored (the
      exact prior behavior). The ADR's core win — `entityCoreSchema` no longer
      carries every type's attributes, and the key/reviewable sets can't drift —
      holds. The union shape is spread explicitly (`...itemDataSchema.shape,
      ...floorDataSchema.shape`) rather than iterated over the type-erased registry
      so the inferred input types keep each field's precise type.
- [x] **Patch builders fully data-driven** (`entities.ts`): deleted the hardcoded
      ITEM `data.*` lines from the create patch and the ITEM `addPatch` lines from
      the update patch. Both now iterate `dataKeysFor(type)` with
      `kindDataDefaults(type)` for the empty value (booleans → `false`, else
      `null`), so a non-kind type contributes no `data.*` patch entries.
- [x] **Reviewable-field set derived wholesale** (`review.ts`): `dataFields` is now
      just `new Set(allKindDataKeys().map((k) => \`data.${k}\`))` — the hand-listed
      ITEM keys are gone, so a registered kind's fields are automatically
      reviewable/lockable and can't drift from the schema.
- [x] **Behavior preserved; one intentional cleanup.** Stored `data` is unchanged
      (the canonical writer `applyCreateEntity` still composes the JSON). The one
      observable change: a **non-kind** entity (e.g. NPC) no longer records the five
      spurious `data.*` provenance rows on create (its patch carries no `data.*`
      keys) — strictly more correct. ITEM/FLOOR create/update/lock/provenance are
      byte-identical, and the ITEM form DOM is untouched.
- [x] **Tests:** extended `entity-kinds` (ITEM descriptor resolve, per-type +
      unioned data keys, `allKindDataShape`, `kindDataDefaults`, ITEM flag/text
      parse); new `entities` DB-backed case asserting ITEM omitted-flags persist as
      `false` + ITEM records `data.*` provenance while a non-kind NPC records none.
      Existing `entities`/`review`/`events`/`generation`/`entity-forms`/
      `entity-page`/`dm-actions`/`validation` suites pass unchanged. lint (0 errors;
      2 pre-existing settings warnings), typecheck, build, and the full coverage
      gate green (1007 tests; statements 95.27%, branches 88.2%, functions 97.65%,
      lines 97.27%).
- [x] **Verification boundary:** pure, behavior-preserving refactor (no schema/
      migration, untouched form DOM, identical stored data), covered by the
      DB-backed `entities`/`review`/`events` suites and the real-component form/page
      suites (same precedent + port-3000 constraint as prior slices).
- [x] **Remaining (folded into slice 3 / open backlog):** the canonical
      apply-path `data` assembly is still hardcoded in `review.ts`
      (`applyCreateEntity`, the update `buildEntityData`, `getCurrentValue`'s
      `data.*` switch), as is the ITEM form (`ItemFields` + the `aiDescription`
      block) and the entity-detail ITEM display. Slice 3 adds the `DisplayPanel`/
      form slot + a registry-driven `data` builder and retires these last
      hardcoded `type === …` lists.

## Entity-kind registry — registry scaffold + FLOOR (ADR 0009 slice 1) ✅ (2026-06-07)

**Goal:** start [ADR 0009](./adr/0009-entity-kind-registry.md) (accepted) — stand
up a per-type `EntityKind` registry as the single source of truth for a type's
bespoke `data.*` fields, and route FLOOR through it, deleting the scattered
`type === "FLOOR"` branches. Pure application-layer refactor: **no schema change,
no migration**, behavior unchanged (FLOOR's fields validate, persist, review,
lock, and render exactly as before).

- [x] **Pure registry** (`src/lib/entity-kinds/`): `EntityKind` descriptor
      (`types.ts`), `FLOOR_KIND` + `floorDataSchema` (`floor.ts`), and the
      registry (`index.ts`: `kindFor`, `dataKeysFor`, `allKindDataKeys`). The
      descriptor is Zod/TS-only (no React) so server validation/patch/review can
      import it. FLOOR's four fields (`floorNumber`/`theme`/`startDay`/
      `collapseDay`) now live once in `floorDataSchema`.
- [x] **Shared Zod helpers extracted** (`src/lib/zod-field-helpers.ts`):
      `optionalText` / `optionalInt` moved out of `validation.ts` so the
      descriptor reuses the exact field shapes without a circular import.
- [x] **Validation derives from the descriptor** (`validation.ts`):
      `entityCoreSchema` spreads `...floorDataSchema.shape` (one definition; slice
      2 removes it from core), and `floorKeys` is now `dataKeysFor("FLOOR")` so the
      key list can't drift from the schema.
- [x] **Patch builders data-driven** (`entities.ts`): the create + update
      `data.*` builders iterate `dataKeysFor(type)` (`kindDataCreatePatch` +
      an update loop) instead of a duplicated `if (type === FLOOR)` block.
      Empty/absent normalizes to `null`, matching the prior
      `nullIfEmpty` / `?? null` handling.
- [x] **Reviewable-field set derived** (`review.ts`): the FLOOR slice of
      `dataFields` is now `...allKindDataKeys().map((k) => \`data.${k}\`)` (ITEM
      still hand-listed until slice 2), so a registered kind's fields are
      automatically reviewable/lockable.
- [x] **Form routed through the registry**: a client companion
      (`src/components/entities/kind-fields.tsx`, `kindFormFields`) holds the
      per-type `FormFields` (`FloorFields`) keyed by EntityType; `entity-forms.tsx`
      renders `kindFormFields(entity.type)` instead of the inline FLOOR IIFE. The
      rendered DOM (ids/names/locked hidden mirrors) is byte-identical.
- [x] **Deviation from the ADR sketch (noted):** the ADR co-locates `FormFields`
      on the descriptor object. To respect the RSC server/client boundary (server
      validation/patch/review must not import client components), `FormFields`
      lives in a client companion registry keyed by the same EntityType rather
      than on the pure descriptor. `DisplayPanel` (slice 3) will follow the same
      split. The "one logical place per type, no scattered `type ===` branches"
      goal is preserved.
- [x] **Tests:** new `entity-kinds` unit suite (`kindFor`/`dataKeysFor`/
      `allKindDataKeys`, undefined + empty branches, `floorDataSchema` parse +
      reject) and `kind-fields` component suite (FLOOR inputs, locked read-only +
      hidden mirrors, null-data tolerance, undefined for non-kind types). Existing
      `entities`, `review`, `entity-page`, and `entity-forms` suites pass
      unchanged. lint (0 errors; 2 pre-existing settings warnings), typecheck,
      build, and the full coverage gate green (1003 tests; statements 95.26%,
      branches 88.22%, functions 97.65%, lines 97.27%; new files fully covered).
- [x] **Verification boundary:** pure, behavior-preserving refactor with
      byte-identical form DOM, covered by the real-component `kind-fields` /
      `entity-forms` suites and the DB-backed `entities`/`review` suites (same
      precedent + port-3000 constraint as prior slices).
- [x] **Remaining:** slices 2 (ITEM + derive the reviewable set wholesale, shrink
      `entityCoreSchema`) and 3 (`DisplayPanel` slot + next bespoke type) stay in
      the open backlog.

## M4 — Relationship inference generator (slice 4) ✅ (2026-06-07)

**Goal:** add the second concrete generator family from
[`04-ai-integration.md`](./04-ai-integration.md): infer likely typed
relationships involving one existing entity and route them to the Review Queue
as **PENDING `CREATE_RELATIONSHIP` proposals**. Nothing becomes canon until the
DM approves it (invariant #1), and approved relationship fields retain AI
provider/model/prompt provenance (invariant #3).

- [x] **Generator** (`src/server/ai/generators/infer-relationships.ts`): pure
      prompt/schema/operation logic. `buildInferRelationshipsPrompt` scopes the
      task to one target entity, lists candidate canon entities and existing
      target relationships, and tells the model to use only listed ids. The Zod
      output schema bounds proposals to at most 8 relationships with valid
      `RelationshipType`, optional disposition, notes, and secret flag.
      `inferenceToRelationshipOperations` filters unknown/self/non-target edges,
      exact or symmetric duplicates, and the ADR 0008 discouraged
      `CRAWLER —LOCATED_ON→ FLOOR` path before building
      `CREATE_RELATIONSHIP` review operations.
- [x] **Service + provenance:** `inferRelationshipsForEntity`
      (`src/server/services/generation.ts`) is DM/co-DM only, loads the target,
      up to 40 live canon candidates, current target relationships, and the
      campaign style guide; resolves the configured provider; calls structured
      output; refuses no-op/empty usable proposals; and files the results through
      `createPendingRelationshipChangeSet` with `source: AI` plus
      provider/model/prompt metadata. The relationship pending-change-set helper
      now persists those metadata fields so approval copies them onto
      `Provenance` rows for each relationship field.
- [x] **Action + UI:** the entity detail rail's `GeneratePanel` now offers
      **Infer relationships** next to **Flesh out** when the existing provider-key
      gating shows the panel. The action returns a safe success/error state,
      revalidates the entity + Review Queue, and links directly to the created
      proposal set.
- [x] **Tests / verification:** new pure generator suite; DB-backed generation
      suite for pending proposal creation, prompt context, no usable proposal
      refusal, player denial, and AI provenance after approval; action and
      `GeneratePanel` component coverage. Focused generator/action/panel suite
      green (142 tests). lint (0 errors; 2 pre-existing settings-action warnings),
      typecheck, build, and the full coverage gate green (988 tests; statements
      95.3%, branches 87.89%, functions 97.54%, lines 97.27%).
- [x] **Remaining M4 expansion:** bulk-stub scaffolding, bulk-run UX, async
      `Job` worker, and usage/cost tracking with spend caps remain in the open
      backlog. A live provider call still depends on the DM's own BYO key/spend,
      so this slice is verified through mocked-provider service coverage rather
      than a live generation run.

---

## Older milestones (archived)

Completed, green milestones below this point have been moved verbatim to
[`PROGRESS-archive.md`](./PROGRESS-archive.md) to keep this working checklist
lean: the M3 floor/timeline/graph/knowledge slices, the M4 AI foundation
(BYO-key storage, provider abstraction, first generator), **M2** (review
pipeline), **M1**, **M0**, and the early design-language/shell work. Their open
follow-ups (if any) are mirrored in the **Open backlog** section at the top of
this file, which remains the authoritative pickup list.
