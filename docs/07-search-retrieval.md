# 07 — Search & Retrieval

> At DCC's scale a campaign quickly holds thousands of entities, relationships,
> and events. Two problems follow: **humans can't find things**, and **the AI
> can't be handed the whole world** as context. A single retrieval subsystem
> solves both — it powers a search / "Ask the Campaign" experience for users and
> supplies *relevant* canon to every generator and agent.

## Why this is high-leverage

- **Discovery.** "Which NPCs has Carl wronged?" "Show every event on Floor 9."
  "What do we know about the Maestro?" Browsing doesn't scale; search does.
- **Better generation.** Every generator and agent ([`04-ai-integration.md`](./04-ai-integration.md),
  [`05-system-ai-persona.md`](./05-system-ai-persona.md),
  [`06-entity-agents.md`](./06-entity-agents.md)) needs context. Dumping the
  campaign is impossible and dumping too little produces generic, contradictory
  output. Retrieval-augmented context = sharper proposals, fewer hallucinations,
  better respect for established canon. This subsystem is a force-multiplier on
  the AI features, not a standalone nicety.

## Approach: hybrid search over scoped canon

- **Keyword / full-text** (Postgres `tsvector`) for exact and structured queries
  (by type, floor, tag, name).
- **Semantic / vector** (pgvector embeddings of each entity/event/relationship's
  name + summary + key fields) for "things *like* this" and natural-language
  questions.
- **Hybrid ranking** combines both; results are always **campaign-scoped** and
  **filtered by the requester's visibility** (a player's search only sees
  player-visible canon — the same projection as everywhere else; see
  [`02-architecture.md`](./02-architecture.md)).

## Two consumers

### 1. Search & "Ask the Campaign" (users)
- **Search UI** — fast, filterable results across all entity types, relationships,
  and events. Lives in the DM console and (scoped) in the player interface.
- **Ask the Campaign** — a natural-language Q&A: retrieve the top-k relevant
  canon, then have a BYO-key model synthesize an answer **with citations** that
  link back to the source entities/events. Strictly **read-only** — answering a
  question never writes canon. Player "Ask" retrieves only player-visible canon.
  Because answers cite sources, the DM can trust and verify them.
  *As built (M5 slice 5):* `askCampaign` (`src/server/services/ask.ts`) retrieves
  the top-k hits with `searchCanon` (so visibility is enforced **at retrieval** —
  invariant #5), hands the model the retrieved `SearchDoc.content` as numbered
  sources, and parses the model's inline `[n]` markers back to per-source links
  (entity detail / graph / timeline). It needs a **chat** provider (full-text
  search still works with none); with no matching canon it answers "the canon is
  silent" without spending a provider call. The page lives at
  `/campaigns/[id]/ask`. The role-aware service is the single seam the future M7
  player "Ask" reuses.

### 2. Retrieval-augmented context (generators & agents)
- The AI orchestrator's context-building step uses retrieval to assemble the
  *relevant* slice of canon for a generation/agent run instead of ad-hoc dumping.
- **Locks honored:** locked items relevant to the task are retrieved and included
  as read-only "do not modify" context.
- **Scope honored:** agent runs in *in-character* mode retrieve only what the
  entity plausibly knows (fog of war — [`06-entity-agents.md`](./06-entity-agents.md)).

*As built (M5 slice 6):* a `retrieval.ts` seam
(`src/server/services/retrieval.ts`) wraps `searchCanon` for context-building.
`retrieveRelatedEntityIds(userId, campaignId, seed)` builds an OR-joined seed
query from an entity's name + tags (so the full-text arm matches *any* shared
term — `websearch_to_tsquery` would otherwise AND the words) and returns the
relevance-ranked ids of the canon entities most related to the seed, scoped to
the requester's role (so scope/fog-of-war is enforced by reusing `searchCanon`)
and degrading to full-text when no embedder is configured. Two generators draw on
it (`generation.ts`): **relationship inference** picks its candidate edge
endpoints from the seam — relevance-ranked, with an alphabetical baseline as a
coverage floor — instead of dumping the first N entities alphabetically, keeping
locked endpoints out of the *proposable* set; and **flesh-out enrichment** hands
the model the relevant slice of surrounding canon as read-only reference so its
proposed prose stays consistent with the world, *including* locked items (locked
canon relevant to the task is exactly the do-not-modify context this paragraph
calls for — flesh-out only proposes against its own target, so it can't violate
the lock invariant). Both re-check the spend cap after retrieval, since the
query-embed inside `searchCanon` can itself spend. The third generator,
scaffold-stubs, is deliberately *not* retrieval-fed: its dedup needs an
*exhaustive* existing-name check, which a relevance subset can't safely replace.
Its scaling fix is separate from retrieval: the prompt receives only a bounded
sample of existing names, then `scaffoldStubEntities` filters proposed names
against the full live canon set before filing review operations.

## Indexing pipeline

- On canon change (a Change Set approved, an entity/event/edge created or
  updated), enqueue a re-embed of the affected records via the `Job` worker.
  Manual "Build semantic index" clicks are guarded separately: if an
  `EMBED_SEARCH_DOCS` job is already QUEUED or RUNNING for the campaign, the
  action returns that active job instead of enqueueing another paid rebuild.
- Store embeddings alongside a denormalized search document (name + summary +
  salient fields). Re-embedding is idempotent and async; stale-but-close is
  acceptable between writes and re-index.
- Embeddings are derived data — **never part of provenance**, never shown to
  players, regenerable from canon at any time. DMs can inspect the background
  status in `/campaigns/[id]/jobs`.

## Trust & safety

- **Answers are not canon.** "Ask" output is a synthesized view with citations,
  not a proposal — though a DM can choose to turn a useful answer into a proper
  proposal via the normal generation path.
- **Visibility is enforced at retrieval**, not just at render — a player's query
  can never retrieve DM-only or pending content.
- **Provider-agnostic.** Embeddings and synthesis use the BYO-key abstraction; a
  campaign with no AI key still gets keyword/full-text search (semantic features
  degrade gracefully). *Implementation note (M5 slice 4a):* embeddings come from
  an **OpenAI-compatible** provider (real OpenAI or a self-hosted/proxy endpoint)
  — the Anthropic Messages API has no embeddings endpoint — so an Anthropic-only
  campaign keeps full-text search until an OpenAI-compatible key is added.

## Data model touchpoints

A search/embedding store (pgvector) keyed to entity/event/relationship ids plus a
full-text index; an indexing `Job` kind. See [`09-data-schema.md`](./09-data-schema.md).
*As built (M5 slices 4a–4c):* one `SearchDoc` row per target carries `content`,
a generated `searchVector` (tsvector + GIN), and a pgvector `embedding` plus
`embeddingModel` and `embeddingDimensions`; the `EMBED_SEARCH_DOCS` job populates
embeddings. The default 1536-dimensional path has a raw-SQL HNSW cosine
expression index (`SearchDoc_embedding_hnsw_1536_idx`) because Prisma can't
represent pgvector HNSW indexes in `@@index`. Hybrid search first preselects
nearest semantic candidates with the indexable distance expression, then blends
those candidates with full-text rank. Other configured dimensions are supported
through exact vector search until a real campaign needs additional
dimension-specific expression indexes.

## Build sequencing

Lands as **M5** in [`11-roadmap.md`](./11-roadmap.md) — right after AI generation
(M4) so that the persona engine (M6) and entity agents (M11) build their context
on principled retrieval from the start. Keyword/full-text search can ship in M1's
world browser; the semantic + "Ask" layer is M5.
