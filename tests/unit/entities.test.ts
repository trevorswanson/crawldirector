import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCrawlerSchema } from "@/lib/validation";
import { createCampaign } from "@/server/services/campaigns";
import {
  archiveEntity,
  createCrawler,
  createGenericEntity,
  getEntityForUser,
  getEntityTypeCounts,
  listCampaignTags,
  listEntitiesForUser,
  updateEntity,
} from "@/server/services/entities";
import {
  approveChangeSet,
  createPendingEntityChangeSet,
  getEntityProvenance,
  listPendingChangeSetsForUser,
  rejectChangeSet,
  setChangeOperationDecision,
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

  it("persists isStub on creation and clears it on update", async () => {
    const owner = await makeUser("stub-test@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Stub NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
      isStub: true,
    });

    const created = await getEntityForUser(owner.id, campaign.id, entity.id);
    expect(created?.isStub).toBe(true);

    await updateEntity(owner.id, campaign.id, entity.id, {
      type: "NPC",
      name: "Fleshed Out NPC",
      summary: "Now he has a summary",
      description: "And a description too.",
      visibility: "DM_ONLY",
      tags: [],
    });

    const updated = await getEntityForUser(owner.id, campaign.id, entity.id);
    expect(updated?.isStub).toBe(false);
    expect(updated?.name).toBe("Fleshed Out NPC");
  });

  it("persists isStub for crawlers on creation", async () => {
    const owner = await makeUser("crawler-stub-test@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    const crawler = await createCrawler(
      owner.id,
      campaign.id,
      createCrawlerSchema.parse({
        name: "Stub Crawler",
        visibility: "DM_ONLY",
        tags: [],
        isStub: true,
      }),
    );

    const created = await getEntityForUser(owner.id, campaign.id, crawler.id);
    expect(created?.isStub).toBe(true);
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

  it("partially applies accepted operations and skips rejected operations", async () => {
    const owner = await makeUser("partial-review@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const zev = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Zev",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    const mordecai = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Mordecai",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    const proposal = await createPendingEntityChangeSet(owner.id, campaign.id, {
      title: "Review two NPC updates",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: zev.id,
          patch: {
            _baseVersion: { to: 1 },
            summary: { from: "", to: "Crawler admin" },
          },
        },
        {
          op: "UPDATE_ENTITY",
          targetId: mordecai.id,
          patch: {
            _baseVersion: { to: 1 },
            summary: { from: "", to: "Rejected trainer note" },
          },
        },
      ],
    });
    const rejectedOperation = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSetId: proposal.id, targetId: mordecai.id },
    });
    await setChangeOperationDecision(
      owner.id,
      campaign.id,
      proposal.id,
      rejectedOperation.id,
      { decision: "REJECTED" },
    );

    await approveChangeSet(owner.id, campaign.id, proposal.id);

    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: zev.id } }),
    ).resolves.toMatchObject({ summary: "Crawler admin", version: 2 });
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: mordecai.id } }),
    ).resolves.toMatchObject({ summary: null, version: 1 });
    await expect(
      prisma.changeSet.findUniqueOrThrow({ where: { id: proposal.id } }),
    ).resolves.toMatchObject({
      status: "PARTIALLY_APPLIED",
      reviewedById: owner.id,
    });
    await expect(getEntityProvenance(owner.id, campaign.id, zev.id)).resolves.toMatchObject({
      lastChangeTitle: "Review two NPC updates",
      changeCount: 2,
    });
    await expect(getEntityProvenance(owner.id, campaign.id, mordecai.id)).resolves
      .toMatchObject({
        lastChangeTitle: "Create Mordecai",
        changeCount: 1,
      });
  });

  it("applies an edited operation patch and clears lock blocking for omitted fields", async () => {
    const owner = await makeUser("edited-review@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Locked Name",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await setEntityLock(owner.id, campaign.id, entity.id, { lockedFields: ["name"] });
    const proposal = await createPendingEntityChangeSet(owner.id, campaign.id, {
      title: "Review edited NPC update",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entity.id,
          patch: {
            _baseVersion: { to: 1 },
            name: { from: "Locked Name", to: "AI Name" },
            summary: { from: "", to: "AI summary" },
          },
        },
      ],
    });
    const operation = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSetId: proposal.id },
    });
    expect(operation.blockedByLock).toBe(true);

    await setChangeOperationDecision(owner.id, campaign.id, proposal.id, operation.id, {
      decision: "EDITED",
      editedPatch: {
        summary: { from: "", to: "DM-edited summary" },
      },
    });
    await expect(
      prisma.changeOperation.findUniqueOrThrow({ where: { id: operation.id } }),
    ).resolves.toMatchObject({ decision: "EDITED", blockedByLock: false });

    await approveChangeSet(owner.id, campaign.id, proposal.id);

    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: entity.id } }),
    ).resolves.toMatchObject({
      name: "Locked Name",
      summary: "DM-edited summary",
      version: 2,
    });
    await expect(
      prisma.provenance.findMany({
        where: { entityId: entity.id, changeSetId: proposal.id },
        select: { field: true },
      }),
    ).resolves.toEqual([{ field: "summary" }]);
    await expect(getEntityProvenance(owner.id, campaign.id, entity.id)).resolves
      .toMatchObject({
        lastChangeTitle: "Review edited NPC update",
        changeCount: 2,
      });
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
    ).rejects.toThrow("stale");
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: entity.id } }),
    ).resolves.toMatchObject({ name: "Fresh canon name", version: 2 });
  });

  it("rejects stale queued archive proposals when canon changed underneath", async () => {
    const owner = await makeUser("stale-archive@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Archive Stale NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    const proposal = await createPendingEntityChangeSet(owner.id, campaign.id, {
      title: "Archive stale NPC",
      operations: [
        {
          op: "DELETE_ENTITY",
          targetId: entity.id,
          patch: {
            _baseVersion: { to: 1 },
            status: { from: "CANON", to: "ARCHIVED" },
          },
        },
      ],
    });
    await updateEntity(owner.id, campaign.id, entity.id, {
      type: "NPC",
      name: "Archive Stale NPC",
      summary: "Changed after proposal",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    await expect(
      approveChangeSet(owner.id, campaign.id, proposal.id),
    ).rejects.toThrow("stale");
    await expect(
      prisma.changeOperation.findFirstOrThrow({
        where: { changeSetId: proposal.id },
      }),
    ).resolves.toMatchObject({ isStale: true });
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: entity.id } }),
    ).resolves.toMatchObject({
      status: "CANON",
      summary: "Changed after proposal",
      version: 2,
    });
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

  it("is a no-op when an update changes nothing", async () => {
    const owner = await makeUser("noop@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Zev",
      summary: "Unchanged",
      description: "",
      visibility: "DM_ONLY",
      tags: ["a"],
    });

    const result = await updateEntity(owner.id, campaign.id, entity.id, {
      type: "NPC",
      name: "Zev",
      summary: "Unchanged",
      description: "",
      visibility: "DM_ONLY",
      tags: ["a"],
    });

    expect(result.id).toBe(entity.id);
    const stored = await prisma.entity.findUniqueOrThrow({ where: { id: entity.id } });
    // No change set was applied, so the version stays put.
    expect(stored.version).toBe(1);
  });

  it("rejects updating an entity that does not exist", async () => {
    const owner = await makeUser("missing-update@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    await expect(
      updateEntity(owner.id, campaign.id, "nope", {
        type: "NPC",
        name: "Ghost",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: [],
      }),
    ).rejects.toThrow("Entity not found.");
  });

  it("rejects archiving an entity that does not exist", async () => {
    const owner = await makeUser("missing-archive@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    await expect(
      archiveEntity(owner.id, campaign.id, "nope"),
    ).rejects.toThrow("Entity not found.");
  });

  it("filters the world browser to pending entities", async () => {
    const owner = await makeUser("pending-filter@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Canon NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    // Drop a PENDING entity straight into the table to exercise the status facet.
    await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        createdById: owner.id,
        type: "NPC",
        name: "Pending NPC",
        visibility: "DM_ONLY",
        status: "PENDING",
      },
    });

    const list = await listEntitiesForUser(owner.id, campaign.id, {
      status: "PENDING",
    });
    expect(list.entities.map((e) => e.name)).toEqual(["Pending NPC"]);
  });
});

