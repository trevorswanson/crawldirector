import { z } from "zod";

import { optionalText } from "@/lib/zod-field-helpers";

import type { EntityKind } from "./types";

// Optional boolean flag from form input. Empty/absent/null → undefined (the key
// stays optional in the input type); the patch builders normalize an unset flag
// to the descriptor's `false` default (matching the prior `?? false` handling).
const optionalFlag = z.preprocess(
  (value) =>
    value === undefined || value === null || value === ""
      ? undefined
      : value === "true" || value === true || value === "on",
  z.boolean().optional(),
);

/**
 * ITEM-entity bespoke fields, stored in Entity.data (ADR 0009).
 *
 * itemTypeId links an ITEM to its ITEM_TYPE entity (an any-to-any reference kept
 * in data, not a relationship edge); divine/unique/fleeting are DCC item flags;
 * aiDescription is the official system commentary / flavour text the entity
 * detail page composes with the flags.
 */
export const itemDataSchema = z.object({
  itemTypeId: optionalText(100).nullable(),
  divine: optionalFlag,
  unique: optionalFlag,
  fleeting: optionalFlag,
  aiDescription: optionalText(10000).nullable(),
});

export const ITEM_KIND: EntityKind = {
  type: "ITEM",
  dataSchema: itemDataSchema,
  // The flags persist as a concrete `false` when unchecked/absent (the rest of
  // the fields default to null).
  dataDefaults: { divine: false, unique: false, fleeting: false },
  // itemTypeId references an ITEM_TYPE entity; the detail page resolves it to a
  // display name for the read-view panel.
  referenceFields: { itemTypeId: "ITEM_TYPE" },
};
