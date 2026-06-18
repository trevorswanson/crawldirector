import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  ChangeSetStatus,
  ChangeSource,
  EntityType,
  OpDecision,
  Role,
} from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { migrateEntityData } from "@/server/services/entity-data-migration";
import { listPendingChangeSetsForUser } from "@/server/services/review";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

beforeEach(async () => {
  await prisma.job.deleteMany();
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
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

async function seed() {
  const dm = await makeUser("dm@test.com");
  const player = await makeUser("player@test.com");
  const campaign = await createCampaign(dm.id, { name: "Dungeon" });
  await prisma.membership.create({
    data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
  });
  return { dmId: dm.id, playerId: player.id, campaignId: campaign.id };
}

async function createStaleFloor(dmId: string, campaignId: string) {
  return prisma.entity.create({
    data: {
      campaignId,
      createdById: dmId,
      type: EntityType.FLOOR,
      name: "Floor Nine",
      data: {
        floorNumber: "9",
        theme: "Castle siege",
        startDay: "0",
        collapseDay: "12",
        retiredKey: "drop me",
        _v: 1,
      },
    },
    select: { id: true },
  });
}

describe("migrateEntityData", () => {
  it("upgrades stale kind data through an approved MIGRATION change set", async () => {
    const { dmId, campaignId } = await seed();
    const floor = await createStaleFloor(dmId, campaignId);

    const result = await migrateEntityData(dmId, campaignId);

    expect(result).toEqual({ checked: 1, migrated: 1, skipped: 0 });
    const stored = await prisma.entity.findUniqueOrThrow({
      where: { id: floor.id },
      select: { data: true, version: true },
    });
    const data = asRecord(stored.data);
    expect(data).toMatchObject({
      floorNumber: 9,
      theme: "Castle siege",
      startDay: 0,
      collapseDay: 12,
      _v: 2,
    });
    expect(data).not.toHaveProperty("retiredKey");
    expect(stored.version).toBe(2);

    const changeSet = await prisma.changeSet.findFirstOrThrow({
      where: { campaignId, source: ChangeSource.MIGRATION },
      include: { operations: true },
    });
    expect(changeSet).toMatchObject({
      status: ChangeSetStatus.APPROVED,
      actorUserId: dmId,
      reviewedById: dmId,
    });
    expect(changeSet.operations).toHaveLength(1);
    expect(changeSet.operations[0]).toMatchObject({
      targetId: floor.id,
      decision: OpDecision.ACCEPTED,
    });

    await expect(listPendingChangeSetsForUser(dmId, campaignId)).resolves.toEqual([]);
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: { campaignId, action: "MIGRATE", targetType: "CHANGE_SET" },
      }),
    ).resolves.toMatchObject({
      actorUserId: dmId,
      targetId: changeSet.id,
    });
  });

  it("is idempotent after stored data reaches the current version", async () => {
    const { dmId, campaignId } = await seed();
    await createStaleFloor(dmId, campaignId);

    await migrateEntityData(dmId, campaignId);
    const second = await migrateEntityData(dmId, campaignId);

    expect(second).toEqual({ checked: 0, migrated: 0, skipped: 0 });
    await expect(
      prisma.changeSet.count({ where: { campaignId, source: ChangeSource.MIGRATION } }),
    ).resolves.toBe(1);
  });

  it("normalizes corrupt JSON field values while migrating", async () => {
    const { dmId, campaignId } = await seed();
    const floor = await prisma.entity.create({
      data: {
        campaignId,
        createdById: dmId,
        type: EntityType.FLOOR,
        name: "Corrupt Floor",
        data: {
          floorNumber: ["9"],
          theme: { label: "bad shape" },
          startDay: "1",
          collapseDay: null,
          _v: 1,
        },
      },
      select: { id: true },
    });

    await expect(migrateEntityData(dmId, campaignId)).resolves.toEqual({
      checked: 1,
      migrated: 1,
      skipped: 0,
    });

    const stored = await prisma.entity.findUniqueOrThrow({
      where: { id: floor.id },
      select: { data: true },
    });
    expect(asRecord(stored.data)).toMatchObject({
      floorNumber: null,
      theme: null,
      startDay: 1,
      collapseDay: null,
      _v: 2,
    });
  });

  it("uses the campaign owner when no explicit actor is supplied", async () => {
    const { dmId, campaignId } = await seed();
    await createStaleFloor(dmId, campaignId);

    await migrateEntityData(null, campaignId);

    await expect(
      prisma.changeSet.findFirstOrThrow({
        where: { campaignId, source: ChangeSource.MIGRATION },
      }),
    ).resolves.toMatchObject({
      actorUserId: dmId,
      reviewedById: dmId,
    });
  });

  it("rejects an automatic run for a missing campaign", async () => {
    await expect(migrateEntityData(null, "missing-campaign")).rejects.toThrow(
      /Campaign not found/,
    );
  });

  it("rejects a player-triggered migration run", async () => {
    const { playerId, campaignId } = await seed();

    await expect(migrateEntityData(playerId, campaignId)).rejects.toThrow(ServiceError);
  });
});
