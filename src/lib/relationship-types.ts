// Relationship-type metadata registry (docs/adr/0003).
//
// One descriptor per RelationshipType drives three UI concerns at once:
//   - grouping in the create form,
//   - applicability ranking (soft: suggests, never forbids — see
//     docs/01-domain-model.md "any-to-any"), and
//   - directional display labels (forward on the source's side, inverse on the
//     target's side, so `Carl OWNS_ITEM Ring` reads `Ring OWNED_BY Carl`).
//
// No schema change backs any of this: the inverse label is a display string, not
// a stored edge or enum value. This module is client-safe (it only depends on
// validation.ts, which only imports zod).

import { entityTypeValues, relationshipTypeValues } from "@/lib/validation";

export type RelationshipTypeValue = (typeof relationshipTypeValues)[number];
export type EntityTypeValue = (typeof entityTypeValues)[number];

export type RelationshipGroup =
  | "AFFILIATION"
  | "POWER"
  | "SOCIAL"
  | "SPATIAL"
  | "GAME"
  | "NARRATIVE";

export const relationshipGroupOrder: RelationshipGroup[] = [
  "AFFILIATION",
  "POWER",
  "SOCIAL",
  "SPATIAL",
  "GAME",
  "NARRATIVE",
];

export const relationshipGroupLabels: Record<RelationshipGroup, string> = {
  AFFILIATION: "Affiliation",
  POWER: "Power",
  SOCIAL: "Social",
  SPATIAL: "Spatial",
  GAME: "Game",
  NARRATIVE: "Narrative",
};

export type RelationshipTypeMeta = {
  group: RelationshipGroup;
  /** Phrase shown on the source's connections panel (lowercase). */
  forward: string;
  /** Phrase shown on the target's connections panel (lowercase). */
  inverse: string;
  /** When true, the edge reads the same both ways (inverse mirrors forward). */
  symmetric?: boolean;
  /** Typical source entity types. Empty = applicable to any. */
  sourceTypes: EntityTypeValue[];
  /** Typical target entity types. Empty = applicable to any. */
  targetTypes: EntityTypeValue[];
};

// `Record<RelationshipTypeValue, …>` makes this exhaustive: omitting or
// misspelling a type is a compile error, so adding an enum value forces a
// descriptor here.
export const relationshipTypeMeta: Record<
  RelationshipTypeValue,
  RelationshipTypeMeta
