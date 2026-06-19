import { z } from "zod";

import { FACTION_KIND, factionDataSchema } from "./faction";
import { FLOOR_KIND, floorDataSchema } from "./floor";
import { ITEM_KIND, itemDataSchema } from "./item";
import type { DataMigration, EntityKind } from "./types";

export type { DataMigration, EntityKind } from "./types";

/**
 * Reserved bespoke-`data` key holding a row's schema version (ADR 0011). It is
 * metadata, not canon: `buildKindData` stamps it, `readKindData` reads then strips
 * it, no descriptor may declare a field by this name (asserted below), and the
 * read-view "additional data" panel hides it. Kept short to stay out of the way of
 * real fields and to read clearly in stored JSON.
 */
export const RESERVED_DATA_KEY = "_v";

/**
 * Registry of per-type entity-kind descriptors, keyed by EntityType (ADR 0009).
 *
 * A type with no bespoke `data.*` fields simply has no entry — the generic core
 * path serves it. New bespoke type = one new descriptor file registered here,
 * instead of a `type === "X"` branch added across validation / patch builders /
 * review / form. CRAWLER keeps its satellite-table path and is not a kind entry.
 *
 * Insertion order is the order data keys appear in the derived key lists
 * (`allKindDataKeys`); ITEM precedes FLOOR to match the historical `dataKeys`
 * order (ITEM fields were registered first, then FLOOR).
 */
const KINDS: Record<string, EntityKind> = {
  ITEM: ITEM_KIND,
  FLOOR: FLOOR_KIND,
  FACTION: FACTION_KIND,
};

/** The descriptor's current schema version (ADR 0011); defaults to 1. */
function schemaVersionOf(kind: EntityKind): number {
  return kind.schemaVersion ?? 1;
}

/**
 * Assert a descriptor's versioning invariants (ADR 0011): the migration count
 * must match the version bump (so a bump can't forget its migration), and no
 * descriptor may shadow the reserved `_v` key. Thrown at module load over the
 * whole registry — a malformed descriptor fails fast at import, everywhere.
 */
export function assertKindInvariants(kind: EntityKind): void {
  const version = schemaVersionOf(kind);
  const migrationCount = kind.migrations?.length ?? 0;
  if (migrationCount + 1 !== version) {
    throw new Error(
      `EntityKind ${kind.type}: schemaVersion ${version} requires ` +
        `${version - 1} migration(s), found ${migrationCount}.`,
    );
  }
  if (RESERVED_DATA_KEY in kind.dataSchema.shape) {
    throw new Error(
      `EntityKind ${kind.type}: "${RESERVED_DATA_KEY}" is a reserved data key.`,
    );
  }
  // A satellite-backed field must be one the descriptor actually declares (ADR
  // 0011 Part C) — otherwise the write path would route a phantom key to the
  // satellite and the read merge would never produce it.
  for (const field of kind.satellite?.fields ?? []) {
    if (!(field in kind.dataSchema.shape)) {
      throw new Error(
        `EntityKind ${kind.type}: satellite field "${field}" is not in dataSchema.`,
      );
    }
  }
}

for (const kind of Object.values(KINDS)) assertKindInvariants(kind);

/** The descriptor for a type, or undefined if the type has no bespoke fields. */
export function kindFor(type: string): EntityKind | undefined {
  return KINDS[type];
}

/** Every EntityType that has a versioned bespoke-data descriptor. */
export function kindTypes(): string[] {
  return Object.keys(KINDS);
}

/** A type's current bespoke-`data` schema version (1 for a type with no kind). */
export function schemaVersionFor(type: string): number {
  const kind = kindFor(type);
  return kind ? schemaVersionOf(kind) : 1;
}

/** The bespoke `data.*` field keys for a type (empty for a type with no kind). */
export function dataKeysFor(type: string): string[] {
  const kind = kindFor(type);
  return kind ? Object.keys(kind.dataSchema.shape) : [];
}

