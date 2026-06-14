import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  archiveEntity,
  createGenericEntity,
  updateEntity,
} from "@/server/services/entities";
import {
  buildEntityContent,
  reindexCampaign,
} from "@/server/services/search-index";
import { searchCanon } from "@/server/services/search";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function addPlayer(campaignId: string, email: string) {
  const player = await makeUser(email);
  await prisma.membership.create({
    data: { userId: player.id, campaignId, role: Role.PLAYER },
  });
  return player;
}

function makeEntity(
  userId: string,
  campaignId: string,
  overrides: {
    name: string;
    summary?: string;
    description?: string;
    visibility?: "DM_ONLY" | "PLAYER_VISIBLE";
    tags?: string[];
    type?: "NPC" | "LOCATION";
  },
) {
  return createGenericEntity(userId, campaignId, {
    type: overrides.type ?? "NPC",
    name: overrides.name,
    summary: overrides.summary ?? "",
    description: overrides.description ?? "",
    visibility: overrides.visibility ?? "PLAYER_VISIBLE",
    tags: overrides.tags ?? [],
  });
}

beforeEach(async () => {
  await prisma.searchDoc.deleteMany();
  await prisma.crawler.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("buildEntityContent", () => {
  it("joins name, summary, description and tags, dropping blanks", () => {
    expect(
      buildEntityContent({
        name: "The Maestro",
        summary: "A manipulative manager",
        description: null,
        tags: ["faction", "boss"],
      }),
    ).toBe("The Maestro\nA manipulative manager\nfaction\nboss");
  });

  it("returns an empty string when every field is blank", () => {
    expect(
      buildEntityContent({ name: "", summary: "  ", description: null, tags: [] }),
    ).toBe("");
  });
});

describe("search indexing on canon writes", () => {
  it("indexes a created entity so it is findable", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const entity = await makeEntity(dm.id, campaign.id, {
      name: "Princess Donut",
      summary: "A royal cat crawler with attitude",
    });

    const doc = await prisma.searchDoc.findFirst({
      where: { targetType: "ENTITY", targetId: entity.id },
    });
    expect(doc).not.toBeNull();
    expect(doc?.campaignId).toBe(campaign.id);

    const { hits } = await searchCanon(dm.id, campaign.id, "royal cat");
    expect(hits.map((h) => h.targetId)).toContain(entity.id);
  });

  it("re-indexes an updated entity (new text becomes searchable)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const entity = await makeEntity(dm.id, campaign.id, { name: "Mystery NPC" });

    expect((await searchCanon(dm.id, campaign.id, "necromancer")).hits).toHaveLength(0);

    await updateEntity(dm.id, campaign.id, entity.id, {
      type: "NPC",
      name: "Mordecai the Necromancer",
      summary: "Raises the fallen",
      description: "",
      visibility: "PLAYER_VISIBLE",
      tags: [],
    });

    const { hits } = await searchCanon(dm.id, campaign.id, "necromancer");
    expect(hits.map((h) => h.targetId)).toEqual([entity.id]);
  });

  it("drops an archived entity from the index", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const entity = await makeEntity(dm.id, campaign.id, {
      name: "Doomed Goblin",
      summary: "Soon to be removed",
    });
    expect((await searchCanon(dm.id, campaign.id, "goblin")).hits).toHaveLength(1);

    await archiveEntity(dm.id, campaign.id, entity.id);

    expect(
      await prisma.searchDoc.findFirst({ where: { targetId: entity.id } }),
    ).toBeNull();
    expect((await searchCanon(dm.id, campaign.id, "goblin")).hits).toHaveLength(0);
  });
});

