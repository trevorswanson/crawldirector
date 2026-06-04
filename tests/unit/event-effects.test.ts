import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Prisma, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createCrawler, createGenericEntity } from "@/server/services/entities";
import {
  applyEventEffects,
  createEvent,
  listCampaignTimeline,
  listEventsForEntity,
  updateEvent,
} from "@/server/services/events";
import {
  approveChangeSet,
  listPendingChangeSetsForUser,
  rejectChangeSet,
  reopenChangeSet,
  setChangeOperationDecision,
  setEntityLock,
  supersedeChangeSet,
} from "@/server/services/review";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function approveAcceptedChangeSet(
  userId: string,
  campaignId: string,
  changeSetId: string,
) {
  await prisma.changeOperation.updateMany({
    where: { changeSetId, decision: "PENDING" },
    data: { decision: "ACCEPTED" },
  });
  return approveChangeSet(userId, campaignId, changeSetId);
}

async function makeCrawler(
  userId: string,
  campaignId: string,
  name: string,
  overrides: Partial<{
    gold: number;
    hp: number;
    level: number;
    currentFloor: number;
    isAlive: boolean;
  }> = {},
) {
  return createCrawler(userId, campaignId, {
    name,
    summary: "",
    description: "",
    visibility: "DM_ONLY",
    tags: [],
    gold: 100,
    viewCount: BigInt(0),
    followerCount: BigInt(0),
    favoriteCount: BigInt(0),
    killCount: 0,
    level: 3,
    isAlive: true,
    ...overrides,
  });
}

// Declare an effect on an event via the edit path (effects live on the event).
async function declareEffect(
  userId: string,
  campaignId: string,
  eventId: string,
  effects: {
    kind: "ADJUST_STAT" | "SET_STAT" | "SET_ALIVE";
    targetEntityId: string;
    stat?: "gold" | "hp" | "mp" | "level" | "killCount" | "currentFloor";
    delta?: number;
    valueNumber?: number;
    value?: boolean;
    note?: string;
  }[],
  options?: { applyEffects?: boolean },
) {
  return updateEvent(userId, campaignId, eventId, {
    title: "Event",
    secret: false,
    effects,
  }, options);
}

