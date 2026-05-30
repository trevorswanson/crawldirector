import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { EntityType, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  applyAutoApprovedEntityChangeSet,
  approveChangeSetRun,
  createPendingEntityChangeSet,
  rejectChangeSetRun,
  setEntityLock,
} from "@/server/services/review";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

beforeEach(async () => {
  await prisma.crawler.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seed() {
  const owner = await makeUser("owner@test.com");
  const campaign = await createCampaign(owner.id, { name: "Dungeon" });
  return { dmId: owner.id, campaignId: campaign.id };
}

async function createEntity(dmId: string, campaignId: string, name: string) {
  const result = await applyAutoApprovedEntityChangeSet(dmId, campaignId, {
    title: `Create ${name}`,
    operations: [
      {
        op: "CREATE_ENTITY",
        patch: {
          type: { to: EntityType.NPC },
          name: { to: name },
          visibility: { to: "DM_ONLY" },
          tags: { to: [] },
        },
      },
    ],
  });
  return result.targetIds[0];
}

async function versionOf(entityId: string) {
  const entity = await prisma.entity.findUniqueOrThrow({
    where: { id: entityId },
    select: { version: true },
  });
  return entity.version;
}

async function pendingRunUpdate(
  dmId: string,
  campaignId: string,
  runId: string,
  entityId: string,
  summary: string,
) {
  const baseVersion = await versionOf(entityId);
  return createPendingEntityChangeSet(dmId, campaignId, {
    source: "AI",
    runId,
    title: `AI update ${summary}`,
    operations: [
      {
        op: "UPDATE_ENTITY",
        targetId: entityId,
        patch: {
          _baseVersion: { to: baseVersion },
          summary: { from: "", to: summary },
        },
      },
    ],
  });
}

describe("review service - batch run actions", () => {
  it("approves all non-conflicting pending change sets in a run and holds blocked ones", async () => {
    const { dmId, campaignId } = await seed();
    const firstId = await createEntity(dmId, campaignId, "First NPC");
    const secondId = await createEntity(dmId, campaignId, "Second NPC");
    const lockedId = await createEntity(dmId, campaignId, "Locked NPC");
    const runId = "generator-run-1";

    const first = await pendingRunUpdate(
      dmId,
      campaignId,
      runId,
      firstId,
      "Approved first",
    );
    const second = await pendingRunUpdate(
      dmId,
      campaignId,
      runId,
      secondId,
      "Approved second",
    );
    const blocked = await pendingRunUpdate(
      dmId,
      campaignId,
      runId,
      lockedId,
      "Held by lock",
    );
    await setEntityLock(dmId, campaignId, lockedId, { lockedFields: ["summary"] });

    const result = await approveChangeSetRun(dmId, campaignId, runId);

    expect(result).toEqual({
      runId,
      approvedIds: [first.id, second.id],
      rejectedIds: [],
      heldIds: [blocked.id],
    });
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: firstId } }),
    ).resolves.toMatchObject({ summary: "Approved first", version: 2 });
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: secondId } }),
    ).resolves.toMatchObject({ summary: "Approved second", version: 2 });
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: lockedId } }),
    ).resolves.toMatchObject({ summary: null, version: 1 });
    await expect(
      prisma.changeSet.findUniqueOrThrow({ where: { id: blocked.id } }),
    ).resolves.toMatchObject({ status: "PENDING" });
  });

  it("rejects every pending change set in a run without touching canon", async () => {
    const { dmId, campaignId } = await seed();
    const firstId = await createEntity(dmId, campaignId, "First NPC");
    const secondId = await createEntity(dmId, campaignId, "Second NPC");
    const runId = "generator-run-2";
    const first = await pendingRunUpdate(
      dmId,
      campaignId,
      runId,
      firstId,
      "Rejected first",
    );
    const second = await pendingRunUpdate(
      dmId,
      campaignId,
      runId,
      secondId,
      "Rejected second",
    );

    const result = await rejectChangeSetRun(dmId, campaignId, runId);

    expect(result).toEqual({
      runId,
      approvedIds: [],
      rejectedIds: [first.id, second.id],
      heldIds: [],
    });
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: firstId } }),
    ).resolves.toMatchObject({ summary: null, version: 1 });
    await expect(
      prisma.changeSet.findMany({
        where: { id: { in: [first.id, second.id] } },
        orderBy: { createdAt: "asc" },
        select: { status: true, reviewedById: true },
      }),
    ).resolves.toEqual([
      { status: "REJECTED", reviewedById: dmId },
      { status: "REJECTED", reviewedById: dmId },
    ]);
  });

  it("handles newly stale proposals during run approval", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Conflict NPC");
    const runId = "generator-run-conflict";

    const first = await pendingRunUpdate(
      dmId,
      campaignId,
      runId,
      entityId,
      "First update",
    );
    const second = await pendingRunUpdate(
      dmId,
      campaignId,
      runId,
      entityId,
      "Second update",
    );

    const result = await approveChangeSetRun(dmId, campaignId, runId);

    expect(result).toEqual({
      runId,
      approvedIds: [first.id],
      rejectedIds: [],
      heldIds: [second.id],
    });

    // The first one should be applied and the version incremented
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: entityId } }),
    ).resolves.toMatchObject({ summary: "First update", version: 2 });

    // The second one should still be pending and marked stale in the database
    const pendingChangeSet = await prisma.changeSet.findUniqueOrThrow({
      where: { id: second.id },
      include: { operations: true },
    });
    expect(pendingChangeSet.status).toBe("PENDING");
    expect(pendingChangeSet.operations[0].isStale).toBe(true);
  });

  it("rejects batch actions without a pending run or DM permission", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      approveChangeSetRun(dmId, campaignId, "missing-run"),
    ).rejects.toThrow(ServiceError);
    await expect(rejectChangeSetRun(dmId, campaignId, "")).rejects.toThrow(
      ServiceError,
    );

    const player = await makeUser("player@test.com");
    await prisma.membership.create({
      data: { userId: player.id, campaignId, role: Role.PLAYER },
    });

    await expect(
      rejectChangeSetRun(player.id, campaignId, "generator-run-1"),
    ).rejects.toThrow(ServiceError);
  });
});
