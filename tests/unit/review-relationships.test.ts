import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CanonStatus, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createGenericEntity } from "@/server/services/entities";
import {
  createRelationship,
  setRelationshipLock,
} from "@/server/services/relationships";
import {
  approveChangeSet,
  createPendingRelationshipChangeSet,
  listPendingChangeSetsForUser,
  rejectChangeSet,
  setChangeOperationDecision,
  setEntityLock,
} from "@/server/services/review";

function makeUser(email: string, name?: string) {
  return prisma.user.create({ data: { email, name } });
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

async function makeEntity(userId: string, campaignId: string, name: string) {
  return createGenericEntity(userId, campaignId, {
    type: "NPC",
    name,
    summary: "",
    description: "",
    visibility: "DM_ONLY",
    tags: [],
  });
}

async function seed() {
  const dm = await makeUser("owner@test.com", "Owner DM");
  const campaign = await createCampaign(dm.id, { name: "Dungeon" });
  const carl = await makeEntity(dm.id, campaign.id, "Carl");
  const donut = await makeEntity(dm.id, campaign.id, "Donut");
  return { dmId: dm.id, campaignId: campaign.id, carlId: carl.id, donutId: donut.id };
}

beforeEach(async () => {
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
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

describe("pending relationship proposals", () => {
  it("approves a pending CREATE_RELATIONSHIP into a canon edge with provenance + source", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();

    const set = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI inferred connection",
      operations: [
        {
          op: "CREATE_RELATIONSHIP",
          patch: {
            type: { to: "ALLY_OF" },
            sourceId: { to: carlId },
            targetId: { to: donutId },
            disposition: { to: 70 },
            notes: { to: "Crawl partners" },
            secret: { to: false },
          },
        },
      ],
    });
    expect(set.status).toBe("PENDING");

    // Nothing applied while pending.
    expect(await prisma.relationship.count()).toBe(0);

    await approveAcceptedChangeSet(dmId, campaignId, set.id);

    const edge = await prisma.relationship.findFirstOrThrow({
      where: { campaignId },
    });
    expect(edge.type).toBe("ALLY_OF");
    expect(edge.sourceId).toBe(carlId);
    expect(edge.targetId).toBe(donutId);
    expect(edge.disposition).toBe(70);
    expect(edge.notes).toBe("Crawl partners");
    expect(edge.status).toBe(CanonStatus.CANON);
    expect(edge.source).toBe("AI");

    const provenance = await prisma.provenance.findMany({
      where: { relationshipId: edge.id },
    });
    expect(provenance.length).toBeGreaterThan(0);
  });

  it("surfaces the edge label, type, and current values in the review queue", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    const edge = await createRelationship(dmId, campaignId, carlId, {
      type: "ALLY_OF",
      targetId: donutId,
      disposition: 40,
      notes: "Old note",
      secret: false,
    });
    const live = await prisma.relationship.findUniqueOrThrow({
      where: { id: edge.id },
    });

    await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI re-typed the edge",
      operations: [
        {
          op: "UPDATE_RELATIONSHIP",
          targetId: edge.id,
          patch: {
            _baseVersion: { to: live.version },
            type: { to: "RIVAL_OF" },
            disposition: { to: -30 },
            notes: { to: "Now rivals" },
            secret: { to: true },
          },
        },
      ],
    });

    const [queued] = await listPendingChangeSetsForUser(dmId, campaignId);
    const op = queued.operations[0];
    expect(op.targetLabel).toBe("Carl → Donut");
    expect(op.targetEntityType).toBe("ALLY_OF");
    expect(op.currentValues).toMatchObject({
      type: "ALLY_OF",
      disposition: 40,
      notes: "Old note",
      secret: false,
    });
    expect(op.blockedByLock).toBe(false);
    expect(op.isStale).toBe(false);
  });

  it("marks AI relationship creates blocked when either endpoint entity is locked", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    await setEntityLock(dmId, campaignId, donutId, { locked: true });

    const set = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI inferred locked endpoint",
      operations: [
        {
          op: "CREATE_RELATIONSHIP",
          patch: {
            type: { to: "ALLY_OF" },
            sourceId: { to: carlId },
            targetId: { to: donutId },
            secret: { to: false },
          },
        },
      ],
    });

    const op = await prisma.changeOperation.findFirstOrThrow({ where: { changeSetId: set.id } });
    expect(op.blockedByLock).toBe(true);

    await prisma.changeOperation.update({
      where: { id: op.id },
      data: { decision: "ACCEPTED" },
    });
    await expect(approveChangeSet(dmId, campaignId, set.id)).rejects.toThrow(/locked/i);
    expect(await prisma.relationship.count()).toBe(0);
  });

  it("falls back to the edge type for a CREATE label when an endpoint can't be resolved", async () => {
    const { dmId, campaignId, carlId } = await seed();

    await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI inferred an edge to a missing entity",
      operations: [
        {
          op: "CREATE_RELATIONSHIP",
          patch: {
            type: { to: "ENEMY_OF" },
            sourceId: { to: carlId },
            targetId: { to: "missing-entity-id" },
          },
        },
      ],
    });

    const [queued] = await listPendingChangeSetsForUser(dmId, campaignId);
    expect(queued.operations[0].targetLabel).toBe("ENEMY_OF");
    expect(queued.operations[0].targetEntityType).toBe("ENEMY_OF");
  });

  it("applies a pending UPDATE_RELATIONSHIP on approval, bumping the version", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    const edge = await createRelationship(dmId, campaignId, carlId, {
      type: "ALLY_OF",
      targetId: donutId,
      disposition: 40,
      secret: false,
    });
    const before = await prisma.relationship.findUniqueOrThrow({ where: { id: edge.id } });

    const set = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Edit edge",
      operations: [
        {
          op: "UPDATE_RELATIONSHIP",
          targetId: edge.id,
          patch: {
            _baseVersion: { to: before.version },
            secret: { to: true },
            notes: { to: "Now secret" },
          },
        },
      ],
    });
    await approveAcceptedChangeSet(dmId, campaignId, set.id);

    const after = await prisma.relationship.findUniqueOrThrow({ where: { id: edge.id } });
    expect(after.secret).toBe(true);
    expect(after.notes).toBe("Now secret");
    expect(after.version).toBe(before.version + 1);
  });

  it("applies a pending DELETE_RELATIONSHIP on approval by soft-archiving the edge", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    const edge = await createRelationship(dmId, campaignId, carlId, {
      type: "ALLY_OF",
      targetId: donutId,
      secret: false,
    });
    const live = await prisma.relationship.findUniqueOrThrow({ where: { id: edge.id } });

    const set = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "IMPORT",
      title: "Remove edge",
      operations: [
        {
          op: "DELETE_RELATIONSHIP",
          targetId: edge.id,
          patch: { _baseVersion: { to: live.version } },
        },
      ],
    });
    await approveAcceptedChangeSet(dmId, campaignId, set.id);

    const after = await prisma.relationship.findUniqueOrThrow({ where: { id: edge.id } });
    expect(after.status).toBe(CanonStatus.ARCHIVED);
  });

  it("honors an EDITED decision on a pending relationship op", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    const set = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI inferred connection",
      operations: [
        {
          op: "CREATE_RELATIONSHIP",
          patch: {
            type: { to: "ALLY_OF" },
            sourceId: { to: carlId },
            targetId: { to: donutId },
            disposition: { to: 70 },
          },
        },
      ],
    });
    const [queued] = await listPendingChangeSetsForUser(dmId, campaignId);
    const op = queued.operations[0];

    await setChangeOperationDecision(dmId, campaignId, set.id, op.id, {
      decision: "EDITED",
      editedPatch: {
        type: { to: "RIVAL_OF" },
        sourceId: { to: carlId },
        targetId: { to: donutId },
        disposition: { to: -50 },
      },
    });
    await approveAcceptedChangeSet(dmId, campaignId, set.id);

    const edge = await prisma.relationship.findFirstOrThrow({ where: { campaignId } });
    expect(edge.type).toBe("RIVAL_OF");
    expect(edge.disposition).toBe(-50);
  });

  it("rejects invalid membership day bounds from pending CREATE_RELATIONSHIP approval", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();

    const inverted = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI inferred impossible membership",
      operations: [
        {
          op: "CREATE_RELATIONSHIP",
          patch: {
            type: { to: "MEMBER_OF" },
            sourceId: { to: carlId },
            targetId: { to: donutId },
            sinceDay: { to: 20 },
            untilDay: { to: 12 },
          },
        },
      ],
    });

    await expect(
      approveAcceptedChangeSet(dmId, campaignId, inverted.id),
    ).rejects.toThrow(/Since day must be before or equal to until day/i);
    expect(await prisma.relationship.count()).toBe(0);

    const negative = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "IMPORT",
      title: "Imported impossible membership",
      operations: [
        {
          op: "CREATE_RELATIONSHIP",
          patch: {
            type: { to: "MEMBER_OF" },
            sourceId: { to: carlId },
            targetId: { to: donutId },
            sinceDay: { to: -1 },
          },
        },
      ],
    });

    await expect(
      approveAcceptedChangeSet(dmId, campaignId, negative.id),
    ).rejects.toThrow(/Since day cannot be negative/i);
    expect(await prisma.relationship.count()).toBe(0);
  });

  it("rejects invalid membership day bounds from an edited pending relationship proposal", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    const set = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI inferred connection",
      operations: [
        {
          op: "CREATE_RELATIONSHIP",
          patch: {
            type: { to: "MEMBER_OF" },
            sourceId: { to: carlId },
            targetId: { to: donutId },
            sinceDay: { to: 12 },
            untilDay: { to: 40 },
          },
        },
      ],
    });
    const [queued] = await listPendingChangeSetsForUser(dmId, campaignId);
    const op = queued.operations[0];

    await setChangeOperationDecision(dmId, campaignId, set.id, op.id, {
      decision: "EDITED",
      editedPatch: {
        type: { to: "MEMBER_OF" },
        sourceId: { to: carlId },
        targetId: { to: donutId },
        sinceDay: { to: 30 },
        untilDay: { to: 10 },
      },
    });

    await expect(approveChangeSet(dmId, campaignId, set.id)).rejects.toThrow(
      /Since day must be before or equal to until day/i,
    );
    expect(await prisma.relationship.count()).toBe(0);
  });

  it("does not touch canon when a pending relationship proposal is rejected", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    const set = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI inferred connection",
      operations: [
        {
          op: "CREATE_RELATIONSHIP",
          patch: {
            type: { to: "ALLY_OF" },
            sourceId: { to: carlId },
            targetId: { to: donutId },
          },
        },
      ],
    });

    await rejectChangeSet(dmId, campaignId, set.id);

    expect(await prisma.relationship.count()).toBe(0);
    const changeSet = await prisma.changeSet.findUniqueOrThrow({ where: { id: set.id } });
    expect(changeSet.status).toBe("REJECTED");
  });
});

