import { CanonStatus, EntityType, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";

// ── Player ↔ crawler link (M7) ────────────────────────────────────────────
//
// A PLAYER membership can be linked by the DM to the CRAWLER entity they
// control. The link is membership metadata (who plays whom), not part of the
// world graph, so it does NOT route through the review pipeline — it mirrors
// role assignment, a direct membership mutation. The link is also the read
// grant for a player's own crawler sheet: `getMyCrawlerSheet` returns ONLY the
// CANON crawler bound to the caller's own membership, so a player can see their
// own crawler's stats (even a DM_ONLY entity — it's their character) without
// ever reaching anyone else's canon or any non-CANON content (invariant #5).

async function getMembership(userId: string, campaignId: string) {
  return prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
}

async function assertCampaignDm(userId: string, campaignId: string) {
  const membership = await getMembership(userId, campaignId);
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to manage this campaign.");
  }
  return membership;
}

// DM-only: the PLAYER memberships of a campaign plus each one's currently
// linked crawler, for the crawler-assignment panel. Owners/co-DMs are not
// listed — only players control crawlers.
export async function listPlayerMemberships(userId: string, campaignId: string) {
  await assertCampaignDm(userId, campaignId);
  const memberships = await prisma.membership.findMany({
    where: { campaignId, role: Role.PLAYER },
    select: {
      id: true,
      userId: true,
      crawlerEntityId: true,
      user: { select: { name: true, email: true } },
      crawlerEntity: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    userName: m.user.name,
    userEmail: m.user.email,
    // The relation surfaces the linked crawler whatever its canon status (the
    // DM's own canon); it only becomes null if the entity row is hard-deleted
    // (SetNull) — archiving is a status change, not a delete, so an archived
    // crawler stays linked here and the DM can re-link it.
    crawler: m.crawlerEntity
      ? { id: m.crawlerEntity.id, name: m.crawlerEntity.name }
      : null,
  }));
}

// DM-only: the CRAWLER entities available to assign to a player. Not
// visibility-scoped (the DM sees all their own canon), but ARCHIVED (removed)
// crawlers are excluded so the picker doesn't offer tombstones. A PENDING
// crawler may still be linked ahead of approval — the player only ever sees it
// once it is CANON (getMyCrawlerSheet gates on status).
export async function listAssignableCrawlers(userId: string, campaignId: string) {
  await assertCampaignDm(userId, campaignId);
  return prisma.entity.findMany({
    where: {
      campaignId,
      type: EntityType.CRAWLER,
      status: { not: CanonStatus.ARCHIVED },
    },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
}

// DM-only: link (or, with null, unlink) a player membership to a crawler.
// Validates the target is a PLAYER membership in this campaign and the crawler
// is a CRAWLER entity in this campaign. Not a canon write — updates membership
// metadata directly.
export async function setPlayerCrawler(
  userId: string,
  campaignId: string,
  membershipId: string,
  crawlerEntityId: string | null,
) {
  await assertCampaignDm(userId, campaignId);

  const target = await prisma.membership.findFirst({
    where: { id: membershipId, campaignId },
    select: { id: true, role: true },
  });
  if (!target) {
    throw new ServiceError("That player is not part of this campaign.");
  }
  if (target.role !== Role.PLAYER) {
    throw new ServiceError("Only players control crawlers.");
  }

  if (crawlerEntityId) {
    const crawler = await prisma.entity.findFirst({
      where: { id: crawlerEntityId, campaignId, type: EntityType.CRAWLER },
      select: { id: true },
    });
    if (!crawler) {
      throw new ServiceError("That crawler does not exist in this campaign.");
    }
  }

  await prisma.membership.update({
    where: { id: membershipId },
    data: { crawlerEntityId },
  });
}

export type CrawlerSheet = {
  entityId: string;
  name: string;
  summary: string | null;
  imageUrl: string | null;
  realName: string | null;
  crawlerNo: string | null;
  level: number;
  hp: number | null;
  mp: number | null;
  gold: number;
  currentFloor: number | null;
  isAlive: boolean;
  killCount: number;
  followerCount: bigint;
  // Free-form stat block (STR/DEX/…). Currently has no write path, so it is
  // typically empty; rendered only when populated so we never show filler.
  stats: Record<string, number>;
};

// Player-scoped: the caller's own crawler sheet, or null if they are not a
// member or have no crawler linked. Only ever returns the crawler bound to the
// caller's OWN membership — this is the entire projection, so it cannot leak
// another player's or DM-only-but-unlinked canon.
export async function getMyCrawlerSheet(
  userId: string,
  campaignId: string,
): Promise<CrawlerSheet | null> {
  // One round-trip: the crawler is a direct relation on the membership, so we
  // read it inline instead of a second lookup by id.
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: {
      crawlerEntity: {
        select: {
          id: true,
          name: true,
          summary: true,
          imageUrl: true,
          campaignId: true,
          type: true,
          status: true,
          crawler: {
            select: {
              realName: true,
              crawlerNo: true,
              level: true,
              hp: true,
              mp: true,
              gold: true,
              currentFloor: true,
              isAlive: true,
              killCount: true,
              followerCount: true,
              stats: true,
            },
          },
        },
      },
    },
  });

  const entity = membership?.crawlerEntity;
  // Gate in JS (a to-one relation can't be filtered in the nested select): the
  // link should never point elsewhere, but the sheet must never render a
  // non-crawler, and must never surface non-CANON content to a player
  // (invariant #5) — the DM can link a PENDING crawler ahead of approval, and
  // archiving flips status to ARCHIVED without clearing the link. So gate on
  // CANON (belt-and-suspenders, like the Known World); anything else shows the
  // "no crawler linked yet" empty state.
  if (
    !entity?.crawler ||
    entity.campaignId !== campaignId ||
    entity.type !== EntityType.CRAWLER ||
    entity.status !== CanonStatus.CANON
  ) {
    return null;
  }

  const c = entity.crawler;
  const rawStats = c.stats as unknown;
  const stats: Record<string, number> = {};
  if (rawStats && typeof rawStats === "object" && !Array.isArray(rawStats)) {
    for (const [key, value] of Object.entries(rawStats as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) stats[key] = value;
    }
  }

  return {
    entityId: entity.id,
    name: entity.name,
    summary: entity.summary,
    imageUrl: entity.imageUrl,
    realName: c.realName,
    crawlerNo: c.crawlerNo,
    level: c.level,
    hp: c.hp,
    mp: c.mp,
    gold: c.gold,
    currentFloor: c.currentFloor,
    isAlive: c.isAlive,
    killCount: c.killCount,
    followerCount: c.followerCount,
    stats,
  };
}
