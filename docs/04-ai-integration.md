# 04 — AI Integration (BYO-key, multi-provider)

> **Decided:** bring-your-own-key, provider-agnostic. DMs supply their own API
> key(s); the app supports multiple providers (Claude, OpenAI, others) behind a
> common interface. The [review pipeline](./03-review-pipeline.md) is provider-
> independent — generation produces proposals, never canon.

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

## Generators

Generators are named, versioned units that turn an intent + context into a
Change Set proposal. Each declares: input params, the canon context it needs,
its prompt template (versioned, for provenance), and its output schema.

Planned generator families (build incrementally — see roadmap):

- **Entity fleshing:** expand a stub into a full entity ("flesh out Floor 7",
  "detail this faction").
- **Bulk scaffolding:** generate N stubs ("10 mob types for the ice floor",
  "the nine Faction-Wars armies").
- **Relationship inference:** propose edges among existing entities ("who would
  realistically ally/rival here?").
- **Event & consequence generation:** "given this event, propose downstream
  effects and causal links" — directly feeds the causality graph.
- **Crawler-interface flavor:** in-fiction System messages, achievement text,
  loot descriptions for the player-facing UI.
- **Consistency checks (non-mutating):** scan canon for contradictions and
  propose fixes as a Change Set the DM can review.

## Context building & lock-awareness

When assembling context for a generation:
1. Pull relevant canon (the target entity, its neighborhood/floor, related
   entities, recent events) — respecting the player/DM scope of the requester
   (generators run as the DM).
2. **Locked data is included as read-only reference** and explicitly marked "do
   not modify." The orchestrator post-filters output: any operation touching a
   locked target becomes a *blocked* operation, never an applied one.
3. Include a campaign **style guide** (tone, canon constraints the DM sets) so
   generated content matches the DM's voice.
4. Keep context scoped and chunked to control token cost; prefer summaries +
   targeted detail over dumping the whole campaign.

## Async / batching

- Start synchronous (request → wait → proposal) for single-entity generation.
- Introduce a `Job` table + worker for bulk runs and long generations so the UI
  isn't blocked; jobs land Change Sets in the queue and notify the DM when ready.
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
