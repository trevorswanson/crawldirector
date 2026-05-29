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
      fanCount: BigInt(1000),
      killCount: 7,
      currentFloor: 2,
      isAlive: true,
    });

    const detail = await getEntityForUser(owner.id, campaign.id, crawler.id);
    expect(detail?.type).toBe("CRAWLER");
    expect(detail?.crawler?.level).toBe(3);
    expect(detail?.crawler?.fanCount).toBe(BigInt(1000));

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

  it("preserves large crawler fan counts as bigint values", async () => {
    const owner = await makeUser("bigfans@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const fanCount = BigInt("9007199254740993");

    const crawler = await createCrawler(owner.id, campaign.id, {
      name: "Famous Crawler",
      summary: "",
      description: "",
      visibility: "PLAYER_FACING",
      tags: [],
      level: 1,
      gold: 0,
      fanCount,
      killCount: 0,
      isAlive: true,
    });

    expect(
      (await getEntityForUser(owner.id, campaign.id, crawler.id))?.crawler
        ?.fanCount,
    ).toBe(fanCount);

    const updatedFanCount = BigInt("9007199254740995");
    await updateEntity(owner.id, campaign.id, crawler.id, {
      type: "CRAWLER",
      name: "Famous Crawler",
      summary: "",
      description: "",
      visibility: "PLAYER_FACING",
      tags: [],
      level: 1,
      gold: 0,
      fanCount: updatedFanCount,
      killCount: 0,
      isAlive: true,
    });

    expect(
      (await getEntityForUser(owner.id, campaign.id, crawler.id))?.crawler
        ?.fanCount,
    ).toBe(updatedFanCount);
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
      fanCount: BigInt(0),
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
      fanCount: BigInt(500),
      killCount: 3,
      currentFloor: 1,
      isAlive: true,
    });

    const detail = await getEntityForUser(owner.id, campaign.id, crawler.id);
    expect(detail?.name).toBe("Crawler Carl");
    expect(detail?.version).toBe(2);
    expect(detail?.crawler?.level).toBe(2);
    expect(detail?.crawler?.fanCount).toBe(BigInt(500));
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