/** Every bespoke `data.*` field key across all registered kinds. */
export function allKindDataKeys(): string[] {
  return Object.values(KINDS).flatMap((kind) =>
    Object.keys(kind.dataSchema.shape),
  );
}

/**
 * The merged Zod shape of every registered kind's bespoke `data.*` fields, for
 * the create/update write schemas. Static schemas can't know the entity type at
 * parse time, so the write schema accepts the union of all kinds' fields; the
 * patch builders persist only `dataKeysFor(type)`, so off-type fields are
 * validated-then-ignored (the existing behavior). entityCoreSchema stays
 * genuinely core (ADR 0009 slice 2).
 *
 * The concrete descriptor shapes are spread explicitly (rather than iterated
 * over the type-erased registry) so the inferred input types keep each field's
 * precise type. A new kind adds its `...<kind>DataSchema.shape` here.
 */
export function allKindDataShape() {
  return {
    ...itemDataSchema.shape,
    ...floorDataSchema.shape,
    ...factionDataSchema.shape,
  };
}

/**
 * The bespoke `data.*` field keys a type stores in a 1:1 satellite table rather
 * than the `Entity.data` JSON blob (ADR 0011 Part C). Empty for a type with no
 * satellite. The write path keeps these out of `Entity.data` and routes them to
 * the satellite; `readKindData` merges the satellite row back over the blob.
 */
export function satelliteFieldsFor(type: string): string[] {
  return [...(kindFor(type)?.satellite?.fields ?? [])];
}

/** Every satellite-backed `data.*` field key across all registered kinds. */
export function allSatelliteDataKeys(): string[] {
  return Object.values(KINDS).flatMap((kind) => [
    ...(kind.satellite?.fields ?? []),
  ]);
}

/**
 * The 1:1 satellite row for a loaded entity, picked by its type's descriptor
 * `satellite.relation` (ADR 0011 Part C) — so a generic reader can hand the right
 * satellite to `readKindData` without a `type === "FACTION" | "FLOOR"` switch (a
 * new satellite type needs no new branch). Returns `undefined` for a type with no
 * satellite, or when the relation was not loaded on the row. The caller must have
 * `include`/`select`ed the relation (e.g. `floor: true`).
 */
export function satelliteRowOf(type: string, entity: unknown): unknown {
  const relation = kindFor(type)?.satellite?.relation;
  if (!relation || !entity || typeof entity !== "object") return undefined;
  return (entity as Record<string, unknown>)[relation];
}

/**
 * The normalized "empty" value for each of a type's bespoke `data.*` fields the
 * descriptor declares a non-null default for (e.g. boolean flags → `false`). The
 * patch builders fall back to `null` for any key not present here, so a type with
 * no kind (or no declared defaults) just yields `null` everywhere.
 */
export function kindDataDefaults(type: string): Readonly<Record<string, unknown>> {
  return kindFor(type)?.dataDefaults ?? {};
}

// --- Canonical `data.*` value normalization (ADR 0009 slice 3) ---------------
//
// The review service composes the stored `Entity.data` JSON from a change-set
// patch on three paths (create, update, and reading the current value back). All
// three used a hand-maintained `type === "X"` / `data.itemTypeId | data.divine |
// …` switch that had to stay in lockstep with the schemas. These derive that
// normalization from the descriptors instead, so a new bespoke field is composed
// (and read back) automatically and can't drift.

type DataValueType = "string" | "number" | "boolean";

