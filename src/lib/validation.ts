import { z } from "zod";

import { allKindDataKeys, allKindDataShape, dataKeysFor } from "@/lib/entity-kinds";
import { optionalInt, optionalText } from "@/lib/zod-field-helpers";

// Shared Zod schemas. Per docs/02-architecture.md every Server Action validates
// its input at the boundary with one of these.

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.email("Enter a valid email").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Crawl name is required").max(120),
  summary: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const entityTypeValues = [
  "CRAWLER",
  "NPC",
  "SPECIES",
  "CLASS",
  "PARTY",
  "GUILD",
  "FLOOR",
  "NEIGHBORHOOD",
  "LOCATION",
  "BOSS",
  "MOB_TYPE",
  "FACTION",
  "ORGANIZATION",
  "SPONSOR",
  "SHOW",
  "SYSTEM_AI",
  "ITEM",
  "ITEM_TYPE",
  "SKILL",
  "SPELL",
  "ACHIEVEMENT",
  "TITLE",
  "SYSTEM_MESSAGE",
  "DEITY",
] as const;

export const genericEntityTypeValues = [
  "NPC",
  "SPECIES",
  "CLASS",
  "PARTY",
  "GUILD",
  "FLOOR",
  "NEIGHBORHOOD",
  "LOCATION",
  "BOSS",
  "MOB_TYPE",
  "FACTION",
  "ORGANIZATION",
  "SPONSOR",
  "SHOW",
  "SYSTEM_AI",
  "ITEM",
  "ITEM_TYPE",
  "SKILL",
  "SPELL",
  "ACHIEVEMENT",
  "TITLE",
  "SYSTEM_MESSAGE",
  "DEITY",
] as const;

export const visibilityValues = ["DM_ONLY", "PLAYER_VISIBLE"] as const;

// optionalText / optionalInt moved to src/lib/zod-field-helpers.ts so the
// entity-kind descriptors can reuse them without a circular import.

const postgresBigIntMax = BigInt("9223372036854775807");

const optionalBigInt = (label: string) =>
  z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) {
        return undefined;
      }
      if (typeof value === "bigint") return value;
      if (typeof value === "number" && Number.isSafeInteger(value)) {
        return BigInt(value);
      }
      if (typeof value === "string" && /^\d+$/.test(value.trim())) {
        return BigInt(value.trim());
      }
      return value;
    },
    z
      .bigint()
      .min(BigInt(0), `${label} cannot be negative.`)
      .max(postgresBigIntMax, `${label} is too large.`)
      .optional(),
  );

const tagsSchema = z
  .preprocess(
    (value) => (value === null ? undefined : value),
    z.union([
      z.array(z.string()),
      z.string().trim().max(1000).optional().or(z.literal("")),
    ]),
  )
  .transform((value) => {
    const tags = Array.isArray(value) ? value : (value ?? "").split(",");
    return tags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);
  });

// Genuinely shared entity fields (ADR 0009 slice 2). Bespoke per-type `data.*`
// fields (FLOOR, ITEM, …) live in their entity-kind descriptors and are spread
// into the create/update *write* schemas via allKindDataShape() — not into the
// core schema, so this validates only fields every entity has.
const entityCoreSchema = z.object({
  name: z.string().trim().min(1, "Entity name is required").max(160),
  summary: optionalText(500),
  description: optionalText(10000),
  visibility: z.enum(visibilityValues).default("DM_ONLY"),
  tags: tagsSchema,
  isStub: z.boolean().optional(),
});

// The bespoke `data.*` fields of every registered kind, for the write schemas.
// A static schema can't know the entity type at parse time, so the write schema
// accepts the union of all kinds' fields; the patch builders persist only the
// fields belonging to the actual type (dataKeysFor), so off-type fields are
// validated-then-ignored — exactly the prior behavior, just derived from the
// registry instead of flattened into entityCoreSchema.
export const createGenericEntitySchema = entityCoreSchema.extend({
  ...allKindDataShape(),
  type: z.enum(genericEntityTypeValues),
});
export type CreateGenericEntityInput = z.infer<
  typeof createGenericEntitySchema
>;

