import { z } from "zod";

// Shared Zod field-builder helpers. Extracted from validation.ts so the
// entity-kind descriptors (src/lib/entity-kinds, ADR 0009) can reuse the exact
// same field shapes without importing validation.ts (which would be circular —
// validation.ts derives its per-type keys from the descriptors).

/** Optional trimmed string, bounded length. Empty string is allowed/normalized. */
export const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === null ? undefined : value),
    z.string().trim().max(max).optional().or(z.literal("")),
  );

/** Optional whole number, coerced from form input, with a floor. */
export const optionalInt = (label: string, min = 0) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce
      .number()
      .refine((value) => Number.isFinite(value), `${label} must be a number.`)
      .int(`${label} must be a whole number.`)
      .min(min)
      .optional(),
  );