// The primitive a bespoke field persists as, read from its Zod schema (so a new
// field needs no extra wiring). optionalText → string, optionalInt → number,
// optionalFlag → boolean; the `.nullable()` wrappers surface as an anyOf union we
// walk past to the first concrete primitive. Anything unrecognized → string (the
// nullableString path), matching the historical default for text fields.
function fieldValueType(schema: z.ZodType): DataValueType {
  const find = (node: unknown): DataValueType | undefined => {
    if (!node || typeof node !== "object") return undefined;
    const rec = node as Record<string, unknown>;
    if (rec.type === "string") return "string";
    if (rec.type === "integer" || rec.type === "number") return "number";
    if (rec.type === "boolean") return "boolean";
    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
      const branch = rec[key];
      if (Array.isArray(branch)) {
        for (const sub of branch) {
          const found = find(sub);
          if (found) return found;
        }
      }
    }
    return undefined;
  };
  try {
    return find(z.toJSONSchema(schema, { unrepresentable: "any" })) ?? "string";
  } catch {
    return "string";
  }
}

interface KindFieldMeta {
  /** Which kind (EntityType) owns this field — gates create/update by type. */
  readonly type: string;
  /** The primitive the field persists as. */
  readonly valueType: DataValueType;
  /** The value stored when the field is empty/absent (booleans → false, else null). */
  readonly empty: unknown;
}

// Per-field metadata for every registered bespoke field, keyed globally by the
// field name (names are unique across kinds). Built once at module load.
const FIELD_META: ReadonlyMap<string, KindFieldMeta> = new Map(
  Object.entries(KINDS).flatMap(([type, kind]) =>
    Object.entries(kind.dataSchema.shape).map(([key, schema]) => {
      const valueType = fieldValueType(schema as z.ZodType);
      const empty = kind.dataDefaults?.[key] ?? null;
      return [key, { type, valueType, empty }] as const;
    }),
  ),
);

// Coerce a raw patch/stored value to the primitive the field persists as,
// falling back to its empty default when the value is absent or the wrong type.
// Mirrors the prior nullableString / optionalNumber / booleanWithDefault(false)
// handling, now derived from the descriptor.
function normalizeForMeta(meta: KindFieldMeta, raw: unknown): unknown {
  switch (meta.valueType) {
    case "boolean":
      return typeof raw === "boolean" ? raw : meta.empty;
    case "number":
      return typeof raw === "number" ? raw : meta.empty;
    case "string":
      return typeof raw === "string" && raw.length > 0 ? raw : meta.empty;
  }
}

/**
 * Normalize one bespoke `data.*` field by its key (e.g. `"divine"`), looked up
 * globally across all kinds. Returns `null` for a key no kind declares, so a
 * non-kind field is a harmless null. Used by the review service's update-merge
 * and current-value paths, which key off the field name rather than the type.
 */
export function normalizeKindFieldValue(key: string, raw: unknown): unknown {
  const meta = FIELD_META.get(key);
  if (!meta) return null;
  return normalizeForMeta(meta, raw);
}

/**
 * Build the full bespoke `data` object for an entity of `type` on the create
 * path: every field the type's descriptor declares, normalized from `read` (a
 * patch reader), defaulting to the field's empty value when absent. A type with
 * no kind yields `{}`. Replaces the create path's `type === "X"` data switch —
 * each entity now stores only its own kind's fields (a non-ITEM entity no longer
 * carries spurious ITEM `data.*` keys; reads already default missing fields).
 */
