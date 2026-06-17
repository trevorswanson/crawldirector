import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { readFloorData } from "@/lib/floor";
import { eventEffectSchema } from "@/lib/validation";
import { prisma } from "@/server/db";
import type { CreateEventInput } from "@/lib/validation";
import { createCampaign } from "@/server/services/campaigns";
import { createCrawler, createGenericEntity } from "@/server/services/entities";
import { applyEventEffects, createEvent } from "@/server/services/events";
import { approveChangeSet } from "@/server/services/review";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function approveAccepted(userId: string, campaignId: string, changeSetId: string) {
  await prisma.changeOperation.updateMany({
    where: { changeSetId, decision: "PENDING" },
    data: { decision: "ACCEPTED" },
  });
  return approveChangeSet(userId, campaignId, changeSetId);
}

async function makeCrawler(userId: string, campaignId: string, name: string) {
  return createCrawler(userId, campaignId, {
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
}

async function makeFloor(
  userId: string,
  campaignId: string,
  floorNumber: number,
  extra: { startDay?: number; collapseDay?: number } = {},
) {
  return createGenericEntity(userId, campaignId, {
    type: "FLOOR",
    name: `Floor ${floorNumber}`,
    summary: "",
    description: "",
    visibility: "DM_ONLY",
    tags: [],
    floorNumber,
    ...extra,
  } as Parameters<typeof createGenericEntity>[2]);
}

// A collapse event: anchored to a floor on a resolvable absolute day, carrying a
// single COLLAPSE_FLOOR effect (which needs no crawler target).
async function collapseEvent(
  userId: string,
  campaignId: string,
  carlId: string,
  time: Partial<Pick<CreateEventInput, "basis" | "floor" | "offset" | "unit">>,
) {
  return createEvent(userId, campaignId, {
    title: "The floor falls",
    secret: false,
    participants: [{ entityId: carlId, role: "ACTOR" }],
    effects: [{ kind: "COLLAPSE_FLOOR" }],
    ...time,
  } as CreateEventInput);
}

beforeEach(async () => {
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.crawler.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("COLLAPSE_FLOOR effect validation", () => {
  it("accepts a collapse effect with no target/stat", () => {
    const parsed = eventEffectSchema.safeParse({ kind: "COLLAPSE_FLOOR" });
    expect(parsed.success).toBe(true);
  });

  it("still requires a target for crawler-stat kinds", () => {
    const parsed = eventEffectSchema.safeParse({ kind: "ADJUST_STAT", stat: "gold", delta: 5 });
    expect(parsed.success).toBe(false);
  });
});

describe("floor collapse effect", () => {
  async function setup(email: string) {
    const owner = await makeUser(email);
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeCrawler(owner.id, campaign.id, "Carl");
    return { owner, campaign, carl };
  }

  async function floorsByNumber(campaignId: string) {
    const rows = await prisma.entity.findMany({
      where: { campaignId, type: "FLOOR" },
      select: { id: true, data: true },
    });
    return new Map(rows.map((row) => [readFloorData(row.data).floorNumber, row]));
  }

  it("auto-creates the current and next floor, opening the next the same day, and advances current floor", async () => {
    const { owner, campaign, carl } = await setup("collapse-autocreate@test.com");
    const event = await collapseEvent(owner.id, campaign.id, carl.id, {
      basis: "ABSOLUTE_DAY",
      floor: 1,
      offset: 10,
    });

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await approveAccepted(owner.id, campaign.id, result.changeSetId);

    const floors = await floorsByNumber(campaign.id);
    expect(readFloorData(floors.get(1)!.data).collapseDay).toBe(10);
    expect(readFloorData(floors.get(2)!.data).startDay).toBe(10);

    const updated = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: { currentFloorId: true },
    });
    expect(updated?.currentFloorId).toBe(floors.get(2)!.id);
  });

  it("closes/opens existing floors in place without creating duplicates", async () => {
    const { owner, campaign, carl } = await setup("collapse-existing@test.com");
    await makeFloor(owner.id, campaign.id, 1, { startDay: 1 });
    const floor2 = await makeFloor(owner.id, campaign.id, 2);

    const event = await collapseEvent(owner.id, campaign.id, carl.id, {
      basis: "ABSOLUTE_DAY",
      floor: 1,
      offset: 12,
    });
    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await approveAccepted(owner.id, campaign.id, result.changeSetId);

    const floors = await floorsByNumber(campaign.id);
    expect(floors.size).toBe(2); // no duplicates created
    expect(readFloorData(floors.get(1)!.data).collapseDay).toBe(12);
    expect(readFloorData(floors.get(2)!.data).startDay).toBe(12);

    const updated = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: { currentFloorId: true },
    });
    expect(updated?.currentFloorId).toBe(floor2.id);
  });

  it("rejects at apply time (before queuing) when the in-game day can't be resolved", async () => {
    const { owner, campaign, carl } = await setup("collapse-noday@test.com");
    // Floor 5 FLOOR_START with no floor-5 anchor entity ⇒ day is unresolvable.
    const event = await collapseEvent(owner.id, campaign.id, carl.id, {
      basis: "FLOOR_START",
      floor: 5,
      offset: 2,
      unit: "DAY",
    });
    const before = await prisma.changeSet.count({ where: { campaignId: campaign.id } });
    await expect(applyEventEffects(owner.id, campaign.id, event.id)).rejects.toThrow(
      /in-game day can't be resolved/,
    );
    // Nothing was queued — the DM is told inline, not after an approve failure.
    const after = await prisma.changeSet.count({ where: { campaignId: campaign.id } });
    expect(after).toBe(before);
  });

  it("rejects at apply time when the event isn't anchored to a floor", async () => {
    const { owner, campaign, carl } = await setup("collapse-nofloor@test.com");
    const event = await collapseEvent(owner.id, campaign.id, carl.id, {
      basis: "UNSCHEDULED",
    });
    const before = await prisma.changeSet.count({ where: { campaignId: campaign.id } });
    await expect(applyEventEffects(owner.id, campaign.id, event.id)).rejects.toThrow(
      /isn't on a floor/,
    );
    const after = await prisma.changeSet.count({ where: { campaignId: campaign.id } });
    expect(after).toBe(before);
  });
});