describe("entity locking", () => {
  async function makeNpc(email: string) {
    const owner = await makeUser(email);
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Lockable NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    return { owner, campaign, entity };
  }

  it("locks an entire entity and records a LOCK audit row", async () => {
    const { owner, campaign, entity } = await makeNpc("lock-whole@test.com");

    const result = await setEntityLock(owner.id, campaign.id, entity.id, {
      locked: true,
    });
    expect(result.locked).toBe(true);

    const stored = await prisma.entity.findUniqueOrThrow({
      where: { id: entity.id },
      // locking must not bump version (would falsely mark proposals stale)
      select: { locked: true, version: true },
    });
    expect(stored).toMatchObject({ locked: true, version: 1 });

    const audit = await prisma.auditLog.findFirst({
      where: { targetType: "ENTITY", targetId: entity.id, action: "LOCK" },
    });
    expect(audit).not.toBeNull();
  });

  it("unlocks an entity and records an UNLOCK audit row", async () => {
    const { owner, campaign, entity } = await makeNpc("unlock@test.com");
    await setEntityLock(owner.id, campaign.id, entity.id, { locked: true });

    const result = await setEntityLock(owner.id, campaign.id, entity.id, {
      locked: false,
    });
    expect(result.locked).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { targetType: "ENTITY", targetId: entity.id, action: "UNLOCK" },
    });
    expect(audit).not.toBeNull();
  });

  it("locks specific fields and blocks only those from direct edits", async () => {
    const { owner, campaign, entity } = await makeNpc("lock-fields@test.com");

    const result = await setEntityLock(owner.id, campaign.id, entity.id, {
      lockedFields: ["name", "name", "summary"],
    });
    // de-duplicated and sorted
    expect(result.lockedFields).toEqual(["name", "summary"]);

    const audit = await prisma.auditLog.findFirst({
      where: {
        targetType: "ENTITY",
        targetId: entity.id,
        action: "SET_FIELD_LOCKS",
      },
    });
    expect(audit).not.toBeNull();

    // Editing a locked field is blocked...
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

    // ...but editing an unlocked field still applies.
    await updateEntity(owner.id, campaign.id, entity.id, {
      type: "NPC",
      name: "Lockable NPC",
      summary: "",
      description: "Now described",
      visibility: "DM_ONLY",
      tags: [],
    });
    const stored = await prisma.entity.findUniqueOrThrow({
      where: { id: entity.id },
    });
    expect(stored.description).toBe("Now described");
    expect(stored.name).toBe("Lockable NPC");
  });

  it("is a no-op (no audit row) when nothing changes", async () => {
    const { owner, campaign, entity } = await makeNpc("lock-noop@test.com");

    const result = await setEntityLock(owner.id, campaign.id, entity.id, {
      locked: false,
      lockedFields: [],
    });
    expect(result).toMatchObject({ locked: false, lockedFields: [] });

    const audits = await prisma.auditLog.count({
      where: { targetType: "ENTITY", targetId: entity.id },
    });
    expect(audits).toBe(0);
  });

  it("rejects a lock from a non-DM member", async () => {
    const { campaign, entity } = await makeNpc("lock-owner@test.com");
    const player = await makeUser("lock-player@test.com");
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    await expect(
      setEntityLock(player.id, campaign.id, entity.id, { locked: true }),
    ).rejects.toThrow(ServiceError);
  });

  it("throws when the entity does not exist", async () => {
    const owner = await makeUser("lock-missing@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    await expect(
      setEntityLock(owner.id, campaign.id, "missing", { locked: true }),
    ).rejects.toThrow("Entity not found.");
  });

  it("manages ITEM and ITEM_TYPE entities with custom metadata fields and field locks", async () => {
    const owner = await makeUser("items-test@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    // 1. Create ITEM_TYPE entity
    const weaponType = await createGenericEntity(owner.id, campaign.id, {
      type: "ITEM_TYPE",
      name: "Weapon",
      summary: "A type for weapon items",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    expect(weaponType.id).toBeTruthy();
    expect(weaponType.type).toBe("ITEM_TYPE");

    // 2. Create ITEM entity referencing the item type
    const item = await createGenericEntity(owner.id, campaign.id, {
      type: "ITEM",
      name: "Excalibur",
      summary: "Legendary sword",
      description: "King Arthur's sword.",
      visibility: "PLAYER_FACING",
      tags: ["legendary", "sword"],
      itemTypeId: weaponType.id,
      divine: true,
      unique: true,
      fleeting: false,
      aiDescription: "A legendary sword of myth.",
    });

    expect(item.id).toBeTruthy();

    // Verify it can be read back with correct custom data properties
    const fetchedItem = await getEntityForUser(owner.id, campaign.id, item.id);
    expect(fetchedItem).not.toBeNull();
    expect(fetchedItem?.type).toBe("ITEM");
    const itemData = (fetchedItem?.data as Record<string, unknown>) || {};
    expect(itemData["itemTypeId"]).toBe(weaponType.id);
    expect(itemData["divine"]).toBe(true);
    expect(itemData["unique"]).toBe(true);
    expect(itemData["fleeting"]).toBe(false);
    expect(itemData["aiDescription"]).toBe("A legendary sword of myth.");

    // 3. Update the custom fields via updateEntity
    await updateEntity(owner.id, campaign.id, item.id, {
      type: "ITEM",
      name: "Excalibur",
      summary: "Legendary sword",
      description: "King Arthur's sword.",
      visibility: "PLAYER_FACING",
      tags: ["legendary", "sword"],
      itemTypeId: weaponType.id,
      divine: false,
      unique: true,
      fleeting: true,
      aiDescription: "A rusty, fleeting sword.",
    });

    const updatedItem = await getEntityForUser(owner.id, campaign.id, item.id);
    const updatedData = (updatedItem?.data as Record<string, unknown>) || {};
    expect(updatedData["divine"]).toBe(false);
    expect(updatedData["unique"]).toBe(true);
    expect(updatedData["fleeting"]).toBe(true);
    expect(updatedData["aiDescription"]).toBe("A rusty, fleeting sword.");

    // 4. Lock data.divine and verify that it rejects updates to that field
    await setEntityLock(owner.id, campaign.id, item.id, {
      lockedFields: ["data.divine"],
    });

    // An update that tries to change data.divine back to true should fail
    await expect(
      updateEntity(owner.id, campaign.id, item.id, {
        type: "ITEM",
        name: "Excalibur",
        summary: "Legendary sword",
        description: "King Arthur's sword.",
        visibility: "PLAYER_FACING",
        tags: ["legendary", "sword"],
        itemTypeId: weaponType.id,
        divine: true, // attempting to change a locked field
        unique: true,
        fleeting: true,
        aiDescription: "A rusty, fleeting sword.",
      }),
    ).rejects.toThrow("locked entity fields");

    // An update that doesn't change data.divine should succeed
    await updateEntity(owner.id, campaign.id, item.id, {
      type: "ITEM",
      name: "Excalibur (Modified)",
      summary: "Legendary sword",
      description: "King Arthur's sword.",
      visibility: "PLAYER_FACING",
      tags: ["legendary", "sword"],
      itemTypeId: weaponType.id,
      divine: false, // same as current value
      unique: false, // changed, not locked
      fleeting: true,
      aiDescription: "A rusty, fleeting sword.",
    });

    const finalItem = await getEntityForUser(owner.id, campaign.id, item.id);
    expect(finalItem?.name).toBe("Excalibur (Modified)");
    const finalData = (finalItem?.data as Record<string, unknown>) || {};
    expect(finalData["unique"]).toBe(false);
  });
});

describe("world-browser facets", () => {
  it("counts entities per type and filters by locked status", async () => {
    const owner = await makeUser("facets@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Mordecai",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    const faction = await createGenericEntity(owner.id, campaign.id, {
      type: "FACTION",
      name: "Skull Empire",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    const zev = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Zev",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    const counts = await getEntityTypeCounts(owner.id, campaign.id);
    expect(counts.NPC).toBe(2);
    expect(counts.FACTION).toBe(1);

    await setEntityLock(owner.id, campaign.id, faction.id, { locked: true });
    await setEntityLock(owner.id, campaign.id, zev.id, { lockedFields: ["summary"] });

    const locked = await listEntitiesForUser(owner.id, campaign.id, {
      status: "LOCKED",
    });
    expect(locked.entities).toHaveLength(2);
    const lockedNames = locked.entities.map(e => e.name);
    expect(lockedNames).toContain("Skull Empire");
    expect(lockedNames).toContain("Zev");

    const canon = await listEntitiesForUser(owner.id, campaign.id, {
      status: "CANON",
    });
    expect(canon.entities).toHaveLength(3);
  });

  it("filters entities by source", async () => {
    const owner = await makeUser("source-filter@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const dmEntity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "DM NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    const aiEntity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "AI NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    await prisma.entity.update({
      where: { id: aiEntity.id },
      data: { source: "AI" },
    });

    const dmOnlyList = await listEntitiesForUser(owner.id, campaign.id, {
      source: "DM",
    });
    expect(dmOnlyList.entities).toHaveLength(1);
    expect(dmOnlyList.entities[0].id).toBe(dmEntity.id);

    const aiOnlyList = await listEntitiesForUser(owner.id, campaign.id, {
      source: "AI",
    });
    expect(aiOnlyList.entities).toHaveLength(1);
    expect(aiOnlyList.entities[0].id).toBe(aiEntity.id);

    const allList = await listEntitiesForUser(owner.id, campaign.id, {
      source: "ALL",
    });
    expect(allList.entities).toHaveLength(2);
  });

  it("returns empty counts for a non-member", async () => {
    const owner = await makeUser("facets-owner@test.com");
    const stranger = await makeUser("facets-stranger@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    await expect(
      getEntityTypeCounts(stranger.id, campaign.id),
    ).resolves.toEqual({});
  });
});

describe("entity provenance", () => {
  it("summarizes origin and latest change from the change history", async () => {
    const owner = await makeUser("prov@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Mordecai",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await updateEntity(owner.id, campaign.id, entity.id, {
      type: "NPC",
      name: "Mordecai the Guide",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    const prov = await getEntityProvenance(owner.id, campaign.id, entity.id);
    expect(prov).not.toBeNull();
    expect(prov?.source).toBe("DM");
    expect(prov?.authorLabel).toBe("prov@test.com");
    expect(prov?.approvedByLabel).toBe("prov@test.com");
    expect(prov?.changeCount).toBe(2);
    expect(prov?.lastChangeTitle).toBe("Update Mordecai");
  });

  it("returns null for a non-member", async () => {
    const owner = await makeUser("prov-owner@test.com");
    const stranger = await makeUser("prov-stranger@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const entity = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Hidden NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    await expect(
      getEntityProvenance(stranger.id, campaign.id, entity.id),
    ).resolves.toBeNull();
  });
});

describe("tagging system", () => {
  it("aggregates unique tags in a campaign and ignores archived ones", async () => {
    const owner = await makeUser("tagowner@test.com");
    const campaign = await createCampaign(owner.id, { name: "Tags Campaign" });

    // Entity 1: lowercase & mixed tags
    await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Mordecai",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["Guide", "lore"],
    });

    // Entity 2: duplicates and different casing
    await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Carl",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["guide", "crawler"],
    });

    // Entity 3: archived entity (should be ignored)
    const archived = await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Dead NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["ignored"],
    });
    await archiveEntity(owner.id, campaign.id, archived.id);

    const tags = await listCampaignTags(owner.id, campaign.id);
    expect(tags).toContain("Guide");
    expect(tags).toContain("crawler");
    expect(tags).toContain("lore");
    expect(tags).not.toContain("ignored");
    expect(tags).toHaveLength(3);
  });

  it("restricts listCampaignTags to visible entities for players", async () => {
    const owner = await makeUser("tagowner2@test.com");
    const playerUser = await makeUser("tagplayer2@test.com");
    const campaign = await createCampaign(owner.id, { name: "Tags Campaign 2" });

    // Join campaign as player
    await prisma.membership.create({
      data: {
        userId: playerUser.id,
        campaignId: campaign.id,
        role: "PLAYER",
      },
    });

    // DM only entity with secret tag
    await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Secret NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["secret-tag"],
    });

    // Player visible entity with public tag
    await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Public NPC",
      summary: "",
      description: "",
      visibility: "SHARED_WITH_PLAYERS",
      tags: ["public-tag"],
    });

    const dmTags = await listCampaignTags(owner.id, campaign.id);
    expect(dmTags).toContain("secret-tag");
    expect(dmTags).toContain("public-tag");

    const playerTags = await listCampaignTags(playerUser.id, campaign.id);
    expect(playerTags).not.toContain("secret-tag");
    expect(playerTags).toContain("public-tag");
  });

  it("filters entities by tag with listEntitiesForUser", async () => {
    const owner = await makeUser("tagfilter@test.com");
    const campaign = await createCampaign(owner.id, { name: "Filter Campaign" });

    await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Guide NPC",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["Guide"],
    });

    await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "Crawler Carl",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["crawler"],
    });

    // Specific tag filter
    const crawlerList = await listEntitiesForUser(owner.id, campaign.id, {
      tag: "crawler",
    });
    expect(crawlerList.entities).toHaveLength(1);
    expect(crawlerList.entities[0].name).toBe("Crawler Carl");

    // Case-insensitive filtering
    const guideList = await listEntitiesForUser(owner.id, campaign.id, {
      tag: "guide",
    });
    expect(guideList.entities).toHaveLength(1);
    expect(guideList.entities[0].name).toBe("Guide NPC");
  });

  it("searches tags inside the query filter in listEntitiesForUser", async () => {
    const owner = await makeUser("tagsearch@test.com");
    const campaign = await createCampaign(owner.id, { name: "Search Campaign" });

    await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "NPC 1",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["lore"],
    });

    await createGenericEntity(owner.id, campaign.id, {
      type: "NPC",
      name: "NPC 2",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["combat"],
    });

    // Search query matches tags
    const loreList = await listEntitiesForUser(owner.id, campaign.id, {
      query: "lore",
    });
    expect(loreList.entities).toHaveLength(1);
    expect(loreList.entities[0].name).toBe("NPC 1");
  });
});
