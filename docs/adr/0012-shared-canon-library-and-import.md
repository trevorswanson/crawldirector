# ADR 0012 — Shared canon library, global administration & relationship-aware import

- **Status:** proposed — scheduled across M9 (administration foundation) and M10
  (library and importer).
- **Date:** 2026-06-19
- **Milestone:** M9/M10. Extends M9's reviewable data portability and turns M10's
  importable canon into a managed, graph-aware library rather than a one-time
  seed file.

## Context

Today CrawlDirector's authorization boundary is a `Membership` scoped to one
`Campaign`; its only roles are `OWNER`, `CO_DM`, and `PLAYER`. There is no
application-wide administrator, no campaign intended as shared source material,
and no safe exception to the rule that campaign reads require membership. The
legacy `LORE_SEED` job imports a privately supplied dataset into a newly created
campaign through auto-approved review change sets. It cannot provide curation,
cross-DM suggestions, or an auditable per-campaign choice of what to adopt.

The graph makes a library import more than copying entity rows. Relationships
must follow selected endpoints, including when endpoint A was imported in one
session and endpoint B in a later session. Imports must still obey the defining
review invariant: they are `PENDING` target-campaign proposals with `IMPORT`
provenance, never direct canon writes.

## Decision

### 1. Use a global super-admin, not a fourth campaign role

Add an app-wide super-admin capability on `User` (for example,
`isGlobalAdmin`), guarded by a dedicated authorization helper. It is deliberately
separate from `Membership`: a user may administer the service without becoming a
DM in every customer campaign, and an `OWNER` in a campaign gains no global
privilege. There is no self-service elevation: the first administrator is
provisioned by a deployment-controlled bootstrap path, and later elevation is
performed only by an existing super-admin with an audit record.

M9 adds a super-admin-only `/admin` shell for CrawlDirector-wide operations. Its
initial responsibility is to establish and manage the shared library; it must use
the normal service layer for canon operations, not bypass review/provenance. The
single shared-library campaign is explicitly marked at the database level (with a
singleton-enforcing constraint) and is owned by a super-admin. A normal campaign
cannot opt itself into being a library.

### 2. Give the shared library a narrow, read-only access policy

Library access is **not** a generic relaxation of campaign tenancy. A dedicated
`assertCanReadSharedLibrary` policy grants browse access only to the global
super-admin or a user who is a DM (`OWNER` or `CO_DM`) of at least one campaign.
It returns the same visibility-safe read model as other DM-facing views; players
have no cross-campaign library entitlement. Every other campaign keeps its
membership-gated read path unchanged.

Only the library admin may directly author, approve, archive, or configure
library canon. A non-admin DM's library edit is a `PENDING` change set in the
**library campaign**, attributed to that DM and marked `PLAYER_SUGGESTION` (the
existing suggestion provenance value). The library admin reviews it in the
library's Review Queue. Locks and ordinary review staleness rules continue to
apply.

### 3. Import as an origin-linked, dependency-aware review batch

M10 replaces normal new-campaign lore seeding with library selection and import.
An import planner reads the library snapshot and creates a target-campaign
`PENDING` change set with source `IMPORT`. Its payload/provenance names the
source library entity or relationship and the import request; the source content
is copied as a local snapshot. A later library edit never silently synchronizes
to a target campaign.

Approved imports create first-class relational import links, not a reserved key
in `Entity.data`. Use typed entity and relationship import-link records (or an
equivalently constrained relational design) that map:

- the target campaign and its local entity/relationship;
- the immutable source library entity/relationship; and
- the approving import change set.

The database must enforce one local import link per library object per target
campaign. This makes retry/re-import idempotent, preserves source provenance
through type-data migration, and supplies the lookup needed to recover graph
edges. It also avoids treating source identity as user-editable canon or an
entity-kind-specific field.

For every import selection, the planner scans library relationships whose two
endpoint origins are either already linked in the target campaign or proposed in
the current batch. It proposes each not-yet-linked relationship with `IMPORT`
provenance. Relationships in the same batch identify their endpoints by stable
library origin, not by an as-yet-uncreated local id, and declare dependencies on
the corresponding entity import operations. Review/apply must resolve the local
ids transactionally and block or retain a relationship if an endpoint import is
rejected or otherwise unavailable. Thus approving A today and B tomorrow causes
the planner to offer A↔B then; approving A and B together can offer the edge in
the same review batch; and no partial review creates a dangling edge.

## Consequences

- The product gains a clear owner for curated DCC material and an auditable
  cross-campaign contribution flow without weakening ordinary campaign tenancy.
- The importer needs explicit operation dependency/alias support beyond today's
  simple relationship payloads, plus import-link tables and tests for same-batch,
  cross-session, retry, partial-review, archived-source, and duplicate-edge cases.
- `LORE_SEED` remains a legacy path while M10 is built, but it is removed from
  normal new-campaign onboarding once the library is usable. Unlike a library
  import, it currently auto-approves canonical content.
- The global admin panel is intentionally narrow at first. Broad user/campaign
  management, billing, moderation, or support tooling must be separately scoped;
  this ADR does not make the admin a back door into customer canon.

## Verification when implemented

- Unit/service tests prove that a player cannot browse or suggest into the
  library; a DM can browse/suggest but cannot approve; and a super-admin can
  administer the library without membership leakage into ordinary campaigns.
- Import tests prove `PENDING`/`IMPORT` provenance, no target canon before
  approval, same-batch edge dependencies, cross-session edge recovery,
  idempotency, and no propagation from later library edits.
- Browser tests cover the library browse → select → target Review Queue handoff,
  the library-suggestion handoff to the admin queue, and `/admin` access denial
  for non-admins.
