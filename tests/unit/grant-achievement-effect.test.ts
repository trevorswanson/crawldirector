import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { eventEffectSchema } from "@/lib/validation";
import { prisma } from "@/server/db";
import type { CreateEventInput } from "@/lib/validation";
import { createCampaign } from "@/server/services/campaigns";
import { createCrawler, createGenericEntity } from "@/server/services/entities";
import {
  applyEventEffects,
  createEvent,
  listEventsForEntity,
  updateEvent,
} from "@/server/services/events";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

beforeEach(async () => {
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.relationship.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeCrawler(userId: string, campaignId: string, name: string) {
  const entity = await createCrawler(userId, campaignId, {
    name,
    summary: "",
    description: "",
    visibility: "DM_ONLY",
    tags: [],
    gold: 0,
    viewCount: BigInt(0),
    followerCount: BigInt(0),
    favoriteCount: BigInt(0),
    killCount: 0,
    level: 1,
    isAlive: true,
  });
  return entity.id;
}

async function makeAchievement(userId: string, campaignId: string, name: string) {
  const entity = await createGenericEntity(userId, campaignId, {
    type: "ACHIEVEMENT",
    name,
    summary: "",
    description: "",
    visibility: "DM_ONLY",
    tags: [],
  });
  return entity.id;
}

function grantEvent(
  userId: string,
  campaignId: string,
  crawlerId: string,
  achievementId: string,
  note?: string,
) {
  return createEvent(userId, campaignId, {
    title: "Defeats the boss",
    summary: "",
    secret: false,
    basis: "COLLAPSE",
    offset: 4,
    participants: [{ entityId: crawlerId, role: "ACTOR" }],
    effects: [
      { kind: "GRANT_ACHIEVEMENT", targetEntityId: crawlerId, achievementEntityId: achievementId, note },
    ],
  } as CreateEventInput);
}

describe("GRANT_ACHIEVEMENT effect validation", () => {
  it("accepts a grant with a crawler target and an achievement", () => {
    const parsed = eventEffectSchema.safeParse({
      kind: "GRANT_ACHIEVEMENT",
      targetEntityId: "crawler-1",
      achievementEntityId: "achievement-1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a grant with no achievement", () => {
    const parsed = eventEffectSchema.safeParse({
      kind: "GRANT_ACHIEVEMENT",
      targetEntityId: "crawler-1",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a target crawler", () => {
    const parsed = eventEffectSchema.safeParse({
      kind: "GRANT_ACHIEVEMENT",
      achievementEntityId: "achievement-1",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("grant achievement effect", () => {
  async function setup(email: string) {
    const owner = await makeUser(email);
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const crawlerId = await makeCrawler(owner.id, campaign.id, "Carl");
    const achievementId = await makeAchievement(owner.id, campaign.id, "Goblin Slayer");
    return { owner, campaign, crawlerId, achievementId };
  }

  it("projects the declared grant for the DM view before it is applied", async () => {
    const { owner, campaign, crawlerId, achievementId } = await setup("grant-view@test.com");
    await grantEvent(owner.id, campaign.id, crawlerId, achievementId);

    const declared = await listEventsForEntity(owner.id, campaign.id, crawlerId);
    expect(declared[0].effects[0]).toMatchObject({
      kind: "GRANT_ACHIEVEMENT",
      targetId: crawlerId,
      achievementId,
      applied: false,
    });
  });

  it("creates an EARNED_ACHIEVEMENT edge with provenance and an AFFECTED participant on apply", async () => {
    const { owner, campaign, crawlerId, achievementId } = await setup("grant-apply@test.com");
    const event = await grantEvent(owner.id, campaign.id, crawlerId, achievementId, "for slaying goblins");

    await applyEventEffects(owner.id, campaign.id, event.id, { autoApprove: true });

    const edge = await prisma.relationship.findFirstOrThrow({
      where: {
        campaignId: campaign.id,
        type: "EARNED_ACHIEVEMENT",
        sourceId: crawlerId,
        targetId: achievementId,
      },
    });
    expect(edge.status).toBe("CANON");
    expect(edge.notes).toBe("for slaying goblins");

    // Provenance answers "where did this edge come from".
    const provenance = await prisma.provenance.findMany({
      where: { relationshipId: edge.id },
    });
    expect(provenance.length).toBeGreaterThan(0);

    // The crawler is recorded as an AFFECTED participant and the effect is applied.
    const affected = await prisma.eventParticipant.findFirst({
      where: { eventId: event.id, entityId: crawlerId, role: "AFFECTED" },
    });
    expect(affected).not.toBeNull();
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect((stored.effects as { applied: boolean }[])[0].applied).toBe(true);
  });

  it("is idempotent — a crawler who already holds the achievement gains no duplicate edge", async () => {
    const { owner, campaign, crawlerId, achievementId } = await setup("grant-idem@test.com");

    const first = await grantEvent(owner.id, campaign.id, crawlerId, achievementId);
    await applyEventEffects(owner.id, campaign.id, first.id, { autoApprove: true });

    const second = await grantEvent(owner.id, campaign.id, crawlerId, achievementId);
    await applyEventEffects(owner.id, campaign.id, second.id, { autoApprove: true });

    const edges = await prisma.relationship.findMany({
      where: {
        campaignId: campaign.id,
        type: "EARNED_ACHIEVEMENT",
        sourceId: crawlerId,
        targetId: achievementId,
        status: { not: "ARCHIVED" },
      },
    });
    expect(edges).toHaveLength(1);
  });

  it("applies a grant declared via an event edit (auto-approved)", async () => {
    const { owner, campaign, crawlerId, achievementId } = await setup("grant-edit@test.com");

    const event = await createEvent(owner.id, campaign.id, {
      title: "The reckoning",
      summary: "",
      secret: false,
      basis: "COLLAPSE",
      offset: 7,
      participants: [{ entityId: crawlerId, role: "ACTOR" }],
    } as CreateEventInput);
    await updateEvent(
      owner.id,
      campaign.id,
      event.id,
      {
        title: "The reckoning",
        secret: false,
        effects: [
          { kind: "GRANT_ACHIEVEMENT", targetEntityId: crawlerId, achievementEntityId: achievementId },
        ],
      },
      { applyEffects: true },
    );

    const edge = await prisma.relationship.findFirst({
      where: {
        campaignId: campaign.id,
        type: "EARNED_ACHIEVEMENT",
        sourceId: crawlerId,
        targetId: achievementId,
      },
    });
    expect(edge).not.toBeNull();
  });

  it("rejects declaring a grant whose achievement target is not an achievement entity", async () => {
    const { owner, campaign, crawlerId } = await setup("grant-badachievement@test.com");
    // A second crawler is not a valid achievement to grant.
    const notAnAchievement = await makeCrawler(owner.id, campaign.id, "Princess Donut");
    await expect(
      grantEvent(owner.id, campaign.id, crawlerId, notAnAchievement),
    ).rejects.toThrow(/achievement/i);
  });

  it("rejects declaring a grant against a non-crawler recipient", async () => {
    const { owner, campaign, achievementId } = await setup("grant-badtarget@test.com");
    const npc = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Mordecai",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await expect(
      grantEvent(owner.id, campaign.id, npc.id, achievementId),
    ).rejects.toThrow(/crawler/i);
  });
});