export function buildKindData(
  type: string,
  read: (key: string) => unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const kind = kindFor(type);
  if (!kind) return out;
  // Satellite-backed fields (ADR 0011 Part C) live in a 1:1 table, not this JSON
  // blob — the apply path writes them there. Everything else composes into data.
  const satellite = new Set(kind.satellite?.fields ?? []);
  for (const key of Object.keys(kind.dataSchema.shape)) {
    if (satellite.has(key)) continue;
    out[key] = normalizeKindFieldValue(key, read(key));
  }
  // Stamp the schema version (ADR 0011) so a later bump can find + migrate this
  // row. A type with no kind has no bespoke fields to version, so it gets no stamp.
  out[RESERVED_DATA_KEY] = schemaVersionOf(kind);
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function storedSchemaVersion(raw: unknown): number {
  const record = asRecord(raw);
  return typeof record[RESERVED_DATA_KEY] === "number"
    ? (record[RESERVED_DATA_KEY] as number)
    : 1;
}

/** Whether a stored row's stamped data version is behind its descriptor. */
export function isKindDataStale(type: string, raw: unknown): boolean {
  const kind = kindFor(type);
  return !!kind && storedSchemaVersion(raw) < schemaVersionOf(kind);
}

/**
 * Chain a descriptor's pure migrations to upgrade a `data` record from one schema
 * version up to another (ADR 0011). `migrations[i]` upgrades version `i + 1` to
 * `i + 2`, so going `fromVersion → toVersion` applies `migrations[fromVersion - 1
 * … toVersion - 2]` in order. A no-op when already at/above `toVersion`. Each step
 * is coerced back to a record so a malformed step can't break the chain.
 */
export function applyDataMigrations(
  record: Record<string, unknown>,
  migrations: readonly DataMigration[],
  fromVersion: number,
  toVersion: number,
): Record<string, unknown> {
  let migrated = record;
  for (let version = fromVersion; version < toVersion; version += 1) {
    const step = migrations[version - 1];
    if (step) migrated = asRecord(step(migrated));
  }
  return migrated;
}

/**
 * Validate-and-upgrade read seam for a stored bespoke `data` blob (ADR 0011).
 * This is the single place an `Entity.data` blob is read back into its canonical
 * per-kind shape: it reads the stamped `data._v` (absent/legacy → 1, since all
 * pre-versioning rows already match the v1 shapes), chains each `migrations[k]`
 * from that version up to the descriptor's `schemaVersion`, then returns every
 * declared field normalized to its canonical empty default — with the reserved
 * `_v` and any stale/off-schema keys dropped.
 *
 * Migrations run *before* the per-field normalize, so a retype/rename upgrade
 * carries the old value across explicitly; the normalize is then only last-resort
 * coercion for genuinely-corrupt data, never the silent data-dropping read it
 * replaced. A type with no kind has no versioned fields → `{}` (its free-form
 * `data` is surfaced by the generic "additional data" path, not this seam).
 *
 * `satellite` is the optional 1:1 satellite row for types with satellite-backed
 * fields (ADR 0011 Part C). Its columns are the canonical home for those fields,
 * so they are merged over the JSON blob before migration/normalize — a caller
 * that doesn't pass it (FLOOR/ITEM, or a FACTION loaded without the relation)
 * simply reads those fields as their empty defaults.
 */
export function readKindData(
  type: string,
  raw: unknown,
  satellite?: unknown,
): Record<string, unknown> {
  const kind = kindFor(type);
  if (!kind) return {};

  const record = { ...asRecord(raw) };
  if (satellite && kind.satellite) {
    const satelliteRow = asRecord(satellite);
    for (const key of kind.satellite.fields) record[key] = satelliteRow[key];
  }
  const storedVersion = storedSchemaVersion(record);
  const migrated = applyDataMigrations(
    record,
    kind.migrations ?? [],
    storedVersion,
    schemaVersionOf(kind),
  );

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(kind.dataSchema.shape)) {
    out[key] = normalizeKindFieldValue(key, migrated[key]);
  }
  return out;
}

/**
 * Run migrations on a raw bespoke data object if its kind is versioned (ADR 0011).
 * Returns the migrated object (retaining reserved fields and off-schema keys), or
 * the original object if the type has no kind.
 */
export function migrateKindData(
  type: string,
  raw: unknown,
): Record<string, unknown> {
  const kind = kindFor(type);
  if (!kind) return { ...asRecord(raw) };

  const record = { ...asRecord(raw) };
  const storedVersion = storedSchemaVersion(record);

  return applyDataMigrations(
    record,
    kind.migrations ?? [],
    storedVersion,
    schemaVersionOf(kind),
  );
}
