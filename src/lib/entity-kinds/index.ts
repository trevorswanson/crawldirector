import { FLOOR_KIND } from "./floor";
import type { EntityKind } from "./types";

export type { EntityKind } from "./types";

/**
 * Registry of per-type entity-kind descriptors, keyed by EntityType (ADR 0009).
 *
 * A type with no bespoke `data.*` fields simply has no entry — the generic core
 * path serves it. New bespoke type = one new descriptor file registered here,
 * instead of a `type === "X"` branch added across validation / patch builders /
 * review / form. CRAWLER keeps its satellite-table path and is not a kind entry.
 */
const KINDS: Record<string, EntityKind> = {
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
