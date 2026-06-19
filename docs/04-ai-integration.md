# 04 — AI Integration (BYO-key, multi-provider)

> **Decided:** bring-your-own-key, provider-agnostic. DMs supply their own API
> key(s); the app supports multiple providers (Claude, OpenAI, and any
> **OpenAI-compatible** endpoint — a self-hosted model or third-party proxy)
> behind a common interface. The [review pipeline](./03-review-pipeline.md) is
> provider-independent — generation produces proposals, never canon.

## Goals

- Let a DM populate and evolve a huge world without hand-authoring everything.
- Keep the DM in control: every generation is a *proposal* (PENDING), with full
  provenance, respecting locks.
- Don't lock the project to one vendor or one pricing model.

## Provider abstraction

A thin interface so generators don't care which vendor runs:

```ts
interface LLMProvider {
  id: string;                 // "anthropic" | "openai" | ...
  models(): ModelInfo[];
  generate(req: GenerationRequest): Promise<GenerationResult>;
  // structured-output support (JSON schema / tool-calling) is required:
  generateStructured<T>(req: StructuredRequest<T>): Promise<T>;
}
```

- `GenerationRequest` carries messages/prompt, model, temperature, max tokens,
  and a campaign/run context (for provenance + cost tracking).
- **Structured output is mandatory** — generators must return a parseable Change
  Set, not freeform prose. Use each provider's JSON-schema / tool-calling mode;
  validate the result with Zod before building the Change Set. On parse failure,
  retry with a repair prompt, then surface an error to the DM (no partial canon).
- Keys are resolved per campaign (or per user) from encrypted storage, decrypted
  only at call time, never logged, never placed in provenance.

> Implementation note: prefer the official SDKs (e.g. `@anthropic-ai/sdk`,
> `openai`) behind the interface. When building Claude-backed generators, enable
> **prompt caching** for the large, stable context blocks (campaign canon, type
> schemas, style guide) to cut cost — see the `claude-api` skill.

**Status (M4 slice 2, delivered):** the interface is real — `LLMProvider` lives
in [`src/server/ai/types.ts`](../../src/server/ai/types.ts) with **two** adapters
behind it: Anthropic (`@anthropic-ai/sdk`, structured output via forced tool use
+ prompt caching) and an OpenAI-compatible adapter (`openai` SDK, `json_schema`
output) shared by OpenAI itself and any compatible endpoint (a self-hosted LLM or
proxy — just a different `baseURL` + explicit model). `generateStructured` derives
the JSON Schema from a Zod schema, validates the result, and retries once on
failure before erroring (no partial canon). `getCampaignProvider`
([`src/server/ai/index.ts`](../../src/server/ai/index.ts)) is the single seam
generators call — it decrypts the BYO key at the call site. A DM-only
**connection test** on the Settings page verifies a configured key/endpoint/model
with a tiny live call before any generation is wired up. See
[ADR 0007](./adr/0007-provider-abstraction-and-openai-compatible.md). The
endpoint URL + model are stored as non-secret config on `AiKey`; for
OpenAI-compatible providers the key is optional (local servers often need none).

## Generators

Generators are named, versioned units that turn an intent + context into a
Change Set proposal. Each declares: input params, the canon context it needs,
its prompt template (versioned, for provenance), and its output schema.

**Status (M4 slice 3, delivered):** the **first generator** is live —
**entity fleshing**. The pure prompt/schema/patch logic lives in
[`src/server/ai/generators/flesh-entity.ts`](../../src/server/ai/generators/flesh-entity.ts)
(cacheable framing + optional campaign style guide + current canon as read-only
reference + locked-field call-outs; a Zod output schema bounding summary/
description/tags); the orchestration is `fleshOutEntity`
([`src/server/services/generation.ts`](../../src/server/services/generation.ts)),
which resolves the campaign's provider, calls `generateStructured`, drops locked
fields from the proposed patch, and files it as a **PENDING `UPDATE_ENTITY`
proposal** via `createPendingEntityChangeSet` (`source: AI`, with provider/model/
prompt id+version recorded so approval writes complete provenance). A DM-only
"Flesh out" panel on the entity detail rail (shown only when a key is configured)
triggers it; the result links straight to the Review Queue. Nothing becomes canon
without DM approval.

**Status (M4 slice 4, delivered):** **relationship inference** is live for one
target entity at a time. The pure generator lives in
[`src/server/ai/generators/infer-relationships.ts`](../../src/server/ai/generators/infer-relationships.ts):
it frames the target, candidate canon entities, existing target relationships,
and valid relationship types, then filters the structured model output down to
usable `CREATE_RELATIONSHIP` review operations (dropping unknown/self/non-target
edges, duplicates, and discouraged duplicate floor-position paths). The
orchestration is `inferRelationshipsForEntity`
([`src/server/services/generation.ts`](../../src/server/services/generation.ts)),
which files the output as a **PENDING relationship Change Set** with AI
provider/model/prompt provenance. The entity detail rail's **Infer
relationships** action links the created proposal set straight to the Review
Queue.

Planned generator families (build incrementally — see roadmap):