export const createCrawlerSchema = entityCoreSchema.extend({
  realName: optionalText(160),
  crawlerNo: optionalText(80),
  level: optionalInt("Level", 1).default(1),
  hp: optionalInt("HP"),
  mp: optionalInt("MP"),
  gold: optionalInt("Gold").default(0),
  viewCount: optionalBigInt("View count").default(BigInt(0)),
  followerCount: optionalBigInt("Follower count").default(BigInt(0)),
  favoriteCount: optionalBigInt("Favorite count").default(BigInt(0)),
  killCount: optionalInt("Kill count").default(0),
  currentFloor: optionalInt("Current floor", 1),
  isAlive: z
    .preprocess((value) => value !== "false", z.boolean())
    .default(true),
});
export type CreateCrawlerInput = z.infer<typeof createCrawlerSchema>;

export const updateEntitySchema = entityCoreSchema.extend({
  ...allKindDataShape(),
  type: z.enum(entityTypeValues),
  realName: optionalText(160),
  crawlerNo: optionalText(80),
  level: optionalInt("Level", 1),
  hp: optionalInt("HP"),
  mp: optionalInt("MP"),
  gold: optionalInt("Gold"),
  viewCount: optionalBigInt("View count"),
  followerCount: optionalBigInt("Follower count"),
  favoriteCount: optionalBigInt("Favorite count"),
  killCount: optionalInt("Kill count"),
  currentFloor: optionalInt("Current floor", 1),
  isAlive: z.preprocess((value) => value !== "false", z.boolean()).optional(),
});
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;

// Canon-lock targets. These keys match the patch field names the review service
// uses (see src/server/services/review.ts) so a locked field name lines up with
// the field a proposal would touch. Core entity fields are exposed in the lock
// UI; crawler.* fields are valid lock targets too (covered when the whole
// entity is locked).
export const lockableEntityFields = [
  "name",
  "summary",
  "description",
  "visibility",
  "tags",
] as const;

export const crawlerOnlyKeys = Object.keys(createCrawlerSchema.shape).filter(
  (k) => !Object.keys(entityCoreSchema.shape).includes(k)
);

// Per-type bespoke `data.*` key lists, derived from the entity-kind descriptors
// (ADR 0009) so they can no longer drift from the schemas.
export const itemKeys = dataKeysFor("ITEM");
export const floorKeys = dataKeysFor("FLOOR");

// Keys persisted into Entity.data (type-specific attributes), used by the lock
// validator and the data.* patch builders in src/server/services/entities.ts.
// Derived from the union of every registered kind's fields.
export const dataKeys = allKindDataKeys();

export const lockableFields = [
  ...lockableEntityFields,
  ...crawlerOnlyKeys.map((k) => `crawler.${k}`),
  ...dataKeys.map((k) => `data.${k}`),
];

// A single lockable field key, validated where a per-field lock toggle posts it.
export const lockFieldSchema = z.string().refine((field) => {
  if ((lockableEntityFields as readonly string[]).includes(field)) return true;
  if (field.startsWith("crawler.")) {
    const sub = field.substring(8);
    return crawlerOnlyKeys.includes(sub);
  }
  if (field.startsWith("data.")) {
    const sub = field.substring(5);
    return dataKeys.includes(sub);
  }
  return false;
});

// Typed relationship edges (docs/01-domain-model.md). Any-to-any: the type is a
// semantic label, not a structural constraint, so every value is valid between
// any two entities. UI surfaces sensible defaults/warnings, never hard rules.
export const relationshipTypeValues = [
  "MEMBER_OF",
  "LEADS",
  "SPONSORS",
  "EMPLOYS",
  "ALLIED_WITH",
  "RIVAL_OF",
  "AT_WAR_WITH",
  "PARENT_ORG_OF",
  "USED_BY",
  "MANIPULATES",
  "CONTROLS",
  "DEFIES",
  "ALLY_OF",
  "ENEMY_OF",
  "MENTOR_OF",
  "MANAGES",
  "LOVES",
  "FAMILY_OF",
  "OWES",
  "LOCATED_ON",
  "PART_OF",
  "CONTAINS",
  "BOSS_OF",
  "SPAWNS_ON",
  "HAS_CLASS",
  "HAS_SPECIES",
  "OWNS_ITEM",
  "KNOWS_SKILL",
  "EARNED_ACHIEVEMENT",
  "HOLDS_TITLE",
  "APPEARS_ON",
  "KNOWS_ABOUT",
  "BETRAYED",
  "KILLED",
  "SAVED",
] as const;

