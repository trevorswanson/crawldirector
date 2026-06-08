# ADR 0009 — Per-type entity-kind registry (consolidate bespoke type fields)

- **Status:** accepted — **fully delivered** (slices 1–3b), tracked in
  [`PROGRESS.md`](../PROGRESS.md). Slices 1–2: registry scaffold + FLOOR, then
  ITEM + reviewable-set derivation; slice 3a: the registry-driven apply-path
  `data` builder; slice 3b: the form/display client slots (ITEM's form moved to
  the `kind-fields.tsx` companion, its read-view display to a new `kind-display.tsx`
  `<KindDisplay>` dispatcher), retiring the last `type === "ITEM"/"FLOOR"` branches
  in the form and detail page. The brand-new-type "proof" lands with M7's BOX (one
  descriptor file), as planned.
- **Date:** 2026-06-07
- **Milestone:** Cross-cutting (entity layer). Surfaced during M3/M4 as FLOOR and
  ITEM grew bespoke fields; should land before the catalog types (BOX, SKILL,
  SPELL, ACHIEVEMENT, TITLE, …) get their own fields and multiply the pattern.

## Context

The data model is a deliberate hybrid (see [`01-domain-model.md`](../01-domain-model.md)):
a generic `Entity` core, a `Crawler` satellite for the one heavy-query type,
`Entity.data` JSON for type-specific structured fields, and a typed any-to-any
relationship graph. **This decision does not touch that model — it holds up.** A
new noun is an `EntityType` enum value; a new connection is a `RelationshipType`;
the ACHIEVEMENT→BOX→ITEM chain a DM might invent is just entities plus
`GRANTS_BOX` / `CONTAINS` edges, with no structural migration. The DB shape is
fine and is explicitly *not* what this ADR proposes to change.

What is **not** holding up is the **application-layer organization of
type-specific fields**. Each type's bespoke `data.*` fields are special-cased
inline, in several files at once, with a `type === "X"` branch in each. Today
only two types (FLOOR, ITEM) carry bespoke fields beyond the CRAWLER satellite,
and adding one field already means editing the same knowledge in ~5 places:

| Concern | Where it lives today | Smell |
| ------- | -------------------- | ----- |
| Field validation | `entityCoreSchema` in [`validation.ts:141`](../../src/lib/validation.ts) | FLOOR (`floorNumber`/`theme`/`startDay`/`collapseDay`) and ITEM (`itemTypeId`/`divine`/`unique`/`fleeting`/`aiDescription`) fields are flattened into the **core** schema — it validates fields meaningless for the entity being validated |
| Per-type key lists | `crawlerOnlyKeys` / `itemKeys` / `floorKeys` in [`validation.ts:220`](../../src/lib/validation.ts) | an ad-hoc, partial registry already exists — just scattered and unnamed |
| Create patch builder | [`entities.ts:188`](../../src/server/services/entities.ts) | per-type `data.*` patch entries, `if (type === "FLOOR")` |
| Update patch builder | [`entities.ts:511`](../../src/server/services/entities.ts) | the **same** per-type list duplicated for the update path |
| Reviewable-field registry | `dataFields` set in [`review.ts:110`](../../src/server/services/review.ts) | every `data.*` field must also be hand-registered here or it won't route through review/locking |
| Form rendering | `type === "ITEM"` / `type === "FLOOR"` IIFE blocks in [`entity-forms.tsx:164`](../../src/components/entities/entity-forms.tsx) | a growing conditional ladder in one 940-line component |
| Detail display | `type === "ITEM"` / `type === "CRAWLER"` branches in [`entities/[entityId]/page.tsx:134`](../../src/app/(dm)/campaigns/[id]/entities/[entityId]/page.tsx) | display logic has no per-type home; FLOOR's "special hooks/displays" land here |

The friction the DM reported as *"Floor needs special hooks/displays in the UI"*
is this pattern surfacing. It is the **early warning**, not an anomaly: every new
bespoke type currently copies a `type === "X"` branch into each of those files.
At ~6 catalog types deep, `entityCoreSchema` is a junk drawer, the form is a
conditional ladder, and the reviewable-field set drifts out of sync with the
schema by hand.

### Constraints carried from the model

- **The generic `Entity` core stays the single supertype.** The review / lock /
  provenance pipeline operates on `Entity` and must keep doing so (the signature
  feature — [`01-domain-model.md`](../01-domain-model.md)). A registry organizes
  *application code*; it does not introduce table-per-type.
- **`Crawler` stays a satellite table**, not a registry entry — it is the heavy-
  query exception ([`09-data-schema.md`](../09-data-schema.md)). The registry
  governs `data.*`-backed bespoke fields, with the CRAWLER satellite handled as
  its own (existing) path. Future satellites (Faction/Floor, flagged in doc 09)
  remain an orthogonal, deferred decision.