> = {
  // ── Affiliation ──
  MEMBER_OF: {
    group: "AFFILIATION",
    forward: "member of",
    inverse: "has member",
    sourceTypes: ["CRAWLER", "NPC", "PARTY"],
    targetTypes: ["PARTY", "GUILD", "FACTION", "ORGANIZATION"],
  },
  LEADS: {
    group: "AFFILIATION",
    forward: "leads",
    inverse: "led by",
    sourceTypes: ["CRAWLER", "NPC", "PARTY"],
    targetTypes: ["PARTY", "GUILD", "FACTION", "ORGANIZATION", "SHOW"],
  },
  SPONSORS: {
    group: "AFFILIATION",
    forward: "sponsors",
    inverse: "sponsored by",
    sourceTypes: ["SPONSOR", "FACTION", "ORGANIZATION"],
    targetTypes: ["CRAWLER", "PARTY", "GUILD", "SHOW", "FACTION"],
  },
  EMPLOYS: {
    group: "AFFILIATION",
    forward: "employs",
    inverse: "employed by",
    sourceTypes: ["FACTION", "ORGANIZATION", "SPONSOR", "NPC"],
    targetTypes: ["CRAWLER", "NPC"],
  },
  ALLIED_WITH: {
    group: "AFFILIATION",
    forward: "allied with",
    inverse: "allied with",
    symmetric: true,
    sourceTypes: ["PARTY", "GUILD", "FACTION", "ORGANIZATION"],
    targetTypes: ["PARTY", "GUILD", "FACTION", "ORGANIZATION"],
  },
  RIVAL_OF: {
    group: "AFFILIATION",
    forward: "rival of",
    inverse: "rival of",
    symmetric: true,
    sourceTypes: [],
    targetTypes: [],
  },
  AT_WAR_WITH: {
    group: "AFFILIATION",
    forward: "at war with",
    inverse: "at war with",
    symmetric: true,
    sourceTypes: ["PARTY", "GUILD", "FACTION", "ORGANIZATION"],
    targetTypes: ["PARTY", "GUILD", "FACTION", "ORGANIZATION"],
  },
  PARENT_ORG_OF: {
    group: "AFFILIATION",
    forward: "parent org of",
    inverse: "subsidiary of",
    sourceTypes: ["ORGANIZATION", "FACTION"],
    targetTypes: ["ORGANIZATION", "FACTION", "GUILD"],
  },

  // ── Power / manipulation ──
  USED_BY: {
    group: "POWER",
    forward: "used by",
    inverse: "uses",
    sourceTypes: ["SYSTEM_AI", "ITEM", "ORGANIZATION"],
    targetTypes: ["FACTION", "ORGANIZATION", "SPONSOR", "NPC"],
  },
  MANIPULATES: {
    group: "POWER",
    forward: "manipulates",
    inverse: "manipulated by",
    sourceTypes: ["SYSTEM_AI", "SPONSOR", "FACTION", "ORGANIZATION", "NPC"],
    targetTypes: [],
  },
  CONTROLS: {
    group: "POWER",
    forward: "controls",
    inverse: "controlled by",
    sourceTypes: ["SYSTEM_AI", "FACTION", "ORGANIZATION", "SPONSOR"],
    targetTypes: [],
  },
  DEFIES: {
    group: "POWER",
    forward: "defies",
    inverse: "defied by",
    sourceTypes: ["CRAWLER", "NPC", "FACTION", "PARTY", "GUILD"],
    targetTypes: ["SYSTEM_AI", "FACTION", "ORGANIZATION", "DEITY"],
  },

  // ── Social ──
  ALLY_OF: {
    group: "SOCIAL",
    forward: "ally of",
    inverse: "ally of",
    symmetric: true,
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["CRAWLER", "NPC"],
  },
  ENEMY_OF: {
    group: "SOCIAL",
    forward: "enemy of",
    inverse: "enemy of",
    symmetric: true,
    sourceTypes: ["CRAWLER", "NPC", "BOSS"],
    targetTypes: ["CRAWLER", "NPC", "BOSS"],
  },
  MENTOR_OF: {
    group: "SOCIAL",
    forward: "mentors",
    inverse: "mentored by",
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["CRAWLER", "NPC"],
  },
  MANAGES: {
    group: "SOCIAL",
    forward: "manages",
    inverse: "managed by",
    sourceTypes: ["NPC", "CRAWLER"],
    targetTypes: ["CRAWLER", "PARTY"],
  },
  LOVES: {
    group: "SOCIAL",
    forward: "loves",
    inverse: "loved by",
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["CRAWLER", "NPC"],
  },
  FAMILY_OF: {
    group: "SOCIAL",
    forward: "family of",
    inverse: "family of",
    symmetric: true,
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["CRAWLER", "NPC"],
  },
  OWES: {
    group: "SOCIAL",
    forward: "owes",
    inverse: "owed by",
    sourceTypes: ["CRAWLER", "NPC", "PARTY", "GUILD"],
    targetTypes: ["CRAWLER", "NPC", "FACTION", "ORGANIZATION", "SPONSOR"],
  },

  // ── Spatial / structural ──
  LOCATED_ON: {
    group: "SPATIAL",
    forward: "located on",
    inverse: "hosts",
    sourceTypes: ["LOCATION", "NEIGHBORHOOD", "BOSS", "NPC", "MOB_TYPE"],
    targetTypes: ["FLOOR"],
  },
  PART_OF: {
    group: "SPATIAL",
    forward: "part of",
    inverse: "contains",
    sourceTypes: ["LOCATION", "NEIGHBORHOOD"],
    targetTypes: ["NEIGHBORHOOD", "FLOOR"],
  },
  CONTAINS: {
    group: "SPATIAL",
    forward: "contains",
    inverse: "contained in",
    sourceTypes: ["FLOOR", "NEIGHBORHOOD", "LOCATION"],
    targetTypes: ["LOCATION", "NEIGHBORHOOD", "ITEM"],
  },
  BOSS_OF: {
    group: "SPATIAL",
    forward: "boss of",
    inverse: "has boss",
    sourceTypes: ["BOSS"],
    targetTypes: ["FLOOR"],
  },
  SPAWNS_ON: {
    group: "SPATIAL",
    forward: "spawns on",
    inverse: "spawn site for",
    sourceTypes: ["MOB_TYPE", "BOSS"],
    targetTypes: ["FLOOR", "LOCATION"],
  },

  // ── Game ──
  HAS_CLASS: {
    group: "GAME",
    forward: "has class",
    inverse: "class of",
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["CLASS"],
  },
  HAS_SPECIES: {
    group: "GAME",
    forward: "has species",
    inverse: "species of",
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["SPECIES"],
  },
  OWNS_ITEM: {
    group: "GAME",
    forward: "owns item",
    inverse: "owned by",
    sourceTypes: ["CRAWLER", "NPC", "PARTY"],
    targetTypes: ["ITEM"],
  },
  KNOWS_SKILL: {
    group: "GAME",
    forward: "knows skill",
    inverse: "known by",
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["SKILL", "SPELL"],
  },
  EARNED_ACHIEVEMENT: {
    group: "GAME",
    forward: "earned",
    inverse: "earned by",
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["ACHIEVEMENT"],
  },
  HOLDS_TITLE: {
    group: "GAME",
    forward: "holds title",
    inverse: "held by",
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["TITLE"],
  },
  APPEARS_ON: {
    group: "GAME",
    forward: "appears on",
    inverse: "features",
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["SHOW"],
  },

  // ── Narrative ──
  KNOWS_ABOUT: {
    group: "NARRATIVE",
    forward: "knows about",
    inverse: "known by",
    sourceTypes: [],
    targetTypes: [],
  },
  BETRAYED: {
    group: "NARRATIVE",
    forward: "betrayed",
    inverse: "betrayed by",
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: [
      "CRAWLER",
      "NPC",
      "FACTION",
      "ORGANIZATION",
      "PARTY",
      "GUILD",
    ],
  },
  KILLED: {
    group: "NARRATIVE",
    forward: "killed",
    inverse: "killed by",
    sourceTypes: ["CRAWLER", "NPC", "BOSS", "MOB_TYPE"],
    targetTypes: ["CRAWLER", "NPC"],
  },
  SAVED: {
    group: "NARRATIVE",
    forward: "saved",
    inverse: "saved by",
    sourceTypes: ["CRAWLER", "NPC"],
    targetTypes: ["CRAWLER", "NPC"],
  },
};