// disposition: optional signed strength (-100..100). Empty/absent => null.
const optionalDisposition = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce
    .number()
    .int("Disposition must be a whole number.")
    .min(-100, "Disposition must be between -100 and 100.")
    .max(100, "Disposition must be between -100 and 100.")
    .optional(),
);

const optionalRelationshipDay = (label: string) => optionalInt(label, 0);

const relationshipBoundsSchema = {
  sinceDay: optionalRelationshipDay("Since day"),
  untilDay: optionalRelationshipDay("Until day"),
};

function orderedRelationshipBounds<T extends { sinceDay?: number; untilDay?: number }>(
  schema: z.ZodType<T>,
) {
  return schema.refine(
    (value) =>
      value.sinceDay === undefined ||
      value.untilDay === undefined ||
      value.sinceDay <= value.untilDay,
    {
      message: "Since day must be before or equal to until day.",
      path: ["untilDay"],
    },
  );
}

export const createRelationshipSchema = orderedRelationshipBounds(
  z.object({
    type: z.enum(relationshipTypeValues),
    targetId: z.string().trim().min(1, "Pick an entity to connect to."),
    disposition: optionalDisposition,
    ...relationshipBoundsSchema,
    notes: optionalText(500),
    secret: z
      .preprocess((value) => value === true || value === "true" || value === "on", z.boolean())
      .default(false),
  }),
);
export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>;

// Editing an edge changes its mutable fields only; endpoints are fixed
// (re-pointing an edge is a remove + add, so provenance stays honest).
export const updateRelationshipSchema = orderedRelationshipBounds(
  z.object({
    type: z.enum(relationshipTypeValues),
    disposition: optionalDisposition,
    ...relationshipBoundsSchema,
    notes: optionalText(500),
    secret: z
      .preprocess((value) => value === true || value === "true" || value === "on", z.boolean())
      .default(false),
  }),
);
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>;

// Knowledge / reveal grant (fog of war, M3). A grant ties the viewed entity to
// one other entity — `entityId` is that counterpart (the actor that learns, or
// the canon that is learned, depending on which direction the action grants).
// Direction is decided by the action, not the schema, so both share this shape.
export const grantKnowledgeSchema = z.object({
  entityId: z.string().trim().min(1, "Pick an entity."),
  notes: optionalText(500),
});
export type GrantKnowledgeInput = z.infer<typeof grantKnowledgeSchema>;

// BYO AI provider key (M4 — docs/04-ai-integration.md). `providerId` is checked
// against the registry in the service; the apiKey is trimmed and length-bounded
// here, then encrypted at rest. We deliberately don't enforce a prefix so any
// provider/proxy key works — the registry's `keyPrefix` is only a UI hint.
// An optional USD-amount form field: blank clears it (null); otherwise a
// non-negative number bounded by a sane ceiling. Shared by the spend cap and the
// per-token price overrides, all parsed from string FormData.
const optionalUsdAmount = (tooHigh: string) =>
  z
    .union([
      z.literal(""),
      z.coerce
        .number({ message: "Enter a dollar amount, or leave blank to clear." })
        .min(0, "The amount can't be negative.")
        .max(100_000, tooHigh),
    ])
    .optional()
    .default("")
    .transform((v) => (v === "" ? null : v));

const optionalEmbeddingDimensions = z
  .union([
    z.literal(""),
    z.coerce
      .number({ message: "Enter a whole-number vector dimension, or leave blank for the default." })
      .int("Enter a whole-number vector dimension.")
      .min(1, "Embedding dimensions must be at least 1.")
      .max(16_000, "Embedding dimensions can't exceed pgvector's 16,000-dimension limit."),
  ])
  .optional()
  .default("")
  .transform((v) => (v === "" ? null : v));

