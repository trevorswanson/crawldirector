import {
  CanonStatus,
  EntityType,
  OpKind,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import {
  createCrawlerSchema,
  createGenericEntitySchema,
  updateEntitySchema,
  type CreateCrawlerInput,
  type CreateGenericEntityInput,
  type UpdateEntityInput,
} from "@/lib/validation";
import { prisma } from "@/server/db";
import {
  applyAutoApprovedEntityChangeSet,
  type ReviewPatch,
} from "@/server/services/review";

const entityListSelect = {
  id: true,
  type: true,
  name: true,
  summary: true,
  status: true,
  visibility: true,
  tags: true,
  updatedAt: true,
  crawler: {
    select: {
      level: true,
      realName: true,
      crawlerNo: true,
      isAlive: true,
      currentFloor: true,
    },
  },
} as const;

const entityDetailSelect = {
  id: true,
  campaignId: true,
  type: true,
  name: true,
  summary: true,
  description: true,
  status: true,
  visibility: true,
  tags: true,
  version: true,
  locked: true,
  lockedFields: true,
  isStub: true,
  agentEnabled: true,
  createdAt: true,
  updatedAt: true,
  crawler: {
    select: {
      realName: true,
      crawlerNo: true,
      level: true,
      hp: true,
      mp: true,
      gold: true,
      viewCount: true,
      followerCount: true,
      favoriteCount: true,
      killCount: true,
      isAlive: true,
      currentFloor: true,
    },
  },
} as const;

export type EntityListItem = Awaited<
  ReturnType<typeof listEntitiesForUser>
>["entities"][number];
export type EntityDetail = NonNullable<Awaited<ReturnType<typeof getEntityForUser>>>;

async function getMembership(userId: string, campaignId: string) {
  return prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
}

async function assertCampaignMember(userId: string, campaignId: string) {
  const membership = await getMembership(userId, campaignId);
  if (!membership) return null;
  return membership;
}

async function assertCampaignDm(userId: string, campaignId: string) {
  const membership = await getMembership(userId, campaignId);
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to edit this campaign.");
  }
  return membership;
}

function nullIfEmpty(value: string | undefined) {
  return value && value.length > 0 ? value : null;
}

function entityCoreData(
  userId: string,
  campaignId: string,
  input: Pick<
    CreateGenericEntityInput,
    "name" | "summary" | "description" | "visibility" | "tags"
  >,
) {
  return {
    campaignId,
    createdById: userId,
    name: input.name,
    summary: nullIfEmpty(input.summary),
    description: nullIfEmpty(input.description),
    visibility: input.visibility as Visibility,
    tags: input.tags,
    status: CanonStatus.CANON,
  };
}

function jsonValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, jsonValue(nested)]),
    );
  }
  return value as string | number | boolean | null | undefined;
}

function addPatch(
  patch: ReviewPatch,
  field: string,
  from: unknown,
  to: unknown,
) {
  const encodedFrom = jsonValue(from);
  const encodedTo = jsonValue(to);
  if (JSON.stringify(encodedFrom) === JSON.stringify(encodedTo)) return;
  patch[field] = {
    ...(encodedFrom === undefined
      ? {}
      : { from: encodedFrom as ReviewPatch[string]["from"] }),
    ...(encodedTo === undefined
      ? {}
      : { to: encodedTo as ReviewPatch[string]["to"] }),
  };
}

function entityCreatePatch(
  userId: string,
  campaignId: string,
  type: EntityType,
  input: Pick<
    CreateGenericEntityInput,
    "name" | "summary" | "description" | "visibility" | "tags"
  >,
) {
  const core = entityCoreData(userId, campaignId, input);
  return {
    campaignId: { to: campaignId },
    createdById: { to: userId },
    type: { to: type },
    name: { to: core.name },
    summary: { to: core.summary },
    description: { to: core.description },
    visibility: { to: core.visibility },
    tags: { to: core.tags },
    status: { to: core.status },
  } satisfies ReviewPatch;
}

async function entityResult(entityId: string) {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true, name: true, type: true },
  });
  if (!entity) throw new ServiceError("Entity not found.");
  return entity;
}

function playerVisibleWhere(role: Role) {
  return role === Role.PLAYER
    ? {
        visibility: {
          in: [Visibility.SHARED_WITH_PLAYERS, Visibility.PLAYER_FACING],
        },
      }
    : {};
}

export async function createGenericEntity(
  userId: string,
  campaignId: string,
  input: CreateGenericEntityInput,
) {
  const parsed = createGenericEntitySchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  const result = await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: `Create ${parsed.name}`,
    operations: [{
      op: OpKind.CREATE_ENTITY,
      patch: entityCreatePatch(
        userId,
        campaignId,
        parsed.type as EntityType,
        parsed,
      ),
    }],
  });
  return entityResult(result.targetIds[0]);
}

