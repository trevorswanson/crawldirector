import {
  CanonStatus,
  ChangeSource,
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
  source: true,
  tags: true,
  locked: true,
  isStub: true,
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

export type EntityStatusFilter = "ALL" | "CANON" | "PENDING" | "LOCKED";

const entityDetailSelect = {
  id: true,
  campaignId: true,
  type: true,
  name: true,
  summary: true,
  description: true,
  status: true,
  visibility: true,
  source: true,
  tags: true,
  version: true,
  locked: true,
  lockedFields: true,
  isStub: true,
  data: true,
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
    "name" | "summary" | "description" | "visibility" | "tags" | "isStub" | "itemTypeId" | "divine" | "unique" | "fleeting" | "aiDescription" | "floorNumber" | "theme" | "startDay" | "collapseDay"
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
    ...(input.isStub !== undefined ? { isStub: { to: input.isStub } } : {}),
    "data.itemTypeId": { to: input.itemTypeId ?? null },
    "data.divine": { to: input.divine ?? false },
    "data.unique": { to: input.unique ?? false },
    "data.fleeting": { to: input.fleeting ?? false },
    "data.aiDescription": { to: input.aiDescription ?? null },
    ...(type === EntityType.FLOOR
      ? {
          "data.floorNumber": { to: input.floorNumber ?? null },
          "data.theme": { to: nullIfEmpty(input.theme) },
          "data.startDay": { to: input.startDay ?? null },
          "data.collapseDay": { to: input.collapseDay ?? null },
        }
      : {}),
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
  filters: {
    query?: string;
    tag?: string;
    type?: EntityType | "ALL";
    status?: EntityStatusFilter;
    lockedOnly?: boolean;
    source?: ChangeSource | "ALL";
  } = {},
) {
  const membership = await assertCampaignMember(userId, campaignId);
  if (!membership) return { entities: [], role: null };

  const query = filters.query?.trim();
  const tag = filters.tag?.trim();
  const type = filters.type && filters.type !== "ALL" ? filters.type : undefined;
  const status = filters.status && filters.status !== "ALL" ? filters.status : undefined;
  const lockedOnly = filters.lockedOnly || status === "LOCKED";
  const source = filters.source && filters.source !== "ALL" ? filters.source : undefined;

  const entities = await prisma.entity.findMany({
    where: {
      campaignId,
      // CANON/PENDING narrow the status; everything else just excludes archived.
      status:
        status === "CANON"
          ? CanonStatus.CANON
          : status === "PENDING"
            ? CanonStatus.PENDING
            : { not: CanonStatus.ARCHIVED },
      ...(lockedOnly
        ? {
            OR: [
              { locked: true },
              { NOT: { lockedFields: { equals: [] } } },
            ],
          }
        : {}),
      ...(source ? { source } : {}),
      ...playerVisibleWhere(membership.role),
      ...(type ? { type } : {}),
      ...(tag
        ? {
            tags: {
              hasSome: [
                tag,
                tag.toLowerCase(),
                tag.toUpperCase(),
                tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase(),
              ],
            },
          }
        : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { summary: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              {
                tags: {
                  hasSome: [
                    query,
                    query.toLowerCase(),
                    query.toUpperCase(),
                    query.charAt(0).toUpperCase() + query.slice(1).toLowerCase(),
                  ],
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    select: entityListSelect,
  });

  return { entities, role: membership.role };
}

export async function listCampaignTags(
  userId: string,
  campaignId: string,
): Promise<string[]> {
  const membership = await assertCampaignMember(userId, campaignId);
  if (!membership) return [];

  const entities = await prisma.entity.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...playerVisibleWhere(membership.role),
    },
    select: {
      tags: true,
    },
  });

  const uniqueTags = new Map<string, string>();
  for (const entity of entities) {
    for (const tag of entity.tags) {
      const trimmed = tag.trim();
      if (trimmed) {
        const lower = trimmed.toLowerCase();
        if (!uniqueTags.has(lower)) {
          uniqueTags.set(lower, trimmed);
        }
      }
    }
  }

  return Array.from(uniqueTags.values()).sort((a, b) => a.localeCompare(b));
}

// Per-type counts for the world-browser facets. Scoped + visibility-aware, and
// independent of the active type filter so every facet shows its true total.
export async function getEntityTypeCounts(
  userId: string,
  campaignId: string,
): Promise<Partial<Record<EntityType, number>>> {
  const membership = await assertCampaignMember(userId, campaignId);
  if (!membership) return {};

  const groups = await prisma.entity.groupBy({
    by: ["type"],
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...playerVisibleWhere(membership.role),
    },
    _count: { _all: true },
  });

  const counts: Partial<Record<EntityType, number>> = {};
  for (const group of groups) counts[group.type] = group._count._all;
  return counts;
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
      isStub: true,
      data: true,
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

  if (existing.isStub) {
    addPatch(patch, "isStub", true, false);
  }

  const existingData = (existing.data as {
    itemTypeId?: string | null;
    divine?: boolean;
    unique?: boolean;
    fleeting?: boolean;
    aiDescription?: string | null;
    floorNumber?: number | null;
    theme?: string | null;
    startDay?: number | null;
    collapseDay?: number | null;
  }) || {};
  addPatch(patch, "data.itemTypeId", existingData.itemTypeId ?? null, parsed.itemTypeId ?? null);
  addPatch(patch, "data.divine", existingData.divine ?? false, parsed.divine ?? false);
  addPatch(patch, "data.unique", existingData.unique ?? false, parsed.unique ?? false);
  addPatch(patch, "data.fleeting", existingData.fleeting ?? false, parsed.fleeting ?? false);
  addPatch(patch, "data.aiDescription", existingData.aiDescription ?? null, parsed.aiDescription ?? null);
  if (existing.type === EntityType.FLOOR) {
    addPatch(patch, "data.floorNumber", existingData.floorNumber ?? null, parsed.floorNumber ?? null);
    addPatch(patch, "data.theme", existingData.theme ?? null, nullIfEmpty(parsed.theme));
    addPatch(patch, "data.startDay", existingData.startDay ?? null, parsed.startDay ?? null);
    addPatch(patch, "data.collapseDay", existingData.collapseDay ?? null, parsed.collapseDay ?? null);
  }

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

export async function restoreEntity(
  userId: string,
  campaignId: string,
  entityId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.entity.findFirst({
    where: { id: entityId, campaignId, status: CanonStatus.ARCHIVED },
    select: { id: true, name: true, status: true, version: true },
  });
  if (!existing) throw new ServiceError("Archived entity not found.");

  await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: `Restore ${existing.name}`,
    operations: [{
      op: OpKind.UPDATE_ENTITY,
      targetId: entityId,
      patch: {
        _baseVersion: { to: existing.version },
        status: { from: existing.status, to: CanonStatus.CANON },
      },
    }],
  });
  return { id: entityId };
}
