import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  archiveEntity,
  createCrawler,
  createGenericEntity,
  getEntityForUser,
  listEntitiesForUser,
  updateEntity,
} from "@/server/services/entities";
import {
  approveChangeSet,
  createPendingEntityChangeSet,
  listPendingChangeSetsForUser,
  rejectChangeSet,
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

describe("entity service", () => {
  it("creates and lists a crawler scoped to the campaign", async () => {
    const owner = await makeUser("owner@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    const crawler = await createCrawler(owner.id, campaign.id, {
      name: "Princess Donut",
      realName: "Donut",
      crawlerNo: "4122",
      summary: "Royal cat crawler",
      description: "A very visible crawler.",
      visibility: "PLAYER_FACING",
      tags: ["royalty", "cat"],
      level: 3,
      hp: 22,
      mp: 9,
      gold: 100,
      viewCount: BigInt(10000),
      followerCount: BigInt(1000),
      favoriteCount: BigInt(100),
      killCount: 7,
      currentFloor: 2,
      isAlive: true,
    });

    const detail = await getEntityForUser(owner.id, campaign.id, crawler.id);
    expect(detail?.type).toBe("CRAWLER");
    expect(detail?.crawler?.level).toBe(3);
    expect(detail?.crawler?.viewCount).toBe(BigInt(10000));
    expect(detail?.crawler?.followerCount).toBe(BigInt(1000));
    expect(detail?.crawler?.favoriteCount).toBe(BigInt(100));

    const list = await listEntitiesForUser(owner.id, campaign.id, {
      query: "royal",
    });
    expect(list.entities).toHaveLength(1);
    expect(list.entities[0].name).toBe("Princess Donut");
  });

  it("creates generic entities and filters by type", async () => {
    const owner = await makeUser("generic@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    await createGenericEntity(owner.id, campaign.id, {
      type: "FACTION",
      name: "Skull Empire",
      summary: "A dangerous faction",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await createGenericEntity(owner.id, campaign.id, {
      type: "LOCATION",
      name: "Safe room",
      summary: "",
      description: "",
      visibility: "SHARED_WITH_PLAYERS",
      tags: [],
    });

    const list = await listEntitiesForUser(owner.id, campaign.id, {
      type: "FACTION",
    });
    expect(list.entities).toHaveLength(1);
    expect(list.entities[0].name).toBe("Skull Empire");
  });

  it("records direct DM entity writes as approved change sets with provenance", async () => {
    const owner = await makeUser("provenance@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Zev",
      summary: "Crawler admin",
      description: "",
      visibility: "DM_ONLY",
      tags: ["admin"],
    });

    const changeSet = await prisma.changeSet.findFirst({
      where: { campaignId: campaign.id },
      include: { operations: true },
    });
    expect(changeSet).toMatchObject({
      source: "DM",
      status: "APPROVED",
      actorUserId: owner.id,
      reviewedById: owner.id,
    });
    expect(changeSet?.operations).toHaveLength(1);
    expect(changeSet?.operations[0]).toMatchObject({
      op: "CREATE_ENTITY",
      targetType: "ENTITY",
      targetId: entity.id,
      decision: "ACCEPTED",
    });

    const fields = await prisma.provenance.findMany({
      where: { entityId: entity.id },
      select: { field: true, source: true, changeSetId: true },
    });
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "name",
          source: "DM",
          changeSetId: changeSet?.id,
        }),
      ]),
    );
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: { targetType: "CHANGE_SET", targetId: changeSet?.id },
      }),
    ).resolves.toMatchObject({ action: "AUTO_APPROVE" });
  });

  it("does not leak entities across campaign membership boundaries", async () => {
    const owner = await makeUser("owner@test.com");
    const outsider = await makeUser("outsider@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Zev",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    expect(await getEntityForUser(outsider.id, campaign.id, entity.id)).toBeNull();
    const list = await listEntitiesForUser(outsider.id, campaign.id);
    expect(list.entities).toHaveLength(0);
    expect(list.role).toBeNull();
  });

  it("filters player reads to player-visible entities", async () => {
    const owner = await makeUser("owner@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const secret = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Secret NPC",
      summary: "A secret",
      description: "Raw DM-only canon",
      visibility: "DM_ONLY",
      tags: [],
    });
    const shared = await createGenericEntity(owner.id, campaign.id, {
      type: "LOCATION",
      name: "Known safe room",
      summary: "A known place",
      description: "Player-safe canon",
      visibility: "SHARED_WITH_PLAYERS",
      tags: [],
    });

    const playerList = await listEntitiesForUser(player.id, campaign.id);
    expect(playerList.entities.map((entity) => entity.id)).toEqual([shared.id]);
    expect(
      await listEntitiesForUser(player.id, campaign.id, { query: "secret" }),
    ).toMatchObject({ entities: [] });
    expect(await getEntityForUser(player.id, campaign.id, secret.id)).toBeNull();
    expect(await getEntityForUser(player.id, campaign.id, shared.id)).toMatchObject({
      id: shared.id,
      description: "Player-safe canon",
    });
  });

  it("preserves large crawler audience ratings as bigint values", async () => {
    const owner = await makeUser("bigratings@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const viewCount = BigInt("9007199254740993");
    const followerCount = BigInt("9007199254740991");
    const favoriteCount = BigInt("9007199254740990");

    const crawler = await createCrawler(owner.id, campaign.id, {
      name: "Famous Crawler",
      summary: "",
      description: "",
      visibility: "PLAYER_FACING",
      tags: [],
      level: 1,
      gold: 0,
      viewCount,
      followerCount,
      favoriteCount,
      killCount: 0,
      isAlive: true,
    });

    const created = await getEntityForUser(owner.id, campaign.id, crawler.id);
    expect(created?.crawler?.viewCount).toBe(viewCount);
    expect(created?.crawler?.followerCount).toBe(followerCount);
    expect(created?.crawler?.favoriteCount).toBe(favoriteCount);

    const updatedViewCount = BigInt("9007199254740995");
    const updatedFollowerCount = BigInt("9007199254740994");
    const updatedFavoriteCount = BigInt("9007199254740992");
    await updateEntity(owner.id, campaign.id, crawler.id, {
      type: "CRAWLER",
      name: "Famous Crawler",
      summary: "",
      description: "",
      visibility: "PLAYER_FACING",
      tags: [],
      level: 1,
      gold: 0,
      viewCount: updatedViewCount,
      followerCount: updatedFollowerCount,
      favoriteCount: updatedFavoriteCount,
      killCount: 0,
      isAlive: true,
    });

    const updated = await getEntityForUser(owner.id, campaign.id, crawler.id);
    expect(updated?.crawler?.viewCount).toBe(updatedViewCount);
    expect(updated?.crawler?.followerCount).toBe(updatedFollowerCount);
    expect(updated?.crawler?.favoriteCount).toBe(updatedFavoriteCount);
  });

  it("allows co-DMs but not players to create canon entities", async () => {
    const owner = await makeUser("owner@test.com");
    const coDm = await makeUser("codm@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: coDm.id, campaignId: campaign.id, role: Role.CO_DM },
    });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    await expect(
      createGenericEntity(coDm.id, campaign.id, {
        type: "ITEM",
        name: "Loot box",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: [],
      }),
    ).resolves.toMatchObject({ name: "Loot box" });

    await expect(
      createGenericEntity(player.id, campaign.id, {
        type: "ITEM",
        name: "Contraband",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: [],
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("updates crawler fields and increments the entity version", async () => {
    const owner = await makeUser("update@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const crawler = await createCrawler(owner.id, campaign.id, {
      name: "Carl",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
      level: 1,
      gold: 0,
      viewCount: BigInt(0),
      followerCount: BigInt(0),
      favoriteCount: BigInt(0),
      killCount: 0,
      isAlive: true,
    });

    await updateEntity(owner.id, campaign.id, crawler.id, {
      type: "CRAWLER",
      name: "Crawler Carl",
      realName: "Carl",
      crawlerNo: "1",
      summary: "Main crawler",
      description: "Wears no shoes.",
      visibility: "PLAYER_FACING",
      tags: ["floor 1"],
      level: 2,
      hp: 30,
      mp: 5,
      gold: 12,
      viewCount: BigInt(5000),
      followerCount: BigInt(500),
      favoriteCount: BigInt(50),
      killCount: 3,
      currentFloor: 1,
      isAlive: true,
    });

    const detail = await getEntityForUser(owner.id, campaign.id, crawler.id);
    expect(detail?.name).toBe("Crawler Carl");
    expect(detail?.version).toBe(2);
    expect(detail?.crawler?.level).toBe(2);
    expect(detail?.crawler?.viewCount).toBe(BigInt(5000));
    expect(detail?.crawler?.followerCount).toBe(BigInt(500));
    expect(detail?.crawler?.favoriteCount).toBe(BigInt(50));
  });

  it("blocks overwrites to locked fields", async () => {
    const owner = await makeUser("locked@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Locked NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await prisma.entity.update({
      where: { id: entity.id },
      data: { lockedFields: ["name"] },
    });

    await expect(
      updateEntity(owner.id, campaign.id, entity.id, {
        type: "NPC",
        name: "Renamed NPC",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: [],
      }),
    ).rejects.toThrow("locked");

    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: entity.id } }),
    ).resolves.toMatchObject({ name: "Locked NPC", version: 1 });
  });

  it("blocks archiving a locked entity", async () => {
    const owner = await makeUser("locked-archive@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Locked Archive NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await prisma.entity.update({
      where: { id: entity.id },
      data: { locked: true },
    });

    await expect(archiveEntity(owner.id, campaign.id, entity.id)).rejects.toThrow(
      "locked",
    );
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: entity.id } }),
    ).resolves.toMatchObject({ status: "CANON", version: 1 });
  });

  it("approves a pending entity proposal end to end", async () => {
    const owner = await makeUser("approve@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    const proposal = await createPendingEntityChangeSet(owner.id, campaign.id, {
      title: "Create proposed NPC",
      operations: [
        {
          op: "CREATE_ENTITY",
          patch: {
            type: { to: "NPC" },
            name: { to: "Proposed NPC" },
            summary: { to: "Queued for review" },
            description: { to: null },
            visibility: { to: "DM_ONLY" },
            tags: { to: [] },
          },
        },
      ],
    });

    const pending = await prisma.changeSet.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    expect(pending.status).toBe("PENDING");
    await expect(listPendingChangeSetsForUser(owner.id, campaign.id)).resolves
      .toHaveLength(1);

    const result = await approveChangeSet(owner.id, campaign.id, proposal.id);
    expect(result.targetIds).toHaveLength(1);
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: result.targetIds[0] } }),
    ).resolves.toMatchObject({ name: "Proposed NPC", status: "CANON" });
    await expect(
      prisma.changeSet.findUniqueOrThrow({ where: { id: proposal.id } }),
    ).resolves.toMatchObject({ status: "APPROVED", reviewedById: owner.id });
  });

  it("flags queued proposals that touch locked fields", async () => {
    const owner = await makeUser("pending-locked@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Locked Pending NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await prisma.entity.update({
      where: { id: entity.id },
      data: { lockedFields: ["name"] },
    });

    const proposal = await createPendingEntityChangeSet(owner.id, campaign.id, {
      title: "Rename locked NPC",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entity.id,
          patch: {
            _baseVersion: { to: 1 },
            name: { from: "Locked Pending NPC", to: "New Name" },
          },
        },
      ],
    });

    await expect(
      prisma.changeOperation.findFirstOrThrow({
        where: { changeSetId: proposal.id },
      }),
    ).resolves.toMatchObject({ blockedByLock: true });
    await expect(
      approveChangeSet(owner.id, campaign.id, proposal.id),
    ).rejects.toThrow("blocked by locks");
  });

  it("rejects stale queued proposals when canon changed underneath", async () => {
    const owner = await makeUser("stale@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Stale NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    const proposal = await createPendingEntityChangeSet(owner.id, campaign.id, {
      title: "Stale rename",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entity.id,
          patch: {
            _baseVersion: { to: 1 },
            name: { from: "Stale NPC", to: "Old proposal name" },
          },
        },
      ],
    });
    await updateEntity(owner.id, campaign.id, entity.id, {
      type: "NPC",
      name: "Fresh canon name",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    await expect(
      approveChangeSet(owner.id, campaign.id, proposal.id),
    ).rejects.toThrow("changed since this proposal");
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: entity.id } }),
    ).resolves.toMatchObject({ name: "Fresh canon name", version: 2 });
  });

  it("rejects a pending entity proposal without applying canon", async () => {
    const owner = await makeUser("reject@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    const proposal = await createPendingEntityChangeSet(owner.id, campaign.id, {
      title: "Reject proposed NPC",
      operations: [
        {
          op: "CREATE_ENTITY",
          patch: {
            type: { to: "NPC" },
            name: { to: "Rejected NPC" },
            summary: { to: null },
            description: { to: null },
            visibility: { to: "DM_ONLY" },
            tags: { to: [] },
          },
        },
      ],
    });

    await rejectChangeSet(owner.id, campaign.id, proposal.id);

    await expect(
      prisma.changeSet.findUniqueOrThrow({ where: { id: proposal.id } }),
    ).resolves.toMatchObject({ status: "REJECTED", reviewedById: owner.id });
    await expect(
      prisma.entity.findFirst({ where: { campaignId: campaign.id, name: "Rejected NPC" } }),
    ).resolves.toBeNull();
  });

  it("rejects updates that try to change an entity type", async () => {
    const owner = await makeUser("type@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Zev",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    await expect(
      updateEntity(owner.id, campaign.id, entity.id, {
        type: "FACTION",
        name: "Zev",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: [],
      }),
    ).rejects.toThrow("Entity type cannot be changed.");
  });

  it("archives instead of hard-deleting entities", async () => {
    const owner = await makeUser("archive@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "SHOW",
      name: "Dungeon Crawler World",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    await archiveEntity(owner.id, campaign.id, entity.id);

    expect(await getEntityForUser(owner.id, campaign.id, entity.id)).toBeNull();
    const stored = await prisma.entity.findUnique({ where: { id: entity.id } });
    expect(stored?.status).toBe("ARCHIVED");
  });
});
