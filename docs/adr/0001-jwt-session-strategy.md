# ADR 0001 — JWT session strategy (not database sessions)

- **Status:** accepted
- **Date:** 2026-05-27
- **Milestone:** M0

## Context

[`02-architecture.md`](../02-architecture.md) says auth uses "Auth.js (NextAuth
v5) … session via database adapter." M0 also requires an **email/password**
(credentials) sign-in. In Auth.js v5 the **Credentials provider is incompatible
with the database session strategy** — it only works with the JWT strategy,
because there is no OAuth account/session row to anchor a DB session to.

## Decision

Use the **JWT session strategy** while keeping the **Prisma adapter** for user
and OAuth-account persistence. The signed-in user's id is carried in the JWT and
copied onto `session.user.id` in the `session` callback. The `Session` table
exists in the schema (the adapter expects it) but is unused under JWT.

## Consequences

- Credentials + OAuth (GitHub) coexist. OAuth users/accounts are still persisted
  via the adapter; credentials users are looked up and verified (bcrypt) in the
  provider's `authorize`.
- No DB round-trip to read a session (stateless JWT). Server-side sign-out and
  instant revocation are weaker than DB sessions; acceptable for this app.
- Route protection is done in server components via `requireUser()` (which calls
  `auth()`), not in edge middleware — this avoids importing bcrypt/Prisma into
  the edge runtime.
- If we later drop credentials in favor of OAuth/email-only, we can revisit and
  switch to database sessions. `09-data-schema.md`'s intent (persisted identity)
  still holds.

The architecture doc has been left describing intent; this ADR records the
concrete deviation.
