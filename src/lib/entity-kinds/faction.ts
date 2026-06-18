import { z } from "zod";

import { optionalInt, optionalText } from "@/lib/zod-field-helpers";

import type { EntityKind } from "./types";

/**
 * FACTION-entity bespoke fields (ADR 0011 Part C). Unlike FLOOR/ITEM, these are
 * stored in the 1:1 `Faction` satellite table, not the `Entity.data` JSON blob —
 * `standing`/`strength` are indexed so M9 faction queries and M12 faction-power
 * rollups can sort/aggregate them at scale. They are still ordinary
 * registry-declared canon, addressed by the same reviewable/lockable
 * `data.<field>` patch keys; the `satellite` marker only redirects their physical
 * home (see `EntityKind.satellite`).
 *
 * standing — the faction's reputation/influence score; strength — its raw power
 * rating (both whole, non-negative); allegiance — a short who-they-serve label;
 * resources — free-text notes on the assets they command.
 */
export const factionDataSchema = z.object({
  standing: optionalInt("Standing"),
  strength: optionalInt("Strength"),
  allegiance: optionalText(160),
  resources: optionalText(2000),
});

export const FACTION_KIND: EntityKind = {
  type: "FACTION",
  dataSchema: factionDataSchema,
  // v1: original shape. Bumping this requires a `migrations[0]` (ADR 0011).
  schemaVersion: 1,
  // All four fields live in the Faction satellite table (keyed by Entity.id);
  // none are persisted to Entity.data. See model Faction in prisma/schema.prisma.
  satellite: {
    relation: "faction",
    fields: ["standing", "strength", "allegiance", "resources"],
  },
};
