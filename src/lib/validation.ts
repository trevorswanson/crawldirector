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
  name: z.string().trim().min(1, "Campaign name is required").max(120),
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
  fanCount: optionalBigInt("Fan count").default(BigInt(0)),
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
  fanCount: optionalBigInt("Fan count"),
  killCount: optionalInt("Kill count"),
  currentFloor: optionalInt("Current floor", 1),
  isAlive: z.preprocess((value) => value !== "false", z.boolean()).optional(),
});
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;