beforeEach(async () => {
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.relationship.deleteMany();
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

describe("event effects", () => {
  async function setup(email: string) {
    const owner = await makeUser(email);
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeCrawler(owner.id, campaign.id, "Carl", { gold: 100 });
    const event = await createEvent(owner.id, campaign.id, {
      title: "Loot drop",
      floor: 9,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    return { owner, campaign, carl, event };
  }

  it("declares effects on an event (unapplied, with provenance once applied)", async () => {
    const { owner, campaign, carl, event } = await setup("declare@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500, note: "Boss loot" },
    ]);

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects).toHaveLength(1);
    expect(timeline[0].effects[0]).toMatchObject({
      kind: "ADJUST_STAT",
      targetId: carl.id,
      stat: "gold",
      delta: 500,
      note: "Boss loot",
      applied: false,
    });
    // Canon unchanged until applied.
    const before = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(before?.gold).toBe(100);
  });

  it("creates a pending review proposal for unapplied effects instead of mutating canon", async () => {
    const { owner, campaign, carl, event } = await setup("apply-stat@test.com");
    const beforeVersion = (await prisma.entity.findUnique({ where: { id: carl.id } }))?.version;
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    expect(result.affectedEntityIds).toContain(carl.id);

    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.gold).toBe(100);
    const entity = await prisma.entity.findUnique({ where: { id: carl.id } });
    expect(entity?.version).toBe(beforeVersion);

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects[0]).toMatchObject({
      applied: false,
      reviewStatus: "PENDING",
      pendingChangeSetId: result.changeSetId,
    });
    await expect(applyEventEffects(owner.id, campaign.id, event.id)).rejects.toThrow(
      ServiceError,
    );

    const queue = await listPendingChangeSetsForUser(owner.id, campaign.id);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: result.changeSetId,
      title: "Apply event effects",
      operations: [
        {
          op: "APPLY_EVENT_EFFECTS",
          targetType: "EVENT",
          targetId: event.id,
          targetLabel: "Event",
          targetEntityType: "EVENT",
        },
      ],
    });
    expect(queue[0].operations[0].patch).toMatchObject({
      effects: {
        to: [
          {
            kind: "ADJUST_STAT",
            targetEntityId: carl.id,
            stat: "gold",
            delta: 500,
          },
        ],
      },
    });
  });

  it("ignores malformed stored effect rows when submitting valid effects for review", async () => {
    const { owner, campaign, carl, event } = await setup("malformed-effects@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);
    const stored = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { effects: true },
    });
    await prisma.event.update({
      where: { id: event.id },
      data: {
        effects: [
          null,
          "not an effect",
          { id: "missing-target", kind: "ADJUST_STAT" },
          ...(stored.effects as Prisma.JsonArray),
        ] as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    const result = await applyEventEffects(owner.id, campaign.id, event.id);

    const queue = await listPendingChangeSetsForUser(owner.id, campaign.id);
    expect(queue).toHaveLength(1);
    expect((queue[0].operations[0].patch as { effects: { to: unknown[] } }).effects.to)
      .toHaveLength(1);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects).toHaveLength(1);
    expect(timeline[0].effects[0]).toMatchObject({
      pendingChangeSetId: result.changeSetId,
      reviewStatus: "PENDING",
    });
  });

  it("applies queued event effects when the review proposal is approved", async () => {
    const { owner, campaign, carl, event } = await setup("approve-effects@test.com");
    const beforeVersion = (await prisma.entity.findUnique({ where: { id: carl.id } }))?.version;
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await approveAcceptedChangeSet(owner.id, campaign.id, result.changeSetId);

    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.gold).toBe(600);
    const entity = await prisma.entity.findUnique({ where: { id: carl.id } });
    expect(entity?.version).toBe((beforeVersion ?? 0) + 1);

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects[0]).toMatchObject({
      applied: true,
      reviewStatus: "APPLIED",
      appliedChangeSetId: result.changeSetId,
    });

    await expect(applyEventEffects(owner.id, campaign.id, event.id)).rejects.toThrow(
      ServiceError,
    );

    const prov = await prisma.provenance.findMany({
      where: { entityId: carl.id, field: "crawler.gold" },
    });
    expect(prov.length).toBeGreaterThan(0);
  });

  it("applies edited queued effect rows from the review proposal", async () => {
    const { owner, campaign, carl, event } = await setup("edit-effects@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    const queue = await listPendingChangeSetsForUser(owner.id, campaign.id);
    const proposedEffects = (queue[0].operations[0].patch as {
      effects: { to: Record<string, unknown>[] };
    }).effects.to;
    await setChangeOperationDecision(
      owner.id,
      campaign.id,
      result.changeSetId,
      result.operationId,
      {
        decision: "EDITED",
        editedPatch: {
          effects: {
            to: proposedEffects.map((effect) => ({ ...effect, delta: 50 })),
          },
        },
      },
    );

    await approveAcceptedChangeSet(owner.id, campaign.id, result.changeSetId);

    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.gold).toBe(150);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects[0]).toMatchObject({
      applied: true,
      delta: 50,
      reviewStatus: "APPLIED",
    });
  });

  it("surfaces locked effect targets as blocked before approval", async () => {
    const { owner, campaign, carl, event } = await setup("locked-pending@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await setEntityLock(owner.id, campaign.id, carl.id, { locked: true });

    const queue = await listPendingChangeSetsForUser(owner.id, campaign.id);
    expect(queue[0].operations[0]).toMatchObject({
      id: result.operationId,
      blockedByLock: true,
      isStale: false,
    });
    await expect(approveAcceptedChangeSet(owner.id, campaign.id, result.changeSetId)).rejects.toThrow(
      /blocked by locks/i,
    );
  });

  it("rejects malformed edited effect patches instead of applying all pending effects", async () => {
    const { owner, campaign, carl, event } = await setup("bad-edit-effects@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await setChangeOperationDecision(
      owner.id,
      campaign.id,
      result.changeSetId,
      result.operationId,
      {
        decision: "EDITED",
        editedPatch: {
          effects: { to: [] },
        },
      },
    );

    await expect(approveAcceptedChangeSet(owner.id, campaign.id, result.changeSetId)).rejects.toThrow(
      /effect review patch/i,
    );
    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.gold).toBe(100);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects[0]).toMatchObject({
      applied: false,
      reviewStatus: "PENDING",
    });
  });

  it("does not approve replacement effect rows that reused the queued effect id", async () => {
    const { owner, campaign, carl, event } = await setup("stale-effect-id@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);
    const effectId = (await listEventsForEntity(owner.id, campaign.id, carl.id))[0].effects[0].id;

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await updateEvent(owner.id, campaign.id, event.id, {
      title: "Event",
      secret: false,
      effects: [
        {
          id: effectId,
          kind: "ADJUST_STAT",
          targetEntityId: carl.id,
          stat: "gold",
          delta: 50,
        },
      ],
    });

    await expect(approveAcceptedChangeSet(owner.id, campaign.id, result.changeSetId)).rejects.toThrow(
      /stale/i,
    );
    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.gold).toBe(100);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects[0]).toMatchObject({
      id: effectId,
      applied: false,
      delta: 50,
      reviewStatus: null,
      pendingChangeSetId: null,
    });
  });

  it("marks rejected effect proposals as reviewed without mutating canon", async () => {
    const { owner, campaign, carl, event } = await setup("reject-effects@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await rejectChangeSet(owner.id, campaign.id, result.changeSetId);

    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.gold).toBe(100);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects[0]).toMatchObject({
      applied: false,
      reviewStatus: "REJECTED",
      pendingChangeSetId: null,
      pendingOperationId: null,
    });
    await expect(applyEventEffects(owner.id, campaign.id, event.id)).rejects.toThrow(
      /no effects left/i,
    );
  });

  it("restores rejected effect rows when their proposal is reopened", async () => {
    const { owner, campaign, carl, event } = await setup("reopen-effects@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await rejectChangeSet(owner.id, campaign.id, result.changeSetId);
    await reopenChangeSet(owner.id, campaign.id, result.changeSetId);

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects[0]).toMatchObject({
      applied: false,
      reviewStatus: "PENDING",
      pendingChangeSetId: result.changeSetId,
    });
    const pending = await listPendingChangeSetsForUser(owner.id, campaign.id);
    expect(pending.map((changeSet) => changeSet.id)).toContain(result.changeSetId);
  });

  it("marks superseded effect proposals as reviewed without mutating canon", async () => {
    const { owner, campaign, carl, event } = await setup("supersede-effects@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await supersedeChangeSet(owner.id, campaign.id, result.changeSetId);

    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.gold).toBe(100);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects[0]).toMatchObject({
      applied: false,
      reviewStatus: "SUPERSEDED",
      pendingChangeSetId: null,
      pendingOperationId: null,
    });
  });

  it("auto-applies DM-declared effects and shows effect targets as affected participants", async () => {
    const { owner, campaign, carl, event } = await setup("auto-apply@test.com");
    const donut = await makeCrawler(owner.id, campaign.id, "Donut", { gold: 10 });

    await declareEffect(
      owner.id,
      campaign.id,
      event.id,
      [{ kind: "ADJUST_STAT", targetEntityId: donut.id, stat: "gold", delta: 50 }],
      { applyEffects: true },
    );

    const crawler = await prisma.crawler.findUnique({ where: { id: donut.id } });
    expect(crawler?.gold).toBe(60);

    const donutTimeline = await listEventsForEntity(owner.id, campaign.id, donut.id);
    expect(donutTimeline.map((item) => item.id)).toContain(event.id);
    const affectedEvent = donutTimeline.find((item) => item.id === event.id);
    expect(affectedEvent?.selfRoles).toContain("AFFECTED");

    const carlTimeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(carlTimeline[0].effects[0].applied).toBe(true);
  });

  it("sets a nullable crawler stat without requiring an existing value", async () => {
    const { owner, campaign, carl, event } = await setup("set-nullable@test.com");
    await prisma.crawler.update({
      where: { id: carl.id },
      data: { currentFloor: null },
    });

    await declareEffect(
      owner.id,
      campaign.id,
      event.id,
      [{ kind: "SET_STAT", targetEntityId: carl.id, stat: "currentFloor", valueNumber: 1 }],
      { applyEffects: true },
    );

    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.currentFloor).toBe(1);
  });

  it("clamps an ADJUST_STAT result at its floor (gold never negative)", async () => {
    const { owner, campaign, carl, event } = await setup("clamp@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: -9999 },
    ]);
    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await approveAcceptedChangeSet(owner.id, campaign.id, result.changeSetId);
    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.gold).toBe(0);
  });

  it("applies SET_ALIVE to flip the crawler's alive flag (a death)", async () => {
    const { owner, campaign, carl, event } = await setup("death@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "SET_ALIVE", targetEntityId: carl.id, value: false, note: "Killed by Sledge" },
    ]);
    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await approveAcceptedChangeSet(owner.id, campaign.id, result.changeSetId);
    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.isAlive).toBe(false);
  });

  it("blocks applying effects when the target crawler is locked (atomic)", async () => {
    const { owner, campaign, carl, event } = await setup("locked@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);
    await setEntityLock(owner.id, campaign.id, carl.id, { locked: true });

    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await expect(approveAcceptedChangeSet(owner.id, campaign.id, result.changeSetId)).rejects.toThrow(
      ServiceError,
    );
    // Canon unchanged and the effect stays pending (no partial apply).
    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.gold).toBe(100);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects[0].applied).toBe(false);
  });

  it("rejects declaring an effect against a non-crawler target", async () => {
    const { owner, campaign, event } = await setup("noncrawler@test.com");
    const npc = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Mordecai",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await expect(
      declareEffect(owner.id, campaign.id, event.id, [
        { kind: "ADJUST_STAT", targetEntityId: npc.id, stat: "gold", delta: 10 },
      ]),
    ).rejects.toThrow(ServiceError);
  });

  it("preserves applied effects when editing the unapplied set", async () => {
    const { owner, campaign, carl, event } = await setup("preserve@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);
    const result = await applyEventEffects(owner.id, campaign.id, event.id);
    await approveAcceptedChangeSet(owner.id, campaign.id, result.changeSetId);

    // Edit: add a new (unapplied) effect; the applied one must survive.
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "level", delta: 1 },
    ]);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects).toHaveLength(2);
    const applied = timeline[0].effects.filter((e) => e.applied);
    const pending = timeline[0].effects.filter((e) => !e.applied);
    expect(applied).toHaveLength(1);
    expect(applied[0].stat).toBe("gold");
    expect(pending).toHaveLength(1);
    expect(pending[0].stat).toBe("level");
  });

  it("hides effects from players in both timelines", async () => {
    const { owner, campaign, carl, event } = await setup("player@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);
    // Make the crawler player-visible so the player sees the event but never
    // its effects.
    await prisma.entity.update({
      where: { id: carl.id },
      data: { visibility: "SHARED_WITH_PLAYERS" },
    });

    const player = await makeUser("p@test.com");
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    const entityTimeline = await listEventsForEntity(player.id, campaign.id, carl.id);
    expect(entityTimeline.length).toBeGreaterThan(0);
    expect(entityTimeline[0].effects).toEqual([]);

    const campaignTimeline = await listCampaignTimeline(player.id, campaign.id);
    expect(campaignTimeline.length).toBeGreaterThan(0);
    expect(campaignTimeline.every((e) => e.effects.length === 0)).toBe(true);
  });

  it("denies applying effects to non-DM members", async () => {
    const { owner, campaign, carl, event } = await setup("deny@test.com");
    await declareEffect(owner.id, campaign.id, event.id, [
      { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 500 },
    ]);
    const player = await makeUser("player-deny@test.com");
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    await expect(applyEventEffects(player.id, campaign.id, event.id)).rejects.toThrow(
      ServiceError,
    );
  });
});