describe("pending relationship lock + staleness flags", () => {
  it("flags an edit to a locked edge as blocked and refuses approval", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    const edge = await createRelationship(dmId, campaignId, carlId, {
      type: "ALLY_OF",
      targetId: donutId,
      secret: false,
    });
    const live = await prisma.relationship.findUniqueOrThrow({ where: { id: edge.id } });

    const set = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Edit edge",
      operations: [
        {
          op: "UPDATE_RELATIONSHIP",
          targetId: edge.id,
          patch: { _baseVersion: { to: live.version }, secret: { to: true } },
        },
      ],
    });

    // Lock the edge after the proposal exists.
    await setRelationshipLock(dmId, campaignId, edge.id, true);

    const [queued] = await listPendingChangeSetsForUser(dmId, campaignId);
    expect(queued.operations[0].blockedByLock).toBe(true);

    await expect(approveAcceptedChangeSet(dmId, campaignId, set.id)).rejects.toThrow(
      /blocked by locks/i,
    );
  });

  it("flags a stale edit (the edge advanced underneath) and refuses approval", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    const edge = await createRelationship(dmId, campaignId, carlId, {
      type: "ALLY_OF",
      targetId: donutId,
      disposition: 10,
      secret: false,
    });
    const live = await prisma.relationship.findUniqueOrThrow({ where: { id: edge.id } });

    const set = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Stale edit",
      operations: [
        {
          op: "UPDATE_RELATIONSHIP",
          targetId: edge.id,
          patch: { _baseVersion: { to: live.version }, disposition: { to: 99 } },
        },
      ],
    });

    // Advance the edge version with a direct DM edit (bumps version).
    await prisma.relationship.update({
      where: { id: edge.id },
      data: { version: { increment: 1 } },
    });

    const [queued] = await listPendingChangeSetsForUser(dmId, campaignId);
    expect(queued.operations[0].isStale).toBe(true);

    await expect(approveAcceptedChangeSet(dmId, campaignId, set.id)).rejects.toThrow(/stale/i);
  });

  it("holds a proposal as stale when the edge is archived underneath", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    const edge = await createRelationship(dmId, campaignId, carlId, {
      type: "ALLY_OF",
      targetId: donutId,
      secret: false,
    });
    const live = await prisma.relationship.findUniqueOrThrow({ where: { id: edge.id } });

    const set = await createPendingRelationshipChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Edit edge",
      operations: [
        {
          op: "UPDATE_RELATIONSHIP",
          targetId: edge.id,
          patch: { _baseVersion: { to: live.version }, secret: { to: true } },
        },
      ],
    });

    await prisma.relationship.update({
      where: { id: edge.id },
      data: { status: CanonStatus.ARCHIVED },
    });

    const [queued] = await listPendingChangeSetsForUser(dmId, campaignId);
    expect(queued.operations[0].isStale).toBe(true);
    expect(set.status).toBe("PENDING");
  });

  it("re-checks the base version in-transaction so a stale delete the flag gate missed is held", async () => {
    const { dmId, campaignId, carlId, donutId } = await seed();
    const edge = await createRelationship(dmId, campaignId, carlId, {
      type: "ALLY_OF",
      targetId: donutId,
      secret: false,
    });
    const live = await prisma.relationship.findUniqueOrThrow({ where: { id: edge.id } });

    // Simulate the TOCTOU window: a pending delete whose patch carries a base
    // version, but with empty changeSet.baseVersions so the pre-flight flag
    // refresh can't flag it stale. The in-transaction guard must still hold it.
    const set = await prisma.changeSet.create({
      data: {
        campaignId,
        source: "AI",
        title: "Racy delete",
        actorUserId: dmId,
        baseVersions: {},
        operations: {
          create: [
            {
              op: "DELETE_RELATIONSHIP",
              targetType: "RELATIONSHIP",
              targetId: edge.id,
              patch: { _baseVersion: { to: live.version + 5 } },
            },
          ],
        },
      },
      select: { id: true },
    });

    const [queued] = await listPendingChangeSetsForUser(dmId, campaignId);
    expect(queued.operations[0].isStale).toBe(false); // gate missed it

    await expect(approveAcceptedChangeSet(dmId, campaignId, set.id)).rejects.toThrow(
      /changed since you opened it/i,
    );
    const after = await prisma.relationship.findUniqueOrThrow({ where: { id: edge.id } });
    expect(after.status).toBe(CanonStatus.CANON);
  });

  it("denies a non-DM from creating a pending relationship proposal", async () => {
    const { campaignId, carlId, donutId } = await seed();
    const player = await makeUser("player@test.com");
    await prisma.membership.create({
      data: { userId: player.id, campaignId, role: Role.PLAYER },
    });

    await expect(
      createPendingRelationshipChangeSet(player.id, campaignId, {
        title: "Sneaky edge",
        operations: [
          {
            op: "CREATE_RELATIONSHIP",
            patch: {
              type: { to: "ALLY_OF" },
              sourceId: { to: carlId },
              targetId: { to: donutId },
            },
          },
        ],
      }),
    ).rejects.toThrow(ServiceError);
  });
});
