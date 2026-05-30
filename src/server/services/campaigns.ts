import { prisma } from "@/server/db";
import { Role, CanonStatus, ChangeSource, EntityType } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { createCampaignSchema, type CreateCampaignInput } from "@/lib/validation";

// Creating a campaign also makes the creator its OWNER member. Tenancy is
// enforced here: every read is scoped to campaigns the user is a member of.
export async function createCampaign(userId: string, input: CreateCampaignInput) {
  const { name, summary } = createCampaignSchema.parse(input);

  return prisma.campaign.create({
    data: {
      name,
      summary: summary ? summary : null,
      ownerId: userId,
      members: {
        create: { userId, role: Role.OWNER },
      },
    },
    select: { id: true, name: true },
  });
}

export async function listCampaignsForUser(userId: string) {
  return prisma.campaign.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      summary: true,
      createdAt: true,
      members: {
        where: { userId },
        select: { role: true },
      },
    },
  });
}

// Returns the campaign only if the user is a member; otherwise null. The
// caller treats null as not-found / not-authorized (never leak existence).
export async function getCampaignForUser(userId: string, campaignId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      summary: true,
      createdAt: true,
      members: {
        where: { userId },
        select: { role: true },
      },
      _count: { select: { members: true, entities: true } },
    },
  });
}

export type CanonIntegrity = {
  dmPercent: number;
  aiPercent: number;
  playerPercent: number;
  lockedPercent: number;
  dmCount: number;
  aiCount: number;
  playerCount: number;
  lockedCount: number;
  totalFields: number;
};

function isPopulated(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

export async function getCampaignCanonIntegrity(
  userId: string,
  campaignId: string,
): Promise<CanonIntegrity> {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });
  if (!membership) {
    throw new ServiceError("You do not have access to this campaign.");
  }

  const entities = await prisma.entity.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
    },
    include: {
      crawler: true,
    },
  });

  const provenances = await prisma.provenance.findMany({
    where: {
      campaignId,
      entityId: { not: null },
      entity: {
        status: { not: CanonStatus.ARCHIVED },
      },
    },
    select: {
      entityId: true,
      field: true,
      source: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const latestProvenance = new Map<string, ChangeSource>();
  for (const prov of provenances) {
    if (prov.entityId && prov.field) {
      latestProvenance.set(`${prov.entityId}:${prov.field}`, prov.source);
    }
  }

  let dmCount = 0;
  let aiCount = 0;
  let playerCount = 0;
  let lockedCount = 0;

  for (const entity of entities) {
    const fieldsToCheck: { name: string; value: unknown }[] = [
      { name: "name", value: entity.name },
      { name: "summary", value: entity.summary },
      { name: "description", value: entity.description },
      { name: "tags", value: entity.tags },
      { name: "visibility", value: entity.visibility },
      { name: "isStub", value: entity.isStub },
    ];

    if (entity.type === EntityType.CRAWLER && entity.crawler) {
      const c = entity.crawler;
      fieldsToCheck.push(
        { name: "crawler.realName", value: c.realName },
        { name: "crawler.crawlerNo", value: c.crawlerNo },
        { name: "crawler.level", value: c.level },
        { name: "crawler.hp", value: c.hp },
        { name: "crawler.mp", value: c.mp },
        { name: "crawler.gold", value: c.gold },
        { name: "crawler.viewCount", value: c.viewCount },
        { name: "crawler.followerCount", value: c.followerCount },
        { name: "crawler.favoriteCount", value: c.favoriteCount },
        { name: "crawler.killCount", value: c.killCount },
        { name: "crawler.isAlive", value: c.isAlive },
        { name: "crawler.currentFloor", value: c.currentFloor },
      );
    }

    for (const field of fieldsToCheck) {
      if (isPopulated(field.value)) {
        const isFieldLocked =
          entity.locked || (entity.lockedFields && entity.lockedFields.includes(field.name));
        if (isFieldLocked) {
          lockedCount++;
        } else {
          const provSource =
            latestProvenance.get(`${entity.id}:${field.name}`) ?? entity.source;
          if (provSource === ChangeSource.AI) {
            aiCount++;
          } else if (provSource === ChangeSource.PLAYER_SUGGESTION) {
            playerCount++;
          } else {
            dmCount++;
          }
        }
      }
    }
  }

  const totalFields = dmCount + aiCount + playerCount + lockedCount;
  if (totalFields === 0) {
    return {
      dmPercent: 100,
      aiPercent: 0,
      playerPercent: 0,
      lockedPercent: 0,
      dmCount: 0,
      aiCount: 0,
      playerCount: 0,
      lockedCount: 0,
      totalFields: 0,
    };
  }

  const items = [
    { key: "dm", count: dmCount },
    { key: "ai", count: aiCount },
    { key: "player", count: playerCount },
    { key: "locked", count: lockedCount },
  ];

  const withRaw = items.map((item) => {
    const raw = (item.count / totalFields) * 100;
    return {
      key: item.key,
      raw,
      floor: Math.floor(raw),
      remainder: raw - Math.floor(raw),
    };
  });

  const sumFloor = withRaw.reduce((acc, item) => acc + item.floor, 0);
  const diff = 100 - sumFloor;

  const sorted = [...withRaw].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < diff; i++) {
    const target = sorted[i];
    if (target) {
      const match = withRaw.find((item) => item.key === target.key);
      if (match) {
        match.floor += 1;
      }
    }
  }

  return {
    dmPercent: withRaw.find((w) => w.key === "dm")!.floor,
    aiPercent: withRaw.find((w) => w.key === "ai")!.floor,
    playerPercent: withRaw.find((w) => w.key === "player")!.floor,
    lockedPercent: withRaw.find((w) => w.key === "locked")!.floor,
    dmCount,
    aiCount,
    playerCount,
    lockedCount,
    totalFields,
  };
}

