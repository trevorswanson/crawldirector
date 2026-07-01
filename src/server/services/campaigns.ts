import { prisma } from "@/server/db";
import {
  Role,
  CanonStatus,
  ChangeSource,
  EntityType,
  Prisma,
  Visibility,
} from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { effectiveFloorStartDay, readFloorData } from "@/lib/floor";
import { resolveAbsoluteDay } from "@/lib/time-resolve";
import { readTimeRef } from "@/lib/time-ref";
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

// The signed-in user's role in a campaign, or null if they aren't a member.
// Drives role-based routing between the DM console and the player crawler
// interface (a user may be DM of one campaign and a PLAYER of another).
export async function getMembershipRole(
  userId: string,
  campaignId: string,
): Promise<Role | null> {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  return membership?.role ?? null;
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

export type CampaignHeaderStatus = {
  currentFloor: {
    id: string;
    name: string;
    floorNumber: number | null;
  } | null;
  currentDay: number | null;
};

export async function getCampaignHeaderStatus(
  userId: string,
  campaignId: string,
): Promise<CampaignHeaderStatus | null> {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  if (!membership) return null;

  const isPlayer = membership.role === Role.PLAYER;
  const floorWhere: Prisma.EntityWhereInput = {
    campaignId,
    type: EntityType.FLOOR,
    status: { not: CanonStatus.ARCHIVED },
    ...(isPlayer ? { visibility: Visibility.PLAYER_VISIBLE } : {}),
  };
  const eventWhere: Prisma.EventWhereInput = {
    campaignId,
    status: { not: CanonStatus.ARCHIVED },
    ...(isPlayer
      ? {
          secret: false,
          participants: {
            some: {
              entity: {
                status: { not: CanonStatus.ARCHIVED },
                visibility: Visibility.PLAYER_VISIBLE,
              },
            },
          },
        }
      : {}),
  };

  const [campaign, floorRows, eventRows] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { currentFloorId: true },
    }),
    prisma.entity.findMany({
      where: floorWhere,
      // FLOOR anchors live in the 1:1 satellite once migrated (ADR 0011 Part C).
      select: {
        id: true,
        name: true,
        data: true,
        floor: {
          select: {
            floorNumber: true,
            theme: true,
            startDay: true,
            collapseDay: true,
          },
        },
      },
    }),
    prisma.event.findMany({
      where: eventWhere,
      select: { id: true, inGameTime: true },
    }),
  ]);
  if (!campaign) return null;

  const floorAnchorsByNumber = new Map<
    number,
    { startDay: number | null; collapseDay: number | null }
  >();
  let currentFloor: CampaignHeaderStatus["currentFloor"] = null;
  for (const floor of floorRows) {
    const data = readFloorData(floor.data, floor.floor);
    if (typeof data.floorNumber === "number") {
      floorAnchorsByNumber.set(data.floorNumber, {
        startDay: effectiveFloorStartDay(data.floorNumber, data.startDay),
        collapseDay: data.collapseDay,
      });
    }
    if (floor.id === campaign.currentFloorId) {
      currentFloor = {
        id: floor.id,
        name: floor.name,
        floorNumber: data.floorNumber,
      };
    }
  }

  const eventTimesById = new Map(
    eventRows.map((event) => [event.id, readTimeRef(event.inGameTime)]),
  );
  const context = {
    eventTimeById: (eventId: string) => eventTimesById.get(eventId),
    floorAnchors: (floor: number) => floorAnchorsByNumber.get(floor),
  };
  let currentDay: number | null = null;
  for (const time of eventTimesById.values()) {
    const day = resolveAbsoluteDay(time, context);
    if (day != null && (currentDay == null || day > currentDay)) {
      currentDay = day;
    }
  }

  return { currentFloor, currentDay };
}

// Point the campaign's "current floor" at a DM-chosen FLOOR entity (or clear it
// with null). Drives the timeline's ON-AIR / current-floor styling (ADR 0005).
// Not canon — a direct campaign setting, audited like an event lock. DM/co-DM
// only. Returns the resolved floor number (from the entity's data.floorNumber)
// so callers can revalidate/label without a re-read.
export async function setCampaignCurrentFloor(
  userId: string,
  campaignId: string,
  floorEntityId: string | null,
): Promise<{ currentFloorId: string | null; floorNumber: number | null }> {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to edit this campaign.");
  }

  let floorNumber: number | null = null;
  if (floorEntityId) {
    const entity = await prisma.entity.findFirst({
      where: {
        id: floorEntityId,
        campaignId,
        type: EntityType.FLOOR,
        status: { not: CanonStatus.ARCHIVED },
      },
      // floorNumber lives in the 1:1 satellite once migrated (ADR 0011 Part C);
      // read it through the satellite-aware seam.
      select: {
        id: true,
        data: true,
        floor: {
          select: {
            floorNumber: true,
            theme: true,
            startDay: true,
            collapseDay: true,
          },
        },
      },
    });
    if (!entity) throw new ServiceError("Floor entity not found.");
    floorNumber = readFloorData(entity.data, entity.floor).floorNumber;
  }

  await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUnique({
      where: { id: campaignId },
      select: { currentFloorId: true },
    });
    if (!campaign) throw new ServiceError("Campaign not found.");
    if (campaign.currentFloorId === floorEntityId) return;

    await tx.campaign.update({
      where: { id: campaignId },
      data: { currentFloorId: floorEntityId },
    });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "SET_CURRENT_FLOOR",
        targetType: "CAMPAIGN",
        targetId: campaignId,
        detail: {
          currentFloorId: floorEntityId,
          previousCurrentFloorId: campaign.currentFloorId,
        },
      },
    });
  });

  return { currentFloorId: floorEntityId, floorNumber };
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
  // Canon-integrity aggregates span all non-archived canon, including DM-only and
  // secret records, so this is a DM/co-DM metric. Enforce the role here, not only
  // in UI callers (CWE-862): a player must not infer hidden canon size, lock
  // density, or provenance mix from the totals.
  if (membership.role === Role.PLAYER) {
    throw new ServiceError("Only the DM can view canon integrity.");
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

  const byKey = new Map(withRaw.map((item) => [item.key, item]));
  const sumFloor = withRaw.reduce((acc, item) => acc + item.floor, 0);
  const diff = 100 - sumFloor;

  const sorted = [...withRaw].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < diff; i++) {
    const target = sorted[i];
    if (target) {
      const match = byKey.get(target.key);
      if (match) {
        match.floor += 1;
      }
    }
  }

  return {
    dmPercent: byKey.get("dm")!.floor,
    aiPercent: byKey.get("ai")!.floor,
    playerPercent: byKey.get("player")!.floor,
    lockedPercent: byKey.get("locked")!.floor,
    dmCount,
    aiCount,
    playerCount,
    lockedCount,
    totalFields,
  };
}