/**
 * The phrase to show for an edge from the perspective of the entity whose page
 * you're on. Outgoing (you are the source) → forward; incoming (you are the
 * target) → inverse. Lowercase; the panel uppercases for display.
 */
export function relationshipEdgeLabel(
  type: RelationshipTypeValue,
  direction: "out" | "in",
): string {
  const meta = relationshipTypeMeta[type];
  return direction === "in" ? meta.inverse : meta.forward;
}

/** Title-cased forward phrase, for the create-form type picker. */
export function relationshipOptionLabel(type: RelationshipTypeValue): string {
  return relationshipTypeMeta[type].forward
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Pairings actively steered *out* of the create UI (ADR 0008 §3). A crawler's
 * floor is `Crawler.currentFloor` (resolved to its FLOOR entity), not a second
 * `LOCATED_ON` edge — so we stop offering crawler→FLOOR `LOCATED_ON` entirely
 * (not even under "Show all"), retiring the duplicate path. This is UI/suggestion
 * suppression only: the DB stays any-to-any (invariant #7), and a direct service
 * call can still create the edge for non-crawler spatial uses (a BOSS/LOCATION on
 * a floor still suggests `LOCATED_ON`).
 */
export function isDiscouragedRelationship(
  type: RelationshipTypeValue,
  sourceType: EntityTypeValue,
  targetType: EntityTypeValue,
): boolean {
  return (
    type === "LOCATED_ON" && sourceType === "CRAWLER" && targetType === "FLOOR"
  );
}

/**
 * Soft applicability: is `type` a sensible edge from `sourceType` to
 * `targetType`? An empty source/target list means "any". This only ranks the
 * picker — it never gates submission (docs/01-domain-model.md: any-to-any).
 */
export function isSuggestedRelationship(
  type: RelationshipTypeValue,
  sourceType: EntityTypeValue,
  targetType: EntityTypeValue,
): boolean {
  const meta = relationshipTypeMeta[type];
  const sourceOk =
    meta.sourceTypes.length === 0 || meta.sourceTypes.includes(sourceType);
  const targetOk =
    meta.targetTypes.length === 0 || meta.targetTypes.includes(targetType);
  return sourceOk && targetOk;
}

/**
 * How specifically a suggested type fits the pairing: +1 for each endpoint the
 * type names explicitly (vs. an "any" wildcard). So `OWNS_ITEM` (CRAWLER→ITEM,
 * score 2) outranks `RIVAL_OF` (any→any, score 0), which keeps the wildcard
 * "applies to everything" types from dominating every pairing's default.
 */
function relationshipSpecificity(
  type: RelationshipTypeValue,
  sourceType: EntityTypeValue,
  targetType: EntityTypeValue,
): number {
  const meta = relationshipTypeMeta[type];
  let score = 0;
  if (meta.sourceTypes.length > 0 && meta.sourceTypes.includes(sourceType)) {
    score += 1;
  }
  if (meta.targetTypes.length > 0 && meta.targetTypes.includes(targetType)) {
    score += 1;
  }
  return score;
}

/** Suggested types for a pairing, most specific first (enum order breaks ties). */
function rankedSuggestedTypes(
  sourceType: EntityTypeValue,
  targetType: EntityTypeValue,
): RelationshipTypeValue[] {
  return relationshipTypeValues
    .filter(
      (type) =>
        isSuggestedRelationship(type, sourceType, targetType) &&
        !isDiscouragedRelationship(type, sourceType, targetType),
    )
    .map((type, index) => ({
      type,
      index,
      score: relationshipSpecificity(type, sourceType, targetType),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.type);
}

export type RelationshipOptionCategory = {
  group: RelationshipGroup;
  label: string;
  types: RelationshipTypeValue[];
};

export type RelationshipPickerOptions = {
  /** Applicable types, surfaced first with a sensible default. */
  suggested: RelationshipTypeValue[];
  /** Everything else, grouped by category (suggested excluded to avoid dupes). */
  categories: RelationshipOptionCategory[];
};

/**
 * Build the grouped option model for the type picker given a chosen pairing.
 * Suggested types float to a leading group; the rest stay reachable under their
 * category. Nothing is hidden.
 */
export function relationshipPickerOptions(
  sourceType: EntityTypeValue,
  targetType: EntityTypeValue,
): RelationshipPickerOptions {
  const suggested = rankedSuggestedTypes(sourceType, targetType);
  const suggestedSet = new Set<RelationshipTypeValue>(suggested);

  const categories: RelationshipOptionCategory[] = [];
  for (const group of relationshipGroupOrder) {
    const types = relationshipTypeValues.filter(
      (type) =>
        relationshipTypeMeta[type].group === group &&
        !suggestedSet.has(type) &&
        !isDiscouragedRelationship(type, sourceType, targetType),
    );
    if (types.length > 0) {
      categories.push({ group, label: relationshipGroupLabels[group], types });
    }
  }

  return { suggested, categories };
}

/**
 * The default type to preselect for a pairing: the most specific suggested type,
 * falling back to ALLY_OF when nothing is applicable.
 */
export function defaultRelationshipType(
  sourceType: EntityTypeValue,
  targetType: EntityTypeValue,
): RelationshipTypeValue {
  return rankedSuggestedTypes(sourceType, targetType)[0] ?? "ALLY_OF";
}