- **Every bespoke field stays reviewable + lockable canon.** Whatever the
  registry generates must still register the field in the `dataFields` /
  reviewable-field machinery — ideally *derived from* the registry so the two can
  no longer drift.
- **No data migration.** Bespoke fields already live in `Entity.data`; this is a
  pure refactor of how the code that reads/writes/validates/renders them is
  organized. Behavior is unchanged.

## Decision

**Introduce a per-type `EntityKind` descriptor — one module per type — as the
single source of truth for that type's bespoke fields, and derive validation,
patch-building, the reviewable-field set, the form, and the detail display from
it.** New bespoke type = one new descriptor file registered once, instead of a
`type === "X"` branch added to five files.

### 1. The `EntityKind` descriptor

A descriptor co-locates everything currently scattered per type:

```ts
// src/lib/entity-kinds/floor.ts
export const FLOOR_KIND: EntityKind = {
  type: "FLOOR",
  // The bespoke data.* fields, as a Zod schema (replaces the FLOOR slice of
  // entityCoreSchema). dataKeys + the data.* patch entries derive from this.
  dataSchema: z.object({ floorNumber, theme, startDay, collapseDay }),
  // Optional per-type rendering. Absent => generic fallback.
  FormFields: FloorFields,     // the JSX now inlined in entity-forms.tsx
  DisplayPanel: FloorPanel,    // FLOOR's "special displays" get a home
};
```

- **`dataSchema`** replaces the per-type slices flattened into `entityCoreSchema`.
  `entityCoreSchema` shrinks back to genuinely shared fields; a write validates
  `core ∧ kind.dataSchema` for its type only.
- **`dataKeys`** (the `floorKeys` / `itemKeys` lists today) is derived from
  `dataSchema.shape`, not maintained by hand.
- **The reviewable-field set** (`dataFields` in `review.ts`) is derived from the
  union of all registered `dataSchema` keys — so a new field is reviewable/
  lockable automatically and can no longer be forgotten.
- **The patch builders** (create + update in `entities.ts`) iterate
  `kind.dataKeys` to emit `data.*` entries, collapsing the two duplicated
  per-type blocks into one data-driven pass.
- **`FormFields` / `DisplayPanel`** are optional components. The form and detail
  page render `kindFor(entity.type)?.FormFields` / `DisplayPanel` instead of an
  `if (type === …)` ladder; a type with no descriptor falls back to the generic
  core form/display unchanged.

### 2. A registry keyed by `EntityType`

```ts
// src/lib/entity-kinds/index.ts
const KINDS: Partial<Record<EntityType, EntityKind>> = {
  FLOOR: FLOOR_KIND,
  ITEM:  ITEM_KIND,
  // …added as types gain bespoke fields
};
export const kindFor = (type: EntityType) => KINDS[type];
```

Types with no bespoke fields simply have no entry — the generic path serves them.
`CRAWLER` keeps its satellite-table path; if useful it can carry a descriptor for
its *form/display* slots while its storage stays the satellite, but that is not
required by this ADR.

### 3. Migration is the refactor itself (no data change)

- **Schema:** none. All bespoke fields already live in `Entity.data`.
- **Behavior:** unchanged — the same fields validate, persist, review, lock, and
  render. Existing tests (`generation`, `dm-actions`, `generate-panel`, the
  entity service tests) should pass without assertion changes; any churn is
  import paths.
- **Strangler approach:** the registry can be introduced alongside the current
  inline code and types migrated one at a time (FLOOR first, then ITEM), deleting
  each `type === "X"` branch as its descriptor takes over. Done when no bespoke
  `type === …` branch remains in the schema, patch builders, form, or detail page.

### Phased delivery (each shippable, behavior-preserving)

1. **Registry scaffold + FLOOR.** ✅ Add `EntityKind` / `kindFor`, port FLOOR's
   four `data.*` fields into `FLOOR_KIND.dataSchema`, derive `floorKeys` and the
   FLOOR slice of `dataFields` from it, and route the FLOOR form block + the
   create/update patch entries through the descriptor. Delete the inline FLOOR
   branches. ITEM and everything else untouched.
