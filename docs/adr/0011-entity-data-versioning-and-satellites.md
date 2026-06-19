# ADR 0011 — Entity `data` schema versioning, migration & satellite promotion

- **Status:** accepted — **M5.5 complete.** Part A's versioning foundation +
  `readKindData` read seam shipped as slice 1 (2026-06-18); the
  `MIGRATE_ENTITY_DATA` job + first real FLOOR v2 data bump shipped as slice 2
  (2026-06-18); Part B's reference-integrity badge + impact-aware archive shipped as
  slice 3a (2026-06-18); Part B's orphan report shipped as slice 3b (2026-06-18);
  Part C's greenfield Faction satellite shipped as slice 4 (2026-06-18) — a 1:1
  `Faction` table proving the satellite read/write plumbing (an
  `EntityKind.satellite` marker redirects storage while review/lock/provenance
  stay uniform on `Entity`). Part C's **Floor satellite** shipped as slice 5
  (2026-06-19) — the genuine `data → satellite` migration: a FLOOR `schemaVersion`
  2→3 bump moves the real existing `data.floorNumber`/`theme`/`startDay`/
  `collapseDay` into a 1:1 `Floor` table via the `MIGRATE_ENTITY_DATA` job, the
  real proof the machinery promotes existing data. The query shapes warranted
  neither an index nor a satellite for current *performance* (every FLOOR reader
  loads floors wholesale and resolves in memory), but the full satellite landed to
  prove the migration before M7/M9/M10 add weight; `floorNumber` is indexed as the
  canonical lookup key. The generated-column alternative was evaluated and
  rejected (a dead index that proves nothing).
  Decomposes into the slices tracked in [`11-roadmap.md`](../11-roadmap.md) (M5.5)
  and [`PROGRESS.md`](../PROGRESS.md). This ADR **extends [ADR 0009](./0009-entity-kind-registry.md)**:
  0009 consolidated each type's bespoke fields into a per-type descriptor but
  deliberately deferred data migration ("No data migration" — it was a pure
  application-layer refactor). This ADR adds the evolution layer that refactor
  left for later.
- **Date:** 2026-06-18
- **Milestone:** M5.5 (cross-cutting, entity layer). Surfaced while reviewing the
  roadmap before M6: the catalog types (BOX, SKILL, SPELL, ACHIEVEMENT, TITLE,
  the crawler sheet) land in M7, and the shared-library import / export round-trip
  in M10/M9, are where `Entity.data` first carries real, evolving weight. Today
  only FLOOR and ITEM have bespoke fields, so the retrofit is at its cheapest.

## Context

The data model is a deliberate hybrid (see [`01-domain-model.md`](../01-domain-model.md),
[`09-data-schema.md`](../09-data-schema.md)): a generic `Entity` core, a `Crawler`
satellite for the one heavy-query type, `Entity.data` JSON for type-specific
structured fields, and a typed any-to-any relationship graph. **This shape holds
up and this ADR does not change it.** [ADR 0009](./0009-entity-kind-registry.md)
strengthened the *application-layer* organization: every type's bespoke `data.*`
fields now live in one `EntityKind` descriptor (`src/lib/entity-kinds/*`), and
validation, the data-key lists, the reviewable/lockable set, patch-building, the
form, and the detail display all *derive* from it. Adding a type's fields is a
one-file change, not a `type === "X"` branch copied across five files.

What is still missing is **schema *evolution***. A descriptor's `dataSchema` is
treated as if it were permanent, but it will not be — every catalog type will gain
fields, rename them, retype them, and retire them over the life of a campaign. The
gaps that follow are latent today (two types, few fields) and compounding:

