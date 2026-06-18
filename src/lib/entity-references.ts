import { kindFor, kindTypes, readKindData } from "@/lib/entity-kinds";

/**
 * Reference integrity for `referenceFields` (ADR 0011 Part B).
 *
 * A bespoke `data.*` reference field holds the id of another entity (a *soft FK*
 * resolved at display time — invariant #7 keeps relationships any-to-any, and
 * these `data` references are deliberately not DB foreign keys). The pure helpers
 * here enumerate the references an entity declares and, in reverse, which fields
 * across the registry point at a given type — the service layer
 * (`src/server/services/references.ts`) resolves them against live canon.
 */

/** A single outgoing reference an entity declares via a bespoke `data.*` field. */
export interface EntityReference {
  /** The bare descriptor field name, e.g. `"itemTypeId"`. */
  readonly field: string;
  /** The review-patch / display key, e.g. `"data.itemTypeId"`. */
  readonly patchKey: string;
  /** The EntityType the reference points at, e.g. `"ITEM_TYPE"`. */
  readonly targetType: string;
  /** The stored id of the referenced entity. */
  readonly targetId: string;
}

/**
 * The set (non-empty) outgoing references an entity declares, read through the
 * versioned `readKindData` seam so a migrated row resolves on its upgraded shape.
 * A type with no `referenceFields` (or with the field unset) yields `[]`.
 */
export function entityReferences(type: string, data: unknown): EntityReference[] {
  const kind = kindFor(type);
  if (!kind?.referenceFields) return [];
  const read = readKindData(type, data);
  const out: EntityReference[] = [];
  for (const [field, targetType] of Object.entries(kind.referenceFields)) {
    const value = read[field];
    if (typeof value === "string" && value.length > 0) {
      out.push({ field, patchKey: `data.${field}`, targetType, targetId: value });
    }
  }
  return out;
}

/** A registry reference field that points at a given target type. */
export interface ReverseReferenceField {
  /** The EntityType that owns the referring field, e.g. `"ITEM"`. */
  readonly type: string;
  /** The bare field name on that type, e.g. `"itemTypeId"`. */
  readonly field: string;
}

/**
 * Every `referenceFields` entry across the registry whose target is `targetType`
 * — the reverse-lookup set for "what references an entity of this type?" (the
 * impact-aware archive blast radius). `ITEM_TYPE` → `[{ type: "ITEM", field:
 * "itemTypeId" }]`; a type nothing references → `[]`.
 */
export function reverseReferenceFields(targetType: string): ReverseReferenceField[] {
  const out: ReverseReferenceField[] = [];
  for (const type of kindTypes()) {
    const refs = kindFor(type)?.referenceFields;
    if (!refs) continue;
    for (const [field, refTarget] of Object.entries(refs)) {
      if (refTarget === targetType) out.push({ type, field });
    }
  }
  return out;
}
