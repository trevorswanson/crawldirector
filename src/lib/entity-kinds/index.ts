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