export const setAiKeySchema = z.object({
  providerId: z.string().trim().min(1, "Pick a provider."),
  // The key may be optional (local/compatible servers) and the endpoint/model
  // may be required — the service applies the per-provider rules from the
  // registry, since only it knows which provider this is.
  apiKey: z.string().trim().max(500).optional().default(""),
  baseUrl: z.string().trim().max(500).optional().default(""),
  model: z.string().trim().max(200).optional().default(""),
  // Optional BYO embedding model for semantic search (M5 — OpenAI-compatible
  // only). Dimension can be set separately for non-default embedders.
  embeddingModel: z.string().trim().max(200).optional().default(""),
  embeddingDimensions: optionalEmbeddingDimensions,
  // DM-supplied price (USD per 1M tokens). Both must be set for the override to
  // apply to usage/cost estimation; blank clears them. See src/lib/ai/pricing.ts.
  inputPerMTokUsd: optionalUsdAmount("That price is unreasonably high."),
  outputPerMTokUsd: optionalUsdAmount("That price is unreasonably high."),
});
export type SetAiKeyInput = z.infer<typeof setAiKeySchema>;

// Campaign AI spend cap (M4 — docs/04-ai-integration.md). An empty string clears
// the cap (null); otherwise a non-negative dollar amount, bounded by a sane
// ceiling so a typo can't store an absurd value. Parsed from the settings form.
export const setSpendCapSchema = z.object({
  spendCapUsd: optionalUsdAmount("That cap is unreasonably high."),
});
export type SetSpendCapInput = z.infer<typeof setSpendCapSchema>;

// Event participant roles (docs/01-domain-model.md). Any-to-any, like
// relationship types — every role is valid for any entity.
export const eventParticipantRoleValues = [
  "ACTOR",
  "TARGET",
  "WITNESS",
  "LOCATION",
  "AFFECTED",
] as const;

const eventParticipantSchema = z.object({
  entityId: z.string().trim().min(1, "Participant entity is required."),
  role: z.enum(eventParticipantRoleValues).default("ACTOR"),
});

// Structured event effects: changes an event can apply to entity state
// (docs/01-domain-model.md). v1 targets a crawler and adjusts or sets a numeric
// stat, or sets the alive flag; applying routes APPLY_EVENT_EFFECTS through the
// review pipeline. Generic-entity / disposition / PERSONA_SHIFT effects are
// follow-ups.
export const eventEffectKindValues = ["ADJUST_STAT", "SET_STAT", "SET_ALIVE"] as const;
export type EventEffectKind = (typeof eventEffectKindValues)[number];

// Crawler numeric fields an event effect can update — these map to the review
// service's `crawler.*` patch fields.
export const eventEffectStatValues = [
  "gold",
  "hp",
  "mp",
  "level",
  "killCount",
  "currentFloor",
] as const;
export type EventEffectStat = (typeof eventEffectStatValues)[number];

export const eventEffectSchema = z
  .object({
    // Stable id within the event. Optional on input (the service assigns one for
    // newly declared effects); present when editing an existing effect.
    id: z.string().trim().max(60).optional(),
    kind: z.enum(eventEffectKindValues),
    targetEntityId: z.string().trim().min(1, "Effect target is required."),
    stat: z.enum(eventEffectStatValues).optional(),
    delta: z.preprocess(
      (value) =>
        value === "" || value === null || value === undefined ? undefined : value,
      z.coerce.number().int("Delta must be a whole number.").optional(),
    ),
    valueNumber: z.preprocess(
      (value) =>
        value === "" || value === null || value === undefined ? undefined : value,
      z.coerce.number().int("Value must be a whole number.").optional(),
    ),
    // "alive" -> true, "dead" -> false; absent -> undefined (non-alive effects).
    value: z.preprocess(
      (value) =>
        value === "" || value === null || value === undefined
          ? undefined
          : value === true || value === "true" || value === "on" || value === "alive",
      z.boolean().optional(),
    ),
    note: optionalText(200),
  })
  .superRefine((effect, ctx) => {
    if (effect.kind === "ADJUST_STAT") {
      if (!effect.stat) {
        ctx.addIssue({ code: "custom", message: "Choose a stat to adjust.", path: ["stat"] });
      }
      if (effect.delta === undefined || effect.delta === 0) {
        ctx.addIssue({ code: "custom", message: "Enter a non-zero delta.", path: ["delta"] });
      }
    }
    if (effect.kind === "SET_STAT") {
      if (!effect.stat) {
        ctx.addIssue({ code: "custom", message: "Choose a stat to set.", path: ["stat"] });
      }
      if (effect.valueNumber === undefined) {
        ctx.addIssue({ code: "custom", message: "Enter a value.", path: ["valueNumber"] });
      }
    }
    if (effect.kind === "SET_ALIVE" && effect.value === undefined) {
      ctx.addIssue({ code: "custom", message: "Choose alive or dead.", path: ["value"] });
    }
  });
