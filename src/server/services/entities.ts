import {
  CanonStatus,
  EntityType,
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
      fanCount: true,
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

export async function createGenericEntity(
  userId: string,
  campaignId: string,
  input: CreateGenericEntityInput,
) {
  const parsed = createGenericEntitySchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  return prisma.entity.create({
    data: {
      ...entityCoreData(userId, campaignId, parsed),
      type: parsed.type as EntityType,
    },
    select: { id: true, name: true, type: true },
  });
}

export async function createCrawler(
  userId: string,
  campaignId: string,
  input: CreateCrawlerInput,
) {
  const parsed = createCrawlerSchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  return prisma.entity.create({
    data: {
      ...entityCoreData(userId, campaignId, parsed),
      type: EntityType.CRAWLER,
      crawler: {
        create: {
          realName: nullIfEmpty(parsed.realName),
          crawlerNo: nullIfEmpty(parsed.crawlerNo),
          level: parsed.level,
          hp: parsed.hp ?? null,
          mp: parsed.mp ?? null,
          gold: parsed.gold,
          fanCount: BigInt(parsed.fanCount),
          killCount: parsed.killCount,
          isAlive: parsed.isAlive,
          currentFloor: parsed.currentFloor ?? null,
        },
      },
    },
    select: { id: true, name: true, type: true },
  });
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
    select: { id: true, type: true },
  });

  if (!existing) throw new ServiceError("Entity not found.");
  if (existing.type !== parsed.type) {
    throw new ServiceError("Entity type cannot be changed.");
  }

  return prisma.entity.update({
    where: { id: entityId },
    data: {
      name: parsed.name,
      summary: nullIfEmpty(parsed.summary),
      description: nullIfEmpty(parsed.description),
      visibility: parsed.visibility as Visibility,
      tags: parsed.tags,
      version: { increment: 1 },
      ...(existing.type === EntityType.CRAWLER
        ? {
            crawler: {
              update: {
                realName: nullIfEmpty(parsed.realName),
                crawlerNo: nullIfEmpty(parsed.crawlerNo),
                level: parsed.level ?? 1,
                hp: parsed.hp ?? null,
                mp: parsed.mp ?? null,
                gold: parsed.gold ?? 0,
                fanCount: BigInt(parsed.fanCount ?? 0),
                killCount: parsed.killCount ?? 0,
                isAlive: parsed.isAlive ?? true,
                currentFloor: parsed.currentFloor ?? null,
              },
            },
          }
        : {}),
    },
    select: { id: true, name: true, type: true },
  });
}

export async function archiveEntity(
  userId: string,
  campaignId: string,
  entityId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.entity.findFirst({
    where: { id: entityId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true },
  });
  if (!existing) throw new ServiceError("Entity not found.");

  return prisma.entity.update({
    where: { id: entityId },
    data: { status: CanonStatus.ARCHIVED, version: { increment: 1 } },
    select: { id: true },
  });
}
