# ADR 0007 — Provider abstraction + OpenAI-compatible providers

- **Status:** accepted (delivered 2026-06-06)
- **Date:** 2026-06-06
- **Milestone:** M4 (AI generation, BYO-key)

## Context

[ADR 0006](./0006-ai-key-encryption-at-rest.md) shipped the BYO-key storage
foundation. This slice builds the **provider abstraction** that *consumes* a
decrypted key: the thin, vendor-neutral interface every generator (later M4
slices) calls so the [review pipeline](../03-review-pipeline.md) and persona/
agent features stay provider-independent
([`04-ai-integration.md`](../04-ai-integration.md)).

Two design questions drove the decision:

1. **Which providers?** M4's storage slice supported Anthropic and OpenAI. DMs
   also want to point CrawlDirector at a **locally hosted model** (Ollama, LM
   Studio, vLLM, llama.cpp) or a **third-party service** — anything that speaks
   the OpenAI Chat Completions protocol. That is a config concern (a base URL +
   an explicit model, sometimes no API key), not a third hand-written adapter.
2. **How is structured output produced?** Generators must return a parseable
   Change Set, never prose — so the interface has to constrain the model to JSON
   and validate it before anything reaches canon.

## Decision

**One interface, two adapters, three providers.**
[`src/server/ai/types.ts`](../../src/server/ai/types.ts) defines `LLMProvider`
(`generate` + `generateStructured<T>`). There are exactly **two** adapter
implementations:

- **Anthropic** (`anthropic.ts`, `@anthropic-ai/sdk`) — structured output via
  **forced tool use** (one tool whose `input_schema` is the Zod schema, with
  `tool_choice` pinned to it). Stable system blocks are **prompt-cached**
  (`cache_control: ephemeral`) to cut cost on the large fixed context generators
  reuse across a run. Default model `claude-opus-4-8`.
- **OpenAI-compatible** (`openai.ts`, `openai` SDK) — structured output via
  `response_format: json_schema` (strict). This **one** adapter serves OpenAI
  itself *and* every compatible endpoint; the only difference is `baseURL` and an
  explicit model, so a self-hosted LLM is the same code path pointed elsewhere.

The registry ([`src/lib/ai/providers.ts`](../../src/lib/ai/providers.ts)) gained
a `kind` (which adapter) plus per-provider flags — `requiresBaseUrl`,
`requiresModel`, `keyOptional` — and a third entry, **`openai-compatible`**. It
stays pure and client-safe (the settings UI reads it).

**Endpoint + model are non-secret config on `AiKey`.** Migration
`20260606120000_m4_ai_key_endpoint` adds nullable `baseUrl` + `model` columns
(the API key stays in `ciphertext`). For a custom endpoint, `baseUrl` and `model`
are required and the key is optional (local servers often need no auth — the
factory substitutes a harmless placeholder so the OpenAI SDK is satisfied). URLs
are validated (`http`/`https`, parseable, trailing slash normalized) at store
time so a typo fails loudly.

**Structured output is validate-then-repair.** `generateStructured` derives a
JSON Schema from the Zod schema (Zod 4's `z.toJSONSchema`, `$schema` stripped),
calls the provider, Zod-validates the result, and on failure retries **once**
with a repair hint before throwing `ProviderError` — no partial canon
([`structured.ts`](../../src/server/ai/structured.ts)). Token usage (incl.
cache hits) is returned on every result for later cost tracking.

**`getCampaignProvider` is the single seam.**
[`src/server/ai/index.ts`](../../src/server/ai/index.ts) resolves a campaign's
stored key + config into a ready adapter, decrypting at the call site. Nothing on
the action/client surface imports the adapters or the decrypt path directly —
that is what holds invariant #6 (secrets never reach the client, logs, or
provenance). It returns `null` when no usable key is configured, so the app
degrades gracefully (AI is additive).

**A connection test is the shippable, no-canon deliverable.**
`testAiConnection` (DM-only) makes a tiny structured "ping" through the whole
abstraction so a DM can confirm their key/endpoint/model work *before* generators
rely on them. Provider/SDK errors are translated to short, key-safe messages
(e.g. a 401 → "authentication failed") — the raw vendor message is never
surfaced.

## Consequences

- A DM can use Anthropic, OpenAI, or **any OpenAI-compatible endpoint** (local or
  third-party), and verify it with one click — with **no generators yet** (those
  are the next M4 slice). The app stays fully usable with no key.
- Adding another first-party vendor later is a new adapter + a registry entry;
  adding another compatible endpoint is just config. The generator layer never
  changes.
- Two runtime deps (`@anthropic-ai/sdk`, `openai`) are now first-class. They are
  imported only under `src/server/ai/` (server-only).
- `max_tokens` (not the newer `max_completion_tokens`) is sent on the
  OpenAI-compatible path because it is the field every compatible server
  understands; revisit if a target endpoint requires the newer field.
- Structured output assumes the endpoint supports `json_schema` /
  tool-calling. A compatible server that doesn't will surface a clear error from
  the connection test rather than silently degrading.
