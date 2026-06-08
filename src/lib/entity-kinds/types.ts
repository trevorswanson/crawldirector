import type { z } from "zod";

/**
 * Per-type descriptor for an entity type's bespoke `data.*` fields (ADR 0009).
 *
 * One descriptor per type is the single source of truth for that type's
 * type-specific fields: validation, the data-key lists, the reviewable/lockable
 * field set, and the create/update patch builders all derive from `dataSchema`
 * instead of scattering `type === "X"` branches across the codebase.
 *
 * Kept deliberately pure (Zod + TS only, no React): the descriptor is imported
 * by server-side validation/patch/review code, so it must not pull in client
 * components. The per-kind *form/display* rendering lives in a client companion
 * registry keyed by the same EntityType (src/components/entities/kind-fields.tsx).
 */
export interface EntityKind {
  /** The EntityType enum value this descriptor governs (e.g. "FLOOR"). */
  readonly type: string;
  /** The bespoke `data.*` fields for this type, as a Zod object schema. */
  readonly dataSchema: z.ZodObject<z.ZodRawShape>;
  /**
   * The normalized value stored when a bespoke field is empty/absent. Defaults
   * to `null` for any key not listed here; declare a field (e.g. a boolean flag)
   * whose empty value is something other than `null` — the patch builders read
   * this so an unset flag persists as `false`, not `null`. Optional.
   */
  readonly dataDefaults?: Readonly<Record<string, unknown>>;
  /**
   * Bespoke `data.*` fields that hold a reference to another entity (by id),
   * mapped to the EntityType they point at (e.g. ITEM's `itemTypeId` → an
   * `ITEM_TYPE` entity). The detail page resolves these to display names for the
   * read-view DisplayPanel, registry-driven so a new reference field needs no
   * `type === "X"` branch. Keyed by the bare field name (not the `data.` prefix).
   */
  readonly referenceFields?: Readonly<Record<string, string>>;
}