- **Entity fleshing:** expand a stub into a full entity ("flesh out Floor 7",
  "detail this faction"). **(Delivered — see status above.)**
- **Relationship inference:** propose edges among existing entities ("who would
  realistically ally/rival here?"). **(Delivered for one target entity at a
  time — see status above.)**
- **Bulk scaffolding:** generate N stubs ("10 mob types for the ice floor",
  "the nine Faction-Wars armies").
- **Event & consequence generation:** "given this event, propose downstream
  effects and causal links" — directly feeds the causality graph.
- **Crawler-interface flavor:** in-fiction System messages, achievement text,
  loot descriptions for the player-facing UI.
- **Consistency checks (non-mutating):** scan canon for contradictions and
  propose fixes as a Change Set the DM can review.
- **Recaps & broadcasts:** summarize a session's log + events into a "previously
  on *Dungeon Crawler World*" recap (overall or per-crawler), optionally in a show
  voice. Persona-aware; respects visibility for player-facing recaps. See
  [`08-session-mode.md`](./08-session-mode.md).

### Persona-aware generators

Several generators are **persona-aware** (`personaAware: true`): encounter,
monster/mob-type, boss, loot/reward, and System-message generators. For these,
the active **System AI persona** is compiled to a prompt fragment and injected so
output reflects the dungeon AI's current mood and agenda. See
[`05-system-ai-persona.md`](./05-system-ai-persona.md). Non-voice generators
(e.g. real-world faction relationship inference) run without the persona.

### Agent simulation generators

A family where the model is briefed to *be* a specific entity (its agent
profile + scoped context) and propose in-character **actions and events**:
single-act, reactive-cascade, and world-tick runs. With providers that support
it (e.g. the Claude Agent SDK), multiple entity-agents run as **parallel
subagents**, each sandboxed to one entity's perspective; otherwise the
orchestrator runs them sequentially behind the same provider interface. Output is
structured proposals (events + relationship/state deltas + causal links) → PENDING
review. Cascades and ticks are **bounded** (max depth/fan-out, spend caps, DM
confirmation). Full design in [`06-entity-agents.md`](./06-entity-agents.md).

## Context building & lock-awareness

When assembling context for a generation:
1. Pull relevant canon (the target entity, its neighborhood/floor, related
   entities, recent events) — respecting the player/DM scope of the requester
   (generators run as the DM). Use the **retrieval subsystem**
   ([`07-search-retrieval.md`](./07-search-retrieval.md)) to select the *relevant*
   slice rather than dumping the campaign — this is the main lever on proposal
   quality and contradiction-avoidance at scale.
2. **Locked data is included as read-only reference** and explicitly marked "do
   not modify." The orchestrator post-filters output: any operation touching a
   locked target becomes a *blocked* operation, never an applied one.
3. Include a campaign **style guide** (tone, canon constraints the DM sets) so
   generated content matches the DM's voice. For persona-aware generators, the
   compiled **System AI persona** fragment is prepended after the style guide and
   before the task (and is a good prompt-caching candidate, being stable across a
   run).
4. Keep context scoped and chunked to control token cost; prefer summaries +
   targeted detail over dumping the whole campaign.

## Async / batching

- Start synchronous (request → wait → proposal) for single-entity generation.
- Introduce a `Job` table + worker for bulk runs and long generations so the UI
  isn't blocked. AI generation jobs file Change Sets through the review pipeline
  and notify the DM when ready. The exceptions are explicitly mechanical,
  audited review writes: the legacy `LORE_SEED` importer and
  `MIGRATE_ENTITY_DATA`; M10 retires lore seeding from normal campaign creation,
  and M9 adds preflight-gated idle maintenance for migrations. As built,
  `/campaigns/[id]/jobs` shows the DM recent queued/running/succeeded/failed jobs
  across bulk flesh-out, lore seed, semantic indexing, and data migration. Manual
  semantic-index rebuilds reuse an active QUEUED/RUNNING rebuild instead of
  enqueueing overlapping paid embedding work. See the planned job-detail,
  accounting, and priority work in
  [`ADR 0013`](./adr/0013-job-priorities-and-idle-maintenance.md).
- Track per-run **cost/usage** (tokens, estimated $) for the DM's awareness;
  store on the run/provenance record (not the key).

## Safety, cost, and trust controls

- **Rate/spend guards:** per-campaign caps and a confirmation before large/
  expensive batch runs.
- **No silent canon:** restated because it's the whole point — generators only
  ever create PENDING proposals.
- **Provenance everywhere:** provider, model, prompt template + version, run id
  recorded so a DM can audit and reproduce.
- **Prompt-injection awareness:** treat any imported/external text (e.g. pasted
  fan-wiki content) fed into generators as untrusted; it can influence output but
  output still goes through review.
- **Graceful degradation:** the app is fully usable with *no* AI key — AI is
  additive. All manual authoring paths work without a provider configured.

## Config surface

Per campaign (DM-controlled):
- enabled providers + encrypted keys,
- default model per generator family,
- spend caps,
- campaign style guide / canon constraints,
- whether co-DMs may trigger generation.
