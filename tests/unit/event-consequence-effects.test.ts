import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  ChangeSource,
  EntityType,
  EventParticipantRole,
  OpDecision,
  Prisma,
  Visibility,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { archiveEntity, createCrawler } from "@/server/services/entities";
import { applyEventEffects, archiveEvent, createEvent, updateEvent } from "@/server/services/events";
import {
  applyAutoApprovedEntityChangeSet,
  applyAutoApprovedPersonaSnapshotChangeSet,
  approveChangeSet,
  createPendingEventChangeSet,
  listPendingChangeSetsForUser,
  rejectChangeSet,
  setChangeOperationDecision,
  setEntityLock,
  type ReviewPatch,
} from "@/server/services/review";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

beforeEach(async () => {
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.eventCausality.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.personaSnapshot.deleteMany();
  await prisma.event.deleteMany();
  await prisma.relationship.deleteMany();
  await prisma.crawler.deleteMany();
  await prisma.faction.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup(email: string) {
  const owner = await makeUser(email);
  const campaign = await createCampaign(owner.id, { name: "Dungeon" });
  const crawler = await createCrawler(owner.id, campaign.id, {
    name: "Carl",
    summary: "",
    description: "",
    visibility: Visibility.DM_ONLY,
    tags: [],
    level: 1,
    gold: 100,
    viewCount: BigInt(0),
    followerCount: BigInt(0),
    favoriteCount: BigInt(0),
    killCount: 0,
    isAlive: true,
  });
  const event = await createEvent(owner.id, campaign.id, {
    title: "The hunters enter the arena",
    summary: "Carl has to run.",
    floor: 3,
    secret: false,
    participants: [{ entityId: crawler.id, role: EventParticipantRole.ACTOR }],
  });
  return { owner, campaign, crawler, event };
}

async function createAiEffectProposal(
  userId: string,
  campaignId: string,
  eventId: string,
  effects: unknown[],
) {
  const changeSet = await createPendingEventChangeSet(userId, campaignId, {
    source: ChangeSource.AI,
    title: "AI consequence proposal",
    operations: [
      {
        op: "APPLY_EVENT_EFFECTS",
        targetId: eventId,
        patch: { effects: { to: effects as ReviewPatch[string]["to"] } },
      },
    ],
  });
  const operation = changeSet.operations[0];
  if (!operation) throw new Error("Expected an effect review operation.");
  return { changeSet, operation };
}

async function acceptAndApprove(
  userId: string,
  campaignId: string,
  changeSetId: string,
  operationId: string,
) {
  await setChangeOperationDecision(userId, campaignId, changeSetId, operationId, {
    decision: OpDecision.ACCEPTED,
  });
  return approveChangeSet(userId, campaignId, changeSetId);
}

async function makeSystemWithActivePersona(userId: string, campaignId: string) {
  const created = await applyAutoApprovedEntityChangeSet(userId, campaignId, {
    title: "Create the System",
    operations: [
      {
        op: "CREATE_ENTITY",
        patch: {
          type: { to: EntityType.SYSTEM_AI },
          name: { to: "The System" },
          summary: { to: "Dungeon AI" },
          description: { to: "" },
          visibility: { to: Visibility.DM_ONLY },
          tags: { to: [] },
        },
      },
    ],
  });
  const systemId = created.targetIds[0]!;
  await applyAutoApprovedPersonaSnapshotChangeSet(userId, campaignId, {
    title: "Author System persona",
    operations: [
      {
        op: "CREATE_PERSONA_SNAPSHOT",
        patch: {
          entityId: { to: systemId },
          label: { to: "Broadcast Host" },
          dials: {
            to: {
              sentience: 60,
              compliance: 10,
              volatility: 40,
              benevolence: -10,
              resentment: 25,
              theatricality: 75,
            },
          },
          values: { to: [] },
          agendas: { to: [] },
          resources: { to: {} },
          knowledgeScope: { to: "OMNISCIENT" },
          voiceGuide: { to: "Cruelly enthusiastic." },
          constraints: { to: "" },
          isActive: { to: true },
        },
      },
    ],
  });
  return systemId;
}

describe("AI patch-carried event effects", () => {
  it("applies a generated crawler effect only after the DM accepts its AI proposal", async () => {
    const { owner, campaign, crawler, event } = await setup("generated-crawler@test.com");
    const effectId = "generated-crawler-effect";
    const { changeSet, operation } = await createAiEffectProposal(owner.id, campaign.id, event.id, [
      {
        id: effectId,
        kind: "ADJUST_STAT",
        targetEntityId: crawler.id,
        stat: "gold",
        delta: 25,
      },
    ]);

    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).effects).toEqual([]);
    await acceptAndApprove(owner.id, campaign.id, changeSet.id, operation.id);

    await expect(prisma.crawler.findUniqueOrThrow({ where: { id: crawler.id } })).resolves.toMatchObject({
      gold: 125,
    });
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.effects).toEqual([
      expect.objectContaining({
        id: effectId,
        kind: "ADJUST_STAT",
        applied: true,
        appliedChangeSetId: changeSet.id,
        reviewStatus: "APPLIED",
      }),
    ]);
    await expect(
      prisma.eventParticipant.findFirst({
        where: { eventId: event.id, entityId: crawler.id, role: EventParticipantRole.AFFECTED },
      }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.provenance.findFirst({
        where: {
          eventId: event.id,
          changeSetId: changeSet.id,
          source: ChangeSource.AI,
          field: "effects",
        },
      }),
    ).resolves.not.toBeNull();
  });

  it("discards a rejected generated effect without writing it to the event or crawler", async () => {
    const { owner, campaign, crawler, event } = await setup("generated-reject@test.com");
    const { changeSet } = await createAiEffectProposal(owner.id, campaign.id, event.id, [
      {
        id: "rejected-generated-effect",
        kind: "ADJUST_STAT",
        targetEntityId: crawler.id,
        stat: "gold",
        delta: 25,
      },
    ]);

    await rejectChangeSet(owner.id, campaign.id, changeSet.id);

    await expect(prisma.crawler.findUniqueOrThrow({ where: { id: crawler.id } })).resolves.toMatchObject({
      gold: 100,
    });
    await expect(prisma.event.findUniqueOrThrow({ where: { id: event.id } })).resolves.toMatchObject({
      effects: [],
    });
  });

  it("applies a duplicated generated effect id once", async () => {
    const { owner, campaign, crawler, event } = await setup("generated-duplicate@test.com");
    const { changeSet, operation } = await createAiEffectProposal(owner.id, campaign.id, event.id, [
      {
        id: "duplicated-generated-effect",
        kind: "ADJUST_STAT",
        targetEntityId: crawler.id,
        stat: "gold",
        delta: 25,
      },
      {
        id: "duplicated-generated-effect",
        kind: "ADJUST_STAT",
        targetEntityId: crawler.id,
        stat: "gold",
        delta: 50,
      },
    ]);

    await acceptAndApprove(owner.id, campaign.id, changeSet.id, operation.id);

    await expect(prisma.crawler.findUniqueOrThrow({ where: { id: crawler.id } })).resolves.toMatchObject({
      gold: 125,
    });
    await expect(prisma.event.findUniqueOrThrow({ where: { id: event.id } })).resolves.toMatchObject({
      effects: [expect.objectContaining({ id: "duplicated-generated-effect", delta: 25 })],
    });
  });

  it("applies one stored effect when malformed event data repeats its queued id", async () => {
    const { owner, campaign, crawler, event } = await setup("stored-duplicate@test.com");
    await updateEvent(owner.id, campaign.id, event.id, {
      title: "The hunters enter the arena",
      secret: false,
      effects: [
        {
          id: "stored-duplicate-effect",
          kind: "ADJUST_STAT",
          targetEntityId: crawler.id,
          stat: "gold",
          delta: 25,
        },
      ],
    });
    const submitted = await applyEventEffects(owner.id, campaign.id, event.id);
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    const [effect] = stored.effects as Array<Record<string, unknown>>;
    await prisma.event.update({
      where: { id: event.id },
      data: { effects: [effect, { ...effect }] as Prisma.InputJsonValue },
    });

    await acceptAndApprove(owner.id, campaign.id, submitted.changeSetId, submitted.operationId!);

    await expect(prisma.crawler.findUniqueOrThrow({ where: { id: crawler.id } })).resolves.toMatchObject({
      gold: 125,
    });
    await expect(prisma.event.findUniqueOrThrow({ where: { id: event.id } })).resolves.toMatchObject({
      effects: [
        expect.objectContaining({
          id: "stored-duplicate-effect",
          applied: true,
          reviewStatus: "APPLIED",
        }),
      ],
    });
  });

  it("flags a fractional generated stat delta stale before it can mutate canon", async () => {
    const { owner, campaign, crawler, event } = await setup("generated-fractional@test.com");
    const { changeSet, operation } = await createAiEffectProposal(owner.id, campaign.id, event.id, [
      {
        id: "fractional-generated-effect",
        kind: "ADJUST_STAT",
        targetEntityId: crawler.id,
        stat: "gold",
        delta: 1.5,
      },
    ]);
    await setChangeOperationDecision(owner.id, campaign.id, changeSet.id, operation.id, {
      decision: OpDecision.ACCEPTED,
    });

    await listPendingChangeSetsForUser(owner.id, campaign.id);

    await expect(prisma.changeOperation.findUniqueOrThrow({ where: { id: operation.id } })).resolves.toMatchObject({
      isStale: true,
    });
    await expect(approveChangeSet(owner.id, campaign.id, changeSet.id)).rejects.toThrow(/stale/i);
    await expect(prisma.crawler.findUniqueOrThrow({ where: { id: crawler.id } })).resolves.toMatchObject({
      gold: 100,
    });
    await expect(prisma.event.findUniqueOrThrow({ where: { id: event.id } })).resolves.toMatchObject({
      effects: [],
    });
  });

  it("flags an unknown generated persona dial stale before it can mutate canon", async () => {
    const { owner, campaign, event } = await setup("generated-unknown-dial@test.com");
    const systemId = await makeSystemWithActivePersona(owner.id, campaign.id);
    const { changeSet, operation } = await createAiEffectProposal(owner.id, campaign.id, event.id, [
      {
        id: "unknown-dial-generated-effect",
        kind: "PERSONA_SHIFT",
        targetEntityId: systemId,
        dialShifts: { resentment: 10, definitelyNotADial: 15 },
      },
    ]);
    await setChangeOperationDecision(owner.id, campaign.id, changeSet.id, operation.id, {
      decision: OpDecision.ACCEPTED,
    });

    await listPendingChangeSetsForUser(owner.id, campaign.id);

    await expect(prisma.changeOperation.findUniqueOrThrow({ where: { id: operation.id } })).resolves.toMatchObject({
      isStale: true,
    });
    await expect(approveChangeSet(owner.id, campaign.id, changeSet.id)).rejects.toThrow(/stale/i);
    await expect(
      prisma.personaSnapshot.findMany({ where: { campaignId: campaign.id, entityId: systemId } }),
    ).resolves.toHaveLength(1);
    await expect(prisma.event.findUniqueOrThrow({ where: { id: event.id } })).resolves.toMatchObject({
      effects: [],
    });
  });

  it("materializes an approved generated persona shift with AI change-set provenance", async () => {
    const { owner, campaign, event } = await setup("generated-persona@test.com");
    const systemId = await makeSystemWithActivePersona(owner.id, campaign.id);
    const { changeSet, operation } = await createAiEffectProposal(owner.id, campaign.id, event.id, [
      {
        id: "generated-persona-effect",
        kind: "PERSONA_SHIFT",
        targetEntityId: systemId,
        dialShifts: { resentment: 20 },
        note: "The ratings turn ugly.",
      },
    ]);

    await acceptAndApprove(owner.id, campaign.id, changeSet.id, operation.id);

    const snapshots = await prisma.personaSnapshot.findMany({
      where: { campaignId: campaign.id, entityId: systemId },
      orderBy: { createdAt: "asc" },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ isActive: false });
    expect(snapshots[1]).toMatchObject({
      isActive: true,
      source: ChangeSource.AI,
      label: "The ratings turn ugly.",
      dials: expect.objectContaining({ resentment: 45 }),
    });
    await expect(
      prisma.provenance.findFirst({
        where: { personaSnapshotId: snapshots[1]!.id, changeSetId: changeSet.id, source: ChangeSource.AI },
      }),
    ).resolves.not.toBeNull();
  });

  it("flags a generated crawler effect blocked when its target is locked", async () => {
    const { owner, campaign, crawler, event } = await setup("generated-crawler-lock@test.com");
    const { changeSet, operation } = await createAiEffectProposal(owner.id, campaign.id, event.id, [
      {
        id: "locked-generated-crawler-effect",
        kind: "ADJUST_STAT",
        targetEntityId: crawler.id,
        stat: "gold",
        delta: 25,
      },
    ]);
    await setEntityLock(owner.id, campaign.id, crawler.id, { locked: true });

    await listPendingChangeSetsForUser(owner.id, campaign.id);

    await expect(prisma.changeOperation.findUniqueOrThrow({ where: { id: operation.id } })).resolves.toMatchObject({
      changeSetId: changeSet.id,
      blockedByLock: true,
      isStale: false,
    });
  });

  it("flags a generated persona shift blocked when its active persona is locked", async () => {
    const { owner, campaign, event } = await setup("generated-persona-lock@test.com");
    const systemId = await makeSystemWithActivePersona(owner.id, campaign.id);
    const { operation } = await createAiEffectProposal(owner.id, campaign.id, event.id, [
      {
        id: "locked-generated-persona-effect",
        kind: "PERSONA_SHIFT",
        targetEntityId: systemId,
        dialShifts: { theatricality: 10 },
      },
    ]);
    await prisma.personaSnapshot.updateMany({
      where: { campaignId: campaign.id, entityId: systemId, isActive: true },
      data: { locked: true },
    });

    await listPendingChangeSetsForUser(owner.id, campaign.id);

    await expect(prisma.changeOperation.findUniqueOrThrow({ where: { id: operation.id } })).resolves.toMatchObject({
      blockedByLock: true,
      isStale: false,
    });
  });

  it("flags a generated effect stale when its source event is archived", async () => {
    const { owner, campaign, crawler, event } = await setup("generated-event-stale@test.com");
    const { operation } = await createAiEffectProposal(owner.id, campaign.id, event.id, [
      {
        id: "stale-event-generated-effect",
        kind: "ADJUST_STAT",
        targetEntityId: crawler.id,
        stat: "gold",
        delta: 25,
      },
    ]);
    await archiveEvent(owner.id, campaign.id, event.id);

    await listPendingChangeSetsForUser(owner.id, campaign.id);

    await expect(prisma.changeOperation.findUniqueOrThrow({ where: { id: operation.id } })).resolves.toMatchObject({
      blockedByLock: false,
      isStale: true,
    });
  });

  it("flags a generated effect stale when its target is no longer canon", async () => {
    const { owner, campaign, crawler, event } = await setup("generated-target-stale@test.com");
    const { operation } = await createAiEffectProposal(owner.id, campaign.id, event.id, [
      {
        id: "stale-target-generated-effect",
        kind: "ADJUST_STAT",
        targetEntityId: crawler.id,
        stat: "gold",
        delta: 25,
      },
    ]);
    await archiveEntity(owner.id, campaign.id, crawler.id);

    await listPendingChangeSetsForUser(owner.id, campaign.id);

    await expect(prisma.changeOperation.findUniqueOrThrow({ where: { id: operation.id } })).resolves.toMatchObject({
      blockedByLock: false,
      isStale: true,
    });
  });
});