2. **ITEM + derive the reviewable-field set wholesale.** ✅ Port ITEM's fields,
   then make `dataFields` (review.ts) a *derivation* over all registered
   descriptors so no field is hand-registered. `entityCoreSchema` drops its
   FLOOR/ITEM slices and is genuinely core again. (Note: a static Zod schema
   can't know the type at parse time, so the *write* schema accepts the union of
   all kinds' fields and the patch builders persist only the type's own — the
   key/reviewable sets still can't drift.)
3. **Registry-driven apply-path + display/form slots.** Split into two
   shippable parts:
   - **3a (done).** Retire the **last** hardcoded `type === …` / per-field
     `data.*` lists in the canonical apply-path data assembly —
     [`review.ts`](../../src/server/services/review.ts)'s `applyCreateEntity`, the
     update `buildEntityData`, and `currentEntityValue`/`getCurrentValue` —
     replaced by a registry-driven `data` builder (`buildKindData` /
     `normalizeKindFieldValue`) derived from the descriptors. As a side effect each
     entity now stores only its own kind's `data.*` fields.
   - **3b (done).** Added the display slot as a `<KindDisplay>` client dispatcher
     (`kind-display.tsx`) the server detail page renders — the lookup runs on the
     client, since a server component can't call a function exported from a
     `"use client"` module. Moved the entity-detail **ITEM display** (the `data.*`
     field rows + the AI-description blockquote) into `ItemDisplayPanel`, and the
     **ITEM form** (`ItemFields` + the `aiDescription` block) into the
     `kind-fields.tsx` companion, retiring the last `type === "ITEM"/"FLOOR"`
     branches in the form and detail page. Reference fields (ITEM's `itemTypeId` →
     ITEM_TYPE name) became a registry-driven `EntityKind.referenceFields` map so
     the page resolves display names without a `type === "X"` branch. A shared
     `FieldLockToggle` was extracted for reuse. The brand-new bespoke-type "proof"
     is deferred to **M7's BOX** (which then lands as a single descriptor file,
     confirming "one file, no scattered branches"), rather than inventing a stub
     type now.

## Consequences

- **One place per type.** A bespoke field is defined once; validation, dataKeys,
  patch entries, the reviewable/lockable set, the form, and the display all
  derive from the descriptor. Adding a type stops meaning "edit five files."
- **The reviewable-field set can't drift.** `dataFields` derived from the
  registry means a new `data.*` field is automatically routed through review and
  locking — removing a class of "field silently isn't reviewable" bugs.
- **`entityCoreSchema` is core again.** It validates only shared fields; type
  schemas validate only their own fields, so a write no longer carries the union
  of every type's attributes.
- **FLOOR's "special displays" get a home.** The detail page's per-type display
  becomes a registered slot instead of an inline branch — the original friction
  that prompted the question.
- **The data model is untouched.** Single-table + JSON + Crawler satellite +
  typed graph all stay; this is purely how the app layer is organized. No
  migration, no schema churn, no change to the review pipeline's contract.
- **Cost is front-loaded and small now.** With two bespoke types it's a contained
  refactor; deferred, it compounds with every type that copies the inline pattern.

### Deferred (explicitly out of scope)

- **New satellite tables (Faction/Floor).** Storage/indexing decision flagged in
  [`09-data-schema.md`](../09-data-schema.md), orthogonal to this code-org change.
  A satellite-backed type could still carry a descriptor for its form/display.
- **A runtime/DM-defined custom-type system.** This registry is code-defined
  (developer adds a descriptor file). DM-authored ad-hoc attributes stay in
  `customFields` as today.
- **CRAWLER storage changes.** The satellite path stays; CRAWLER adopting the
  descriptor's form/display slots is optional and not required here.
- **AI generator per-type field awareness.** The generators
  ([`flesh-entity.ts`](../../src/server/ai/generators/flesh-entity.ts),
  [`infer-relationships.ts`](../../src/server/ai/generators/infer-relationships.ts))
  could read `kind.dataSchema` to know a type's fields; worthwhile follow-up, not
  in scope for the org refactor.

## References

- [`01-domain-model.md`](../01-domain-model.md) — the hybrid entity model and the
  "first-class types add fields on top of a shared core" intent this preserves.
- [`09-data-schema.md`](../09-data-schema.md) — `Entity.data` as the type-specific
  store, the Zod-schemas-per-type note (this ADR realizes it), satellite-table
  guidance.
- [ADR 0005](./0005-campaign-current-floor.md), [ADR 0008](./0008-floor-model-unification-and-time-inference.md)
  — added the FLOOR `data.*` fields whose scattered plumbing motivates the
  registry.
- [`src/lib/validation.ts`](../../src/lib/validation.ts) — `entityCoreSchema`,
  `floorKeys` / `itemKeys` / `crawlerOnlyKeys` (the ad-hoc registry to consolidate).
- [`src/server/services/entities.ts`](../../src/server/services/entities.ts) —
  the create/update `data.*` patch builders.
- [`src/server/services/review.ts`](../../src/server/services/review.ts) — the
  `dataFields` reviewable-field set to derive.
- [`src/components/entities/entity-forms.tsx`](../../src/components/entities/entity-forms.tsx),
  [`src/app/(dm)/campaigns/[id]/entities/[entityId]/page.tsx`](../../src/app/(dm)/campaigns/[id]/entities/[entityId]/page.tsx)
  — the inline `type === …` branches the `FormFields` / `DisplayPanel` slots replace.
