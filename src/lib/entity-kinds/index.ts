import { z } from "zod";

import { FLOOR_KIND, floorDataSchema } from "./floor";
import { ITEM_KIND, itemDataSchema } from "./item";
import type { EntityKind } from "./types";

export type { EntityKind } from "./types";

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
};

/** The descriptor for a type, or undefined if the type has no bespoke fields. */
export function kindFor(type: string): EntityKind | undefined {
  return KINDS[type];
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
  return { ...itemDataSchema.shape, ...floorDataSchema.shape };
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
  for (const key of Object.keys(kind.dataSchema.shape)) {
    out[key] = normalizeKindFieldValue(key, read(key));
  }
  return out;
}
