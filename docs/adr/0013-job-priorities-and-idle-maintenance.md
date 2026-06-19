# ADR 0013 — Job priorities, inspection & idle-time maintenance

- **Status:** proposed — scheduled in M9.
- **Date:** 2026-06-19
- **Milestone:** M9. Extends M4's worker and M5.5's data-migration machinery
  before repair and import operations grow more common.

## Context

The current Jobs page exposes a job's type, times, id, status, and a compact
JSON-derived outcome. That is insufficient for a DM to answer what changed: a
semantic backfill reports a count and model but not which search documents were
updated; a data migration reports checked/migrated/skipped totals but not the
per-entity transformation or possible impact.

AI usage already records provider/model, input/output/cache token counts, and
known estimated cost, but it is linked only indirectly to a produced change set.
A background job may make zero, one, or many provider calls, so usage must be
attached to the job as a one-to-many relationship rather than copied into its
unstructured result.

The worker claims eligible jobs strictly FIFO today. It has no distinction
between work a DM explicitly requested and background maintenance. More
importantly, `MIGRATE_ENTITY_DATA` performs an audited, auto-approved review
change set. The shipped FLOOR v2→v3 migration transfers all four fields to the
`Floor` satellite and is lossless, but the general mechanism can discard
off-schema/removed keys because `readKindData` intentionally returns only the
current descriptor shape. The existing audit trail is not a rollback mechanism
for a field that was never represented in the migration patch.

The current job classes have different safety properties:

| Job kind | Canon/data effect | Risk to surface |
| --- | --- | --- |
| `BULK_FLESH` | Files `PENDING` AI proposals | Spend and proposal quality; no automatic canon write |
| `EMBED_SEARCH_DOCS` | Rebuilds derived search vectors | Spend and stale/retried derived data; no canon loss |
| `LORE_SEED` | Creates auto-approved canonical entities | Not data loss, but it changes canon and can create unwanted/duplicate source material; M10 retires it from normal onboarding |
| `MIGRATE_ENTITY_DATA` | Applies auto-approved structural canon updates | Future migrations can drop/retire data or otherwise have impact; current FLOOR move is lossless |

## Decision

### 1. Make job outcomes inspectable and account for AI at the job boundary

Add a DM-only job detail view and a structured result contract per `JobKind`.
The list remains compact; the detail view is the record of work. It includes
affected entity/relationship/search-document identifiers and display names,
per-item outcome/reason, created change-set ids, safe errors, and start/finish
times. Do not put raw prompts, provider responses, encrypted keys, or other
secrets in this record.

Add an optional `jobId` foreign key on `AiUsage` and record it for every provider
call made by a job. The detail page aggregates its usage rows — input/output/cache
tokens, provider/model, known estimated USD, and an explicit “cost unknown” state
for unpriced models. Synchronous calls remain valid with `jobId = null`.

Every maintenance result records a structured before/after/impact summary. An
embedding job lists documents updated and skipped (with the model/dimensions);
a data migration lists each candidate's versions, fields moved, fields retained,
fields proposed to drop, and why it was or was not applied. Large result sets may
be paginated into a related detail table rather than overloading `Job.result`,
but the durable job-detail API remains the source of truth.

### 2. Schedule user work before maintenance

Add an explicit scheduling class/priority to `Job`. At minimum it separates
DM-initiated work from maintenance; ordering is priority first and FIFO by
creation time within a priority. The worker claims eligible DM work before any
maintenance job. Automatic search-index refreshes and other future background
tasks must declare their class deliberately rather than accidentally competing
with a DM's request.

When no user work is eligible, the worker may run an idle scanner that discovers
maintenance candidates. It creates durable, observable maintenance jobs rather
than mutating rows inside the poll loop. The scanner must be rate-limited and
deduplicated per campaign/type so an idle worker cannot flood the queue or starve
later interactive jobs. A newly queued DM job always wins the next claim.

### 3. Require preflight before automatic data repair

`MIGRATE_ENTITY_DATA` gains a pure per-entity preflight that compares the raw
stored shape, migrated/validated shape, and satellite writes before any review
apply. Classify a candidate as:

- **clean:** validation succeeds, no raw field is lost, and every storage move is
  accounted for (for example, a value moves from `Entity.data` to a satellite).
  An idle maintenance job may auto-apply this change through its existing
  auto-approved, provenance-tracked migration path.
- **impacting:** an off-schema/removed field would be dropped, validation cannot
  preserve a value, a type change needs a non-trivial coercion, or another
  destructive/ambiguous effect is detected. Do not apply it automatically.
  Persist the dry-run impact preview and surface a DM action that can choose a
  reviewed repair/mapping or explicitly discard the identified data.

The policy applies prospectively to every new descriptor migration. It does not
claim that the already-shipped FLOOR move lost data; that migration is the
baseline clean case. A migration remains one-way unless a separately designed,
compensating review change set is implemented.

## Consequences

- DMs can audit cost and operational impact from the same place they inspect job
  status, while provider credentials and raw model output remain unavailable.
- The job worker needs priority-aware claiming, durable maintenance discovery,
  usage linkage, and result/detail persistence; its current strict FIFO query is
  insufficient.
- Automatic repair becomes conservative by construction. New data migrations must
  supply a preflight/diff test fixture, and descriptor authors must treat a
  removed key as an explicit product decision rather than a side effect.
- `LORE_SEED` is accurately classified as a canonical-content mutation, which
  reinforces ADR 0012's decision to replace it with reviewed library import for
  ordinary campaign creation.

## Verification when implemented

- Service tests prove priority/FIFO ordering, an idle maintenance job never runs
  while an eligible DM job exists, scanner deduplication, and safe retry/claim
  behavior.
- Preflight tests cover a clean satellite move, unknown-key detection, removed
  field, failed validation, explicit discard, and a no-write guarantee for every
  impacting case.
- Job-detail tests prove all affected records and per-job token/cost aggregation
  render for DMs only, report unknown pricing honestly, and never expose secret
  payloads or raw provider errors.