export async function createCrawler(
  userId: string,
  campaignId: string,
  input: CreateCrawlerInput,
) {
  const parsed = createCrawlerSchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  const patch = entityCreatePatch(userId, campaignId, EntityType.CRAWLER, parsed);
  Object.assign(patch, {
    "crawler.realName": { to: nullIfEmpty(parsed.realName) },
    "crawler.crawlerNo": { to: nullIfEmpty(parsed.crawlerNo) },
    "crawler.level": { to: parsed.level },
    "crawler.hp": { to: parsed.hp ?? null },
    "crawler.mp": { to: parsed.mp ?? null },
    "crawler.gold": { to: parsed.gold },
    "crawler.viewCount": { to: parsed.viewCount.toString() },
    "crawler.followerCount": { to: parsed.followerCount.toString() },
    "crawler.favoriteCount": { to: parsed.favoriteCount.toString() },
    "crawler.killCount": { to: parsed.killCount },
    "crawler.isAlive": { to: parsed.isAlive },
    "crawler.currentFloor": { to: parsed.currentFloor ?? null },
  });

  const result = await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: `Create ${parsed.name}`,
    operations: [{ op: OpKind.CREATE_ENTITY, patch }],
  });
  return entityResult(result.targetIds[0]);
}

export async function listEntitiesForUser(
  userId: string,
  campaignId: string,
  filters: { query?: string; type?: EntityType | "ALL" } = {},
) {
  const membership = await assertCampaignMember(userId, campaignId);
  if (!membership) return { entities: [], role: null };

  const query = filters.query?.trim();
  const type = filters.type && filters.type !== "ALL" ? filters.type : undefined;

  const entities = await prisma.entity.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...playerVisibleWhere(membership.role),
      ...(type ? { type } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { summary: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    select: entityListSelect,
  });

  return { entities, role: membership.role };
}

export async function getEntityForUser(
  userId: string,
  campaignId: string,
  entityId: string,
) {
  const membership = await assertCampaignMember(userId, campaignId);
  if (!membership) return null;

  return prisma.entity.findFirst({
    where: {
      id: entityId,
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...playerVisibleWhere(membership.role),
    },
    select: entityDetailSelect,
  });
}

export async function updateEntity(
  userId: string,
  campaignId: string,
  entityId: string,
  input: UpdateEntityInput,
) {
  const parsed = updateEntitySchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.entity.findFirst({
    where: { id: entityId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: {
      id: true,
      type: true,
      name: true,
      summary: true,
      description: true,
      visibility: true,
      tags: true,
      version: true,
      crawler: {
        select: {
          realName: true,
          crawlerNo: true,
          level: true,
          hp: true,
          mp: true,
          gold: true,
          viewCount: true,
          followerCount: true,
          favoriteCount: true,
          killCount: true,
          isAlive: true,
          currentFloor: true,
        },
      },
    },
  });

  if (!existing) throw new ServiceError("Entity not found.");
  if (existing.type !== parsed.type) {
    throw new ServiceError("Entity type cannot be changed.");
  }

  const patch: ReviewPatch = {
    _baseVersion: { to: existing.version },
  };
  addPatch(patch, "name", existing.name, parsed.name);
  addPatch(patch, "summary", existing.summary, nullIfEmpty(parsed.summary));
  addPatch(
    patch,
    "description",
    existing.description,
    nullIfEmpty(parsed.description),
  );
  addPatch(patch, "visibility", existing.visibility, parsed.visibility as Visibility);
  addPatch(patch, "tags", existing.tags, parsed.tags);

  if (existing.type === EntityType.CRAWLER && existing.crawler) {
    addPatch(patch, "crawler.realName", existing.crawler.realName, nullIfEmpty(parsed.realName));
    addPatch(patch, "crawler.crawlerNo", existing.crawler.crawlerNo, nullIfEmpty(parsed.crawlerNo));
    addPatch(patch, "crawler.level", existing.crawler.level, parsed.level ?? 1);
    addPatch(patch, "crawler.hp", existing.crawler.hp, parsed.hp ?? null);
    addPatch(patch, "crawler.mp", existing.crawler.mp, parsed.mp ?? null);
    addPatch(patch, "crawler.gold", existing.crawler.gold, parsed.gold ?? 0);
    addPatch(
      patch,
      "crawler.viewCount",
      existing.crawler.viewCount,
      parsed.viewCount ?? BigInt(0),
    );
    addPatch(
      patch,
      "crawler.followerCount",
      existing.crawler.followerCount,
      parsed.followerCount ?? BigInt(0),
    );
    addPatch(
      patch,
      "crawler.favoriteCount",
      existing.crawler.favoriteCount,
      parsed.favoriteCount ?? BigInt(0),
    );
    addPatch(patch, "crawler.killCount", existing.crawler.killCount, parsed.killCount ?? 0);
    addPatch(patch, "crawler.isAlive", existing.crawler.isAlive, parsed.isAlive ?? true);
    addPatch(
      patch,
      "crawler.currentFloor",
      existing.crawler.currentFloor,
      parsed.currentFloor ?? null,
    );
  }

  if (Object.keys(patch).length === 1) return entityResult(entityId);

  await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: `Update ${existing.name}`,
    operations: [{ op: OpKind.UPDATE_ENTITY, targetId: entityId, patch }],
  });
  return entityResult(entityId);
}

export async function archiveEntity(
  userId: string,
  campaignId: string,
  entityId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.entity.findFirst({
    where: { id: entityId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, name: true, status: true, version: true },
  });
  if (!existing) throw new ServiceError("Entity not found.");

  await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: `Archive ${existing.name}`,
    operations: [{
      op: OpKind.DELETE_ENTITY,
      targetId: entityId,
      patch: {
        _baseVersion: { to: existing.version },
        status: { from: existing.status, to: CanonStatus.ARCHIVED },
      },
    }],
  });
  return { id: entityId };
}