export type EventEffectInput = z.infer<typeof eventEffectSchema>;

// floor: optional in-game floor number. Empty/absent => undefined.
const optionalFloor = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce
    .number()
    .int("Floor must be a whole number.")
    .min(1, "Floor must be 1 or greater.")
    .max(18, "Floor must be 18 or less.")
    .optional(),
);

// Structured in-fiction time anchor (ADR 0004 slice 2). The canonical
// definitions live in src/lib/time-ref.ts; imported here for the Zod schemas and
// re-exported so UI components that import from validation.ts get them without a
// second import.
import { timeBasisValues, timeUnitValues } from "@/lib/time-ref";
export { timeBasisValues, timeUnitValues };
export type { TimeBasis as TimeBasisValue, TimeUnit as TimeUnitValue } from "@/lib/time-ref";

const optionalBasis = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.enum(timeBasisValues).optional(),
);

const optionalUnit = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.enum(timeUnitValues).optional(),
);

// Signed offset magnitude (e.g. +3, -12). Empty/absent => undefined.
const optionalOffset = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce
    .number()
    .int("Time offset must be a whole number.")
    .min(-100000, "Time offset is out of range.")
    .max(100000, "Time offset is out of range.")
    .optional(),
);

const optionalAnchorEventId = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.string().trim().max(60).optional(),
);

// The structured-time fields shared by the create/update event schemas. `floor`
// + `timeLabel` are retained (floor is still the coarse clock; `timeLabel`
// overrides the generated phrase).
const eventTimeFields = {
  basis: optionalBasis,
  floor: optionalFloor,
  offset: optionalOffset,
  unit: optionalUnit,
  anchorEventId: optionalAnchorEventId,
  timeLabel: optionalText(120),
} as const;

export const createEventSchema = z.object({
  title: z.string().trim().min(1, "Event title is required.").max(200),
  summary: optionalText(2000),
  ...eventTimeFields,
  secret: z
    .preprocess((value) => value === true || value === "true" || value === "on", z.boolean())
    .default(false),
  // At least one participant; the source entity is always included by the action.
  participants: z
    .array(eventParticipantSchema)
    .min(1, "An event needs at least one participant.")
    .max(20, "Too many participants."),
  // Effects declared while logging the event. Stored unapplied (the DM applies
  // them to entity state later via the Review Queue), mirroring the edit path.
  effects: z.array(eventEffectSchema).max(20, "Too many effects.").optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

// Editing an event changes its scalar fields plus (optionally) its participant
// set. When `participants` is present the event's participants are reconciled to
// match it; when absent, participants are left untouched.
export const updateEventSchema = z.object({
  title: z.string().trim().min(1, "Event title is required.").max(200),
  summary: optionalText(2000),
  ...eventTimeFields,
  secret: z
    .preprocess((value) => value === true || value === "true" || value === "on", z.boolean())
    .default(false),
  participants: z
    .array(eventParticipantSchema)
    .min(1, "An event needs at least one participant.")
    .max(20, "Too many participants.")
    .optional(),
  // The desired set of *unapplied* effects. When present it replaces the event's
  // unapplied effects (applied effects are immutable history, preserved by the
  // service); when absent the effect set is left untouched.
  effects: z.array(eventEffectSchema).max(20, "Too many effects.").optional(),
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const changeOperationDecisionSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "EDITED",
  "REJECTED",
]);

export const reviewEditValueKindSchema = z.enum([
  "array",
  "boolean",
  "json",
  "number",
  "string",
]);
