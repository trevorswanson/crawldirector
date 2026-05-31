import { z } from "zod";

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
  "SKILL",
  "SPELL",
  "ACHIEVEMENT",
  "TITLE",
  "SYSTEM_MESSAGE",
  "DEITY",
] as const;

export const visibilityValues = [
  "DM_ONLY",
  "SHARED_WITH_PLAYERS",
  "PLAYER_FACING",
] as const;

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === null ? undefined : value),
    z.string().trim().max(max).optional().or(z.literal("")),
  );

const optionalInt = (label: string, min = 0) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce
      .number()
      .refine((value) => Number.isFinite(value), `${label} must be a number.`)
      .int(`${label} must be a whole number.`)
      .min(min)
      .optional(),
  );

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

const entityCoreSchema = z.object({
  name: z.string().trim().min(1, "Entity name is required").max(160),
  summary: optionalText(500),
  description: optionalText(10000),
  visibility: z.enum(visibilityValues).default("DM_ONLY"),
  tags: tagsSchema,
  isStub: z.boolean().optional(),
});

export const createGenericEntitySchema = entityCoreSchema.extend({
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

export const lockableCrawlerFields = [
  "crawler.realName",
  "crawler.crawlerNo",
  "crawler.level",
  "crawler.hp",
  "crawler.mp",
  "crawler.gold",
  "crawler.viewCount",
  "crawler.followerCount",
  "crawler.favoriteCount",
  "crawler.killCount",
  "crawler.isAlive",
  "crawler.currentFloor",
] as const;

export const lockableFields = [
  ...lockableEntityFields,
  ...lockableCrawlerFields,
] as const;

// A single lockable field key, validated where a per-field lock toggle posts it.
export const lockFieldSchema = z.enum(lockableFields);

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

export const createRelationshipSchema = z.object({
  type: z.enum(relationshipTypeValues),
  targetId: z.string().trim().min(1, "Pick an entity to connect to."),
  disposition: optionalDisposition,
  notes: optionalText(500),
  secret: z
    .preprocess((value) => value === true || value === "true" || value === "on", z.boolean())
    .default(false),
});
export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>;

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

export const createEventSchema = z.object({
  title: z.string().trim().min(1, "Event title is required.").max(200),
  summary: optionalText(2000),
  floor: optionalFloor,
  timeLabel: optionalText(120),
  secret: z
    .preprocess((value) => value === true || value === "true" || value === "on", z.boolean())
    .default(false),
  // At least one participant; the source entity is always included by the action.
  participants: z
    .array(eventParticipantSchema)
    .min(1, "An event needs at least one participant.")
    .max(20, "Too many participants."),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

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
