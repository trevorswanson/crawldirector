import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { EntityType, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  applyAutoApprovedEntityChangeSet,
  createPendingEntityChangeSet,
  listPendingChangeSetsForUser,
  supersedeChangeSet,
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

async function versionOf(entityId: string) {
  const entity = await prisma.entity.findUniqueOrThrow({
    where: { id: entityId },
    select: { version: true },
  });
  return entity.version;
}

async function createEntity(dmId: string, campaignId: string, name: string) {
  const result = await applyAutoApprovedEntityChangeSet(dmId, campaignId, {
    title: `Create ${name}`,
    operations: [
      {
        op: "CREATE_ENTITY",
        patch: { type: { to: EntityType.NPC }, name: { to: name } },
      },
    ],
  });
  return result.targetIds[0];
}

async function pendingUpdate(
  dmId: string,
  campaignId: string,
  entityId: string,
  patch: Record<string, { from?: unknown; to?: unknown }>,
) {
  const baseVersion = await versionOf(entityId);
  return createPendingEntityChangeSet(dmId, campaignId, {
    source: "AI",
    title: "AI update",
    operations: [
      {
        op: "UPDATE_ENTITY",
        targetId: entityId,
        patch: { ...patch, _baseVersion: { to: baseVersion } },
      },
    ],
  });
}

async function directUpdate(
  dmId: string,
  campaignId: string,
  entityId: string,
  patch: Record<string, { from?: unknown; to?: unknown }>,
) {
  const baseVersion = await versionOf(entityId);
  return applyAutoApprovedEntityChangeSet(dmId, campaignId, {
    title: "DM edit",
    operations: [
      {
        op: "UPDATE_ENTITY",
        targetId: entityId,
        patch: { ...patch, _baseVersion: { to: baseVersion } },
      },
    ],
  });
}

describe("review service — supersede", () => {
  it("manually supersedes a pending proposal, retaining it for history", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Goblin");
    const set = await pendingUpdate(dmId, campaignId, entityId, {
      description: { to: "Replaced by a newer draft." },
    });

    await supersedeChangeSet(dmId, campaignId, set.id);

    const stored = await prisma.changeSet.findUnique({
      where: { id: set.id },
      include: { operations: true },
    });
    expect(stored?.status).toBe("SUPERSEDED");
    expect(stored?.reviewedById).toBe(dmId);
    expect(stored?.operations).toHaveLength(1);
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: entityId } }),
    ).resolves.toMatchObject({ description: null, version: 1 });

    const audit = await prisma.auditLog.findFirst({
      where: { action: "SUPERSEDE", targetId: set.id },
    });
    expect(audit).not.toBeNull();
  });

  it("drops a superseded proposal out of the pending queue", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Goblin");
    const set = await pendingUpdate(dmId, campaignId, entityId, {
      description: { to: "Stale draft." },
    });

    await supersedeChangeSet(dmId, campaignId, set.id);

    const pending = await prisma.changeSet.findMany({
      where: { campaignId, status: "PENDING" },
    });
    expect(pending).toHaveLength(0);
  });

  it("rejects supersede from a non-DM member", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Goblin");
    const set = await pendingUpdate(dmId, campaignId, entityId, {
      description: { to: "x" },
    });
    const player = await makeUser("player@test.com");
    await prisma.membership.create({
      data: { userId: player.id, campaignId, role: Role.PLAYER },
    });

    await expect(
      supersedeChangeSet(player.id, campaignId, set.id),
    ).rejects.toThrow(ServiceError);
  });

  it("throws when the change set is missing or no longer pending", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      supersedeChangeSet(dmId, campaignId, "missing-id"),
    ).rejects.toThrow(ServiceError);

    const entityId = await createEntity(dmId, campaignId, "Goblin");
    const set = await pendingUpdate(dmId, campaignId, entityId, {
      description: { to: "Retired once." },
    });
    await supersedeChangeSet(dmId, campaignId, set.id);

    await expect(supersedeChangeSet(dmId, campaignId, set.id)).rejects.toThrow(
      ServiceError,
    );
  });

  it("supersedes a proposal that has gone stale under a direct DM edit", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "NPC");
    const set = await pendingUpdate(dmId, campaignId, entityId, {
      description: { to: "AI proposal." },
    });

    // A direct DM edit bumps the entity version, making the proposal stale.
    // Stale proposals are NOT auto-dismissed; they stay pending for the DM.
    await directUpdate(dmId, campaignId, entityId, {
      summary: { to: "DM changed canon under it." },
    });
    const beforeSupersede = await listPendingChangeSetsForUser(dmId, campaignId);
    expect(beforeSupersede).toHaveLength(1);
    expect(beforeSupersede[0].status).toBe("PENDING");
    expect(beforeSupersede[0].operations[0].isStale).toBe(true);

    // The DM retires the now-obsolete proposal as superseded.
    await supersedeChangeSet(dmId, campaignId, set.id);
    const afterSupersede = await prisma.changeSet.findUnique({
      where: { id: set.id },
    });
    expect(afterSupersede?.status).toBe("SUPERSEDED");
  });
});
