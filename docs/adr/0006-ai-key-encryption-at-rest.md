# ADR 0006 — BYO AI key storage and encryption at rest

- **Status:** accepted (delivered 2026-06-06)
- **Date:** 2026-06-06
- **Milestone:** M4 (AI generation, BYO-key)

## Context

M4 is bring-your-own-key: a DM supplies their own provider API key(s) (Anthropic,
OpenAI, …) and the app calls the provider on their behalf. Non-negotiable
invariant #6 ([`AGENTS.md`](../../AGENTS.md), [`04-ai-integration.md`](../04-ai-integration.md))
says those secrets **never reach the client, logs, or provenance** and are
decrypted only at the server-side provider call.

The data-schema doc ([`09-data-schema.md`](../09-data-schema.md)) sketched an
`AiKey { campaignId, providerId, ciphertext }` table "encrypted at rest" but left
the mechanism, the trust boundary, and the settings UX undecided. This slice is
the storage + management foundation; the provider abstraction and generators are
later M4 slices that *consume* the decrypted key.

## Decision

**Symmetric envelope encryption with a single app-held data key.**
[`src/server/crypto.ts`](../../src/server/crypto.ts) encrypts each key with
**AES-256-GCM** and a per-message random 12-byte IV; the GCM auth tag detects
tampering. The 32-byte data key is derived once via `scrypt(AI_KEYS_SECRET,
fixed-salt)`. Stored format is an opaque, versioned string
`v1:<ivB64>:<tagB64>:<ciphertextB64>` in `AiKey.ciphertext`. We deliberately did
**not** pull in a KMS/HSM or an asymmetric scheme: a self-hostable single-secret
model matches the project's deploy story (M9), and the versioned prefix leaves
room to migrate the scheme later.

**The env var is the only secret.** `AI_KEYS_SECRET` (committed as a placeholder
in `.env.example`, generated with `openssl rand -base64 32`) is required to store
or read a key. Rotating it **invalidates every stored ciphertext** — by design:
a leaked DB without the env var yields nothing, and rotation forces re-entry
rather than silently "working" against a now-wrong key. Decryption failure is
treated as "no usable key," never as plaintext.

**`src/server/` is the trust boundary.** The crypto helper and the
`getDecryptedAiKey` reader live under `src/server/` and are never imported by a
client component or returned from a Server Action. The codebase already treats
`src/server/*` as server-only by convention (no `server-only` package); we follow
that rather than adding a dependency. Plaintext exists only transiently inside a
provider call (later slices).

**A non-secret `lastFour` hint.** `AiKey.lastFour` stores the key's last four
characters (like a card) so the DM can recognize which key is set without ever
re-displaying it. The settings UI ([`AiKeysPanel`](../../src/components/settings/ai-keys-panel.tsx))
and the safe `AiKeyView` projection expose only `{ providerId, label, lastFour,
createdAt, updatedAt }` — never the ciphertext or plaintext. Inputs are
`type="password"`.

**Set/replace/remove are deliberate, audited DM actions** (`AuditLog`
`SET_AI_KEY` / `DELETE_AI_KEY`), not content change sets — parallel to locks and
knowledge reveals. The audit `detail` records only `providerId` + `lastFour` (+
`replaced`), never the key. One key per `(campaignId, providerId)` (upsert).

**Provider registry is pure and client-safe.**
[`src/lib/ai/providers.ts`](../../src/lib/ai/providers.ts) is the source of truth
for valid `providerId`s and their labels — no secrets, no env, no Prisma — so the
settings dropdown and the service share one list. `keyPrefix` is a soft UI hint,
not validation (any provider/proxy key works).

## Consequences

- The app stays fully usable with **no** key configured — AI is additive; nothing
  in this slice gates existing flows.
- A DB compromise alone never exposes keys; an env-var compromise + DB does. That
  is the accepted bound for a single-secret, self-hostable model. KMS-backed
  per-tenant keys can be layered in later behind the same `crypto.ts` interface
  and the `v1:` version prefix.
- Rotating `AI_KEYS_SECRET` is a breaking operation for stored keys (re-entry
  required). This is documented in `.env.example`.
- `getDecryptedAiKey(campaignId, providerId)` is the single server-only seam the
  M4 provider abstraction will call; keeping it off the action/client surface is
  what holds invariant #6.
- The schema added `lastFour`, `createdById`, and `updatedAt` beyond the doc's
  minimal sketch (display hint + provenance of who configured it); the data-schema
  doc is updated to match.