describe("searchCanon scoping & ranking", () => {
  it("scopes results to the campaign", async () => {
    const dm = await makeUser("dm@test.com");
    const campaignA = await createCampaign(dm.id, { name: "A" });
    const campaignB = await createCampaign(dm.id, { name: "B" });
    await makeEntity(dm.id, campaignA.id, { name: "Shared Word", summary: "alpha" });
    const inB = await makeEntity(dm.id, campaignB.id, {
      name: "Shared Word",
      summary: "beta",
    });

    const { hits } = await searchCanon(dm.id, campaignB.id, "shared word");
    expect(hits.map((h) => h.targetId)).toEqual([inB.id]);
  });

  it("hides DM-only entities from players (invariant #5)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const player = await addPlayer(campaign.id, "player@test.com");

    const secret = await makeEntity(dm.id, campaign.id, {
      name: "Secret Conspiracy",
      summary: "hidden plot",
      visibility: "DM_ONLY",
    });
    const open = await makeEntity(dm.id, campaign.id, {
      name: "Public Conspiracy",
      summary: "open plot",
      visibility: "PLAYER_VISIBLE",
    });

    const dmResult = await searchCanon(dm.id, campaign.id, "conspiracy");
    expect(dmResult.hits.map((h) => h.targetId).sort()).toEqual(
      [secret.id, open.id].sort(),
    );

    const playerResult = await searchCanon(player.id, campaign.id, "conspiracy");
    expect(playerResult.role).toBe(Role.PLAYER);
    expect(playerResult.hits.map((h) => h.targetId)).toEqual([open.id]);
  });

  it("returns no hits for a blank query and reports the role", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await makeEntity(dm.id, campaign.id, { name: "Anything" });

    const result = await searchCanon(dm.id, campaign.id, "   ");
    expect(result.hits).toHaveLength(0);
    expect(result.query).toBe("");
    expect(result.role).toBe(Role.OWNER);
  });

  it("returns an empty result for a non-member", async () => {
    const dm = await makeUser("dm@test.com");
    const stranger = await makeUser("stranger@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await makeEntity(dm.id, campaign.id, { name: "Findable", summary: "treasure" });

    const result = await searchCanon(stranger.id, campaign.id, "treasure");
    expect(result.role).toBeNull();
    expect(result.hits).toHaveLength(0);
  });

  it("honours the result limit", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    for (let i = 0; i < 5; i++) {
      await makeEntity(dm.id, campaign.id, {
        name: `Goblin ${i}`,
        summary: "a goblin grunt",
      });
    }
    const { hits } = await searchCanon(dm.id, campaign.id, "goblin", { limit: 2 });
    expect(hits).toHaveLength(2);
  });

  it("matches against tags", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const tagged = await makeEntity(dm.id, campaign.id, {
      name: "Nondescript",
      tags: ["bopca"],
    });
    const { hits } = await searchCanon(dm.id, campaign.id, "bopca");
    expect(hits.map((h) => h.targetId)).toEqual([tagged.id]);
  });
});

describe("reindexCampaign", () => {
  it("rebuilds the entity index from current canon (DM-only)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const entity = await makeEntity(dm.id, campaign.id, {
      name: "Reindexed Knight",
      summary: "a stalwart defender",
    });

    // Wipe the index out from under the campaign, then rebuild it.
    await prisma.searchDoc.deleteMany();
    expect((await searchCanon(dm.id, campaign.id, "stalwart")).hits).toHaveLength(0);

    const { indexed } = await reindexCampaign(dm.id, campaign.id);
    expect(indexed).toBe(1);

    const { hits } = await searchCanon(dm.id, campaign.id, "stalwart");
    expect(hits.map((h) => h.targetId)).toEqual([entity.id]);
  });

  it("rejects a player", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const player = await addPlayer(campaign.id, "player@test.com");

    await expect(reindexCampaign(player.id, campaign.id)).rejects.toThrow(
      /permission/i,
    );
  });

  it("clears the index when there is no canon to rebuild", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Empty" });
    const { indexed } = await reindexCampaign(dm.id, campaign.id);
    expect(indexed).toBe(0);
    expect(
      await prisma.searchDoc.count({ where: { campaignId: campaign.id } }),
    ).toBe(0);
  });
});