| Gap | Where it lives today | Risk as types multiply |
| --- | -------------------- | ---------------------- |
| **No version stamp** | `Entity.data` is untyped `Json @default("{}")`; nothing records which shape produced a row | You cannot tell a v1 row from a v2 row, so you cannot migrate one safely |
| **No migration path** | none — ADR 0009 explicitly deferred it | A field rename/retype either breaks reads or requires a hand-written one-off backfill |
| **Lossy coercion on read** | `normalizeKindFieldValue` ([`entity-kinds/index.ts`](../../src/lib/entity-kinds/index.ts)) returns the field's *empty default* when a stored value's type no longer matches the schema | A type change **silently discards** the old value instead of upgrading it |
| **No reference integrity** | `referenceFields` (e.g. ITEM's `itemTypeId → ITEM_TYPE`) are soft FKs resolved at display time | Deleting/archiving a target silently orphans every referrer, with no warning or audit |
| **Hand-maintained display map** | `HANDLED_DATA_KEYS` in [`kind-display.tsx`](../../src/components/entities/kind-display.tsx) duplicates each descriptor's key set | Drifts from the descriptor; a new field silently falls through to the generic "additional data" panel |

[`09-data-schema.md`](../09-data-schema.md) (Notes for implementers) already
calls for per-type schemas that are *"validated on every write; keep them
versioned"* — and ADR 0009's references say this ADR's predecessor "realizes" that
note. Versioning was promised and never built. The review before M6 is the moment
to build it, while the surface is two descriptors instead of a dozen.

### Constraints carried from the model

- **The generic `Entity` core stays the single supertype.** The review / lock /
  provenance pipeline operates on `Entity` and must keep doing so (the signature
  feature). Versioning and satellites organize *storage and evolution*; they do
  not introduce table-per-type or fork the pipeline.
- **Every bespoke field stays reviewable + lockable canon**, including after a
  migration moves it (a `data.*` field promoted to a satellite column is still
  the same canonical, lockable field — only its physical home changes).
- **Migrations preserve provenance (invariant #3).** A data upgrade is a canon
  write; it records provenance + audit, never a silent in-place mutation.
- **Graceful, lazy by default.** A campaign must keep working the instant the app
  is upgraded — reads upgrade in memory without requiring a migration pass to have
  run first.

### The unifying insight

Versioning and satellite promotion are the *same mechanism*. Moving a `data.*`
field to an indexed satellite column **is** a `vN → vN+1` migration: the upgrade
function drops the field from `data`, and the backfill writes it to the satellite.
So we build the versioning/migration machinery first and then prove it on a real
promotion (Faction, then Floor) instead of a synthetic toy type.

## Decision

**Add a schema-version + migration layer to the `EntityKind` registry, derive all
remaining hand-maintained per-type metadata from the descriptor, add
reference-integrity checks, and use the migration machinery to promote the first
heavy/queried types (Faction, Floor) to satellite tables.** Four parts, each built
as one or more shippable slices (see M5.5 in the roadmap).

### Part A — Schema versioning + migration for `Entity.data`

1. **Versioned descriptor.** `EntityKind` ([`types.ts`](../../src/lib/entity-kinds/types.ts))
   gains `schemaVersion: number` (default `1`) and an optional ordered
   `migrations` array of **pure** functions, where `migrations[i]` upgrades a
   `data` object from version `i+1` to `i+2`. (`migrations.length + 1` must equal
   `schemaVersion`, asserted at module load so a bump can't forget a migration.)

2. **Stamp `data._v` on every write.** `buildKindData`
   ([`index.ts`](../../src/lib/entity-kinds/index.ts)) writes
   `_v: kind.schemaVersion` alongside the bespoke fields. `_v` is **reserved** — no
   descriptor may declare a field named `_v`, and the write schema rejects it as a
   user field (it is metadata, not canon).

3. **Validate-and-upgrade on read.** A new pure `readKindData(type, raw)`:
   reads `raw._v` (an absent/legacy stamp is treated as `1`, since all existing
   rows already match the v1 shapes), applies each `migrations[k]` from the stored
   version up to `schemaVersion`, then validates the result against `dataSchema`.
   This becomes the **single read seam** that replaces today's scattered direct
   `entity.data` reads and the lossy `normalizeKindFieldValue` fallback (which stays
   only as the field-level coercion *inside* a migration step, never as a silent
   data-dropping read).
   **Every `entity.data` read site must route through it** — the enumeration as of
   this writing is **both UI and service layer**, not just the UI:
   - UI: [`kind-display.tsx`](../../src/components/entities/kind-display.tsx),
     [`kind-fields.tsx`](../../src/components/entities/kind-fields.tsx), the
     detail page's additional-data panel ([`entities/[entityId]/page.tsx`](<../../src/app/(dm)/campaigns/[id]/entities/[entityId]/page.tsx>)).
   - Service: [`search-index.ts`](../../src/server/services/search-index.ts) content
     builder; the [`review.ts`](../../src/server/services/review.ts) apply path and
     [`entities.ts`](../../src/server/services/entities.ts) patch builders; and —
     easy to miss — **[`campaigns.ts`](../../src/server/services/campaigns.ts)**,
     which reads `data.floorNumber` / `data.startDay` / `data.collapseDay` directly
     for the floor-anchor / absolute-day resolver. A missed site reads
     **un-upgraded** data; an implementation slice should grep `\.data` to re-confirm
     the full set before claiming the seam complete.

4. **Backfill = lazy + batch.** Lazy: `readKindData` upgrades in memory on every
   read, so the app is correct immediately with no migration run required. Batch:
   the `MIGRATE_ENTITY_DATA` job (Part D) eagerly rewrites stale rows so the stored
   shape converges and stale `_v` rows don't accumulate forever.

5. **Strict unknown-key policy.** The write schema rejects (or strips and audits)
   `data.*` keys that no descriptor declares, so a typo or a removed field is
   caught at the boundary instead of silently persisting. `customFields` stays the
   legitimate escape hatch for DM/AI ad-hoc attributes; the ADR documents the
   boundary: **`data` = registry-defined, versioned, reviewable per-type fields;
   `customFields` = unversioned, free-form, DM-owned extras.**

6. **Derive `HANDLED_DATA_KEYS`** in [`kind-display.tsx`](../../src/components/entities/kind-display.tsx)
   from `dataKeysFor(type)` so the "additional data" fallback panel can no longer
   drift from the descriptor.

### Part B — Reference integrity for `referenceFields`

1. **Validate on write.** `validateReferences(type, data, campaignId)` confirms
   each `referenceFields` target exists, is the declared `EntityType`, and is not
   archived. A broken reference surfaces a **"broken reference"** badge in the
   detail display (it does not hard-block the write — the model is intentionally a
   soft FK — but it is visible and auditable).

2. **Impact-aware archive.** Before archiving an entity, a reverse-lookup reports
   *"N entities reference this"* so the DM sees the blast radius. No hard cascade;
   the soft-FK semantics from [ADR 0009](./0009-entity-kind-registry.md) stay.

3. **Orphan report.** A campaign-scoped orphan scan (broken references, stale
   `_v`) feeds the DM canon-integrity surface and is a natural input to **M10's
   consistency-check generator** — cross-referenced both ways.

### Part C — Satellite-table promotion (Faction, then Floor)

[`09-data-schema.md`](../09-data-schema.md) and ADR 0009 both flag Faction/Floor
as satellite candidates and defer the decision. M5.5 takes it up because the
versioning layer (Part A/D) makes a clean promotion possible.

1. **Pattern + criterion (documented).** `Crawler` is the precedent: a 1:1 table
   keyed by `Entity.id` holding the columns that must be filtered / sorted /
   aggregated **at scale**. Promote a type to a satellite when a `data.*` field
   needs an index or appears in a hot query; leave everything else in `data` JSON.
   Review / lock / provenance stay uniform on `Entity` — a satellite column is just
   another physical home for a canonical, lockable field, addressed by the same
   `data.<field>` review-patch key it has today (the apply path writes the
   satellite; the patch contract is unchanged).

> **Greenfield vs. migration — an honest distinction (corrected after auditing the
> current data).** **Faction has no bespoke `data.*` fields today** — it has no
> `EntityKind` descriptor at all (only FLOOR and ITEM do), so there is *nothing in
> `data` to migrate from*. **FLOOR, by contrast, has real `data.floorNumber` /
> `startDay` / `collapseDay` in live rows**, read across hot paths. So the two
> satellites play different roles, and the "versioning *is* the promotion mechanism"
> insight is proved by FLOOR (and by a within-`data` version bump), **not** by
> Faction. The migration *machinery* (Parts A/D) is therefore proved first by a
> pure **within-`data` `schemaVersion` bump** on an existing descriptor (e.g.
> renaming/retyping a FLOOR or ITEM field) — that exercises `readKindData` +
> `MIGRATE_ENTITY_DATA` on real data without the satellite risk.

2. **Faction satellite (greenfield — proves satellite *plumbing*).** Introduce a
   Faction descriptor + a 1:1 satellite carrying indexed `standing` / `strength`,
   `allegiance`, `resources` — the fields M9 queries and M12's faction-power
   rollups / Faction-Wars tracker need to sort and aggregate. Because Faction has no
   existing `data`, these are **new fields written straight to the satellite** (no
   `data → satellite` migration). This is the deliberately chosen *low-risk* intro:
   it validates the satellite read/write path and that review / lock / provenance
   stay uniform on `Entity`, with few existing readers to disturb.

3. **Floor satellite (the genuine `data → satellite` migration; heavier; sequenced
   last in M5.5).** `floorNumber`, `startDay`, `collapseDay`, `theme` are real
   existing `data` fields read in many hot paths — the absolute-day resolver,
   `campaigns.ts` floor anchors, timeline floor-banding, `currentFloor` resolution
   (ADRs 0005, 0008). Here a `vN → vN+1` migration genuinely **moves `data.*` fields
   into the satellite and drops them from `data`** via the Part D job — the real
   proof that the machinery promotes existing data. Because promotion must update
   every reader, the slice first evaluates the **lighter alternative**: an indexed
   *generated column* for `floorNumber` (and any other purely-lookup field) while
   the values stay in `data`. The slice lands whichever the actual query shapes
   warrant; a full satellite is not assumed.

   **Landed (slice 5, 2026-06-19): the full satellite.** The query-shape audit
   found that *no* FLOOR reader filters/sorts/aggregates by floor fields at the DB
   level — every one loads a campaign's floors wholesale (one Entity per floor) and
   resolves in memory — so neither option is *performance*-warranted today. The
   full satellite was chosen anyway because the slice's job is to *prove the genuine
   `data → satellite` migration* (the Faction greenfield slice deliberately left it
   unproven) before M7's catalog types and M9/M10's import/export put weight on the
   machinery — front-loaded while FLOOR is the only mover. All four fields move to a
   1:1 `Floor` table; `floorNumber` is indexed as the canonical lookup key. The
   generated-column alternative was rejected: it would add a dead index *and* prove
   nothing about the migration. See [`PROGRESS.md`](../PROGRESS.md) for the reader
   inventory and the partial-edit fallback bug the tests caught.

### Part D — Migration execution (`MIGRATE_ENTITY_DATA` job)

- A new `Job` kind `MIGRATE_ENTITY_DATA` (reuses the async worker and the
  dedupe/idempotency pattern proven by `EMBED_SEARCH_DOCS` —
  [`jobs.ts`](../../src/server/services/jobs.ts)). It walks a campaign's entities
  whose `data._v` is below the current `schemaVersion`, runs `readKindData` (and
  writes any satellite columns), and persists the upgraded shape through an
  **auto-approved change set** so provenance is recorded (invariant #3) with an
  `AuditLog` `MIGRATE` row — kept **out of the DM's review queue** (a mechanical
  upgrade is not a content proposal, the same way DM direct edits are auto-approved
  change sets).
- **Actor & source — a concrete account, never an actorless write.** The current
  pipeline cannot represent an actorless system write: `AuditLog.actorUserId` is a
  required FK to `User`, and the apply path falls back to `actorUserId: … ?? ""`
  ([`review.ts`](../../src/server/services/review.ts), e.g. the entity/relationship/
  event apply sites), which would break the audit insert. So the migration must
  carry a **real `userId`**, exactly like the existing `applyAutoApproved*ChangeSet`
  helpers (which set both `actorUserId` and `reviewedById` to that user):
  - **Manual run** → the DM who triggered it, already carried as the required
    `Job.createdById`.
  - **Automatic run** (a `schemaVersion` bump deployed) → the **campaign owner**
    (`Campaign.ownerId`, always present). The job is never enqueued without a
    resolvable user; there is no "system with no account" path.
  - **Honest origin via a new `ChangeSource.MIGRATION` value** (additive
    `ALTER TYPE ... ADD VALUE`, the pattern the `LORE_SEED` `JobKind` used). The
    change set / provenance record `source: MIGRATION` so history reads as a
    *mechanical data-schema migration attributed to <that account>*, **not** a hand
    edit that account made — which resolves the misattribution risk while keeping
    the required actor satisfied. (`IMPORT` is deliberately **not** reused: a
    migration is internal data evolution, not external content coming in.) The
    `09-data-schema.md` `ChangeSource` enum is updated to list `MIGRATION`.
- **Idempotent and safe to re-run.** A row already at the current `_v` is skipped;
  a content change underneath a running pass is handled like the embed job's
  snapshot guard.
- **Triggering.** Enqueued automatically when a descriptor's `schemaVersion` bump
  is deployed (detected by the presence of stale `_v` rows, attributed to the
  campaign owner) and exposable as a DM-visible action in `/campaigns/[id]/jobs`
  (attributed to that DM), where embed/lore/bulk jobs already surface.

## Consequences

- **`Entity.data` becomes safe to evolve.** A descriptor can bump its version and
  ship a pure migration; existing rows upgrade lazily on read and converge via the
  batch job — no hand-written one-off backfills, no silent data loss.
- **Silent data loss is closed.** The lossy "wrong type → empty default" read is
  replaced by explicit, versioned upgrades; coercion only happens *inside* a
  migration step the author wrote on purpose.
- **The last hand-maintained per-type metadata is derived.** `HANDLED_DATA_KEYS`
  joins the validation / key-list / reviewable-set / patch / form / display set
  that already derive from the descriptor (ADR 0009) — one source of truth per
  type, end to end.
- **Soft references stop failing silently.** Orphans are visible, auditable, and
  surfaced before a destructive archive.
- **Satellites land on a real mechanism.** Faction (and, if warranted, Floor)
  become index-friendly for M9/M12 without forking the review pipeline or
  inventing a bespoke migration — the same `MIGRATE_ENTITY_DATA` path serves every
  future promotion.
- **Export/import (M9) gains a forward-migration story.** Stamping each entity's
  `data._v` in the export means an import into a newer app version upgrades through
  the same `readKindData` path instead of failing or coercing — a concrete reason
  this ADR precedes M9.
- **The data model is still untouched in spirit.** Single-table + JSON + satellites
  + typed graph remain; this adds an evolution layer and two satellites, not a new
  paradigm. The review pipeline's contract is unchanged.
- **Cost is front-loaded and small now.** Two descriptors, few fields. Deferred,
  it compounds with every catalog type added in M7 and every row imported in M10.

### Deferred (explicitly out of scope)

- **A runtime / DM-defined custom-type system.** The registry stays code-defined;
  DM ad-hoc attributes stay in `customFields`. (Same boundary as ADR 0009.)
- **Versioning `customFields`.** Free-form by design; only registry `data` is
  versioned.
- **Relationship `attributes` versioning.** Edge attributes carry the same latent
  fragility (an `attributes` JSON + the [ADR 0003](./0003-relationship-create-ux-and-inverse-labels.md)
  type-metadata registry), but edge types carry few structured fields today. When
  they start to, apply the same discipline; noted as a forward item, not built here.
- **CRAWLER storage changes.** The existing satellite path stays as-is; CRAWLER is
  not re-derived through this machinery.
- **Cross-type / structural migrations** (splitting one type into two, moving a
  field between types). Per-kind `data` versioning covers field-level evolution;
  structural reshaping remains a bespoke, reviewed effort if it ever arises.

## References

- [ADR 0009](./0009-entity-kind-registry.md) — the per-type `EntityKind` registry
  this ADR extends; its deferred "No data migration" and satellite notes.
- [`09-data-schema.md`](../09-data-schema.md) — `Entity.data` as the type-specific
  store; the "validate on every write; keep them versioned" implementer note this
  ADR realizes; the satellite-table guidance (Faction/Floor candidates).
- [`01-domain-model.md`](../01-domain-model.md) — the hybrid model and the
  scale-control tactics (custom fields, stubs, soft archive) this sits alongside.
- [ADR 0005](./0005-campaign-current-floor.md), [ADR 0008](./0008-floor-model-unification-and-time-inference.md)
  — the FLOOR `data.*` fields and hot read paths the Floor-satellite slice must
  preserve.
- [`src/lib/entity-kinds/`](../../src/lib/entity-kinds) — `EntityKind`,
  `buildKindData`, `normalizeKindFieldValue`, `dataKeysFor` (the versioning seam).
- [`src/components/entities/kind-display.tsx`](../../src/components/entities/kind-display.tsx)
  — `HANDLED_DATA_KEYS` (to derive from the descriptor).
- [`src/server/services/jobs.ts`](../../src/server/services/jobs.ts) — the async
  `Job` pattern `MIGRATE_ENTITY_DATA` reuses.
