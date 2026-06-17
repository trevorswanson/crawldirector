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

### 2. Retrieval-augmented context (generators & agents)
- The AI orchestrator's context-building step uses retrieval to assemble the
  *relevant* slice of canon for a generation/agent run instead of ad-hoc dumping.
- **Locks honored:** locked items relevant to the task are retrieved and included
  as read-only "do not modify" context.
- **Scope honored:** agent runs in *in-character* mode retrieve only what the
  entity plausibly knows (fog of war — [`06-entity-agents.md`](./06-entity-agents.md)).

## Indexing pipeline

- On canon change (a Change Set approved, an entity/event/edge created or
  updated), enqueue a re-embed of the affected records via the `Job` worker.
- Store embeddings alongside a denormalized search document (name + summary +
  salient fields). Re-embedding is idempotent and async; stale-but-close is
  acceptable between writes and re-index.
- Embeddings are derived data — **never part of provenance**, never shown to
  players, regenerable from canon at any time.

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
