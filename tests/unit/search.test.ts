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
  archiveRelationship,
  createRelationship,
  updateRelationship,
} from "@/server/services/relationships";
import {
  archiveEvent,
  createEvent,
  updateEvent,
} from "@/server/services/events";
import {
  buildEntityContent,
  buildEventContent,
  buildRelationshipContent,
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
  await prisma.eventCausality.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.relationship.deleteMany();
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

describe("buildRelationshipContent", () => {
  it("joins the type phrase, both endpoint names and notes, dropping blanks", () => {
    expect(
      buildRelationshipContent({
        typePhrase: "ally of",
        sourceName: "Princess Donut",
        targetName: "Mordecai",
        notes: "trusted partner",
      }),
    ).toBe("ally of\nPrincess Donut\nMordecai\ntrusted partner");
  });

  it("drops blank notes", () => {
    expect(
      buildRelationshipContent({
        typePhrase: "enemy of",
        sourceName: "Carl",
        targetName: "The Maestro",
        notes: null,
      }),
    ).toBe("enemy of\nCarl\nThe Maestro");
  });
});

describe("buildEventContent", () => {
  it("joins title, summary and description, dropping blanks", () => {
    expect(
      buildEventContent({
        title: "The Grand Betrayal",
        summary: "Donut is double-crossed",
        description: null,
      }),
    ).toBe("The Grand Betrayal\nDonut is double-crossed");
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

describe("relationship indexing on canon writes", () => {
  it("indexes a created relationship so it is findable", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const donut = await makeEntity(dm.id, campaign.id, { name: "Princess Donut" });
    const mordecai = await makeEntity(dm.id, campaign.id, { name: "Mordecai" });

    const { id } = await createRelationship(dm.id, campaign.id, donut.id, {
      type: "ALLY_OF",
      targetId: mordecai.id,
      notes: "zorptastic bond",
      secret: false,
    });

    const doc = await prisma.searchDoc.findFirst({
      where: { targetType: "RELATIONSHIP", targetId: id },
    });
    expect(doc?.campaignId).toBe(campaign.id);
    expect(doc?.visibility).toBe("PLAYER_VISIBLE");

    const { hits } = await searchCanon(dm.id, campaign.id, "zorptastic");
    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit.targetType).toBe("RELATIONSHIP");
    if (hit.targetType !== "RELATIONSHIP") throw new Error("expected relationship hit");
    expect(hit.targetId).toBe(id);
    expect(hit.relationship.sourceEntity.name).toBe("Princess Donut");
    expect(hit.relationship.targetEntity.name).toBe("Mordecai");
    expect(hit.relationship.type).toBe("ALLY_OF");
  });

  it("re-indexes an updated relationship (new notes become searchable)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const a = await makeEntity(dm.id, campaign.id, { name: "Alpha" });
    const b = await makeEntity(dm.id, campaign.id, { name: "Beta" });
    const { id } = await createRelationship(dm.id, campaign.id, a.id, {
      type: "ALLY_OF",
      targetId: b.id,
      notes: "original",
      secret: false,
    });

    expect((await searchCanon(dm.id, campaign.id, "necroglyph")).hits).toHaveLength(0);

    await updateRelationship(dm.id, campaign.id, id, {
      type: "ALLY_OF",
      notes: "necroglyph pact",
      secret: false,
    });

    const { hits } = await searchCanon(dm.id, campaign.id, "necroglyph");
    expect(hits.map((h) => h.targetId)).toEqual([id]);
  });

  it("drops an archived relationship from the index", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const a = await makeEntity(dm.id, campaign.id, { name: "Gamma" });
    const b = await makeEntity(dm.id, campaign.id, { name: "Delta" });
    const { id } = await createRelationship(dm.id, campaign.id, a.id, {
      type: "ALLY_OF",
      targetId: b.id,
      notes: "doomededge",
      secret: false,
    });
    expect((await searchCanon(dm.id, campaign.id, "doomededge")).hits).toHaveLength(1);

    await archiveRelationship(dm.id, campaign.id, id);

    expect(
      await prisma.searchDoc.findFirst({ where: { targetId: id } }),
    ).toBeNull();
    expect((await searchCanon(dm.id, campaign.id, "doomededge")).hits).toHaveLength(0);
  });

  it("hides secret edges and edges to hidden endpoints from players (invariant #5)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const player = await addPlayer(campaign.id, "player@test.com");

    const visibleA = await makeEntity(dm.id, campaign.id, { name: "Open One" });
    const visibleB = await makeEntity(dm.id, campaign.id, { name: "Open Two" });
    const hidden = await makeEntity(dm.id, campaign.id, {
      name: "Hidden One",
      visibility: "DM_ONLY",
    });

    // A: visible↔visible, open. B: visible↔visible, secret. C: visible↔hidden.
    const open = await createRelationship(dm.id, campaign.id, visibleA.id, {
      type: "ALLY_OF",
      targetId: visibleB.id,
      notes: "edgeword",
      secret: false,
    });
    await createRelationship(dm.id, campaign.id, visibleA.id, {
      type: "ENEMY_OF",
      targetId: visibleB.id,
      notes: "edgeword",
      secret: true,
    });
    await createRelationship(dm.id, campaign.id, visibleA.id, {
      type: "KNOWS_ABOUT",
      targetId: hidden.id,
      notes: "edgeword",
      secret: false,
    });

    const dmResult = await searchCanon(dm.id, campaign.id, "edgeword");
    expect(dmResult.hits).toHaveLength(3);

    const playerResult = await searchCanon(player.id, campaign.id, "edgeword");
    expect(playerResult.hits.map((h) => h.targetId)).toEqual([open.id]);
  });
});

describe("event indexing on canon writes", () => {
  it("indexes a created event so it is findable", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const donut = await makeEntity(dm.id, campaign.id, { name: "Princess Donut" });

    const event = await createEvent(dm.id, campaign.id, {
      title: "The Grand Betrayal",
      summary: "zorpevent unfolds",
      participants: [{ entityId: donut.id, role: "ACTOR" }],
      secret: false,
    });

    const doc = await prisma.searchDoc.findFirst({
      where: { targetType: "EVENT", targetId: event.id },
    });
    expect(doc?.campaignId).toBe(campaign.id);
    expect(doc?.visibility).toBe("PLAYER_VISIBLE");

    const { hits } = await searchCanon(dm.id, campaign.id, "zorpevent");
    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit.targetType).toBe("EVENT");
    if (hit.targetType !== "EVENT") throw new Error("expected event hit");
    expect(hit.targetId).toBe(event.id);
    expect(hit.event.title).toBe("The Grand Betrayal");
  });

  it("re-indexes an updated event (new title becomes searchable)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const donut = await makeEntity(dm.id, campaign.id, { name: "Princess Donut" });
    const event = await createEvent(dm.id, campaign.id, {
      title: "Placeholder Event",
      summary: "before",
      participants: [{ entityId: donut.id, role: "ACTOR" }],
      secret: false,
    });

    expect((await searchCanon(dm.id, campaign.id, "cataclysm")).hits).toHaveLength(0);

    await updateEvent(dm.id, campaign.id, event.id, {
      title: "The Cataclysm",
      summary: "after",
      secret: false,
    });

    const { hits } = await searchCanon(dm.id, campaign.id, "cataclysm");
    expect(hits.map((h) => h.targetId)).toEqual([event.id]);
  });

  it("drops an archived event from the index", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const donut = await makeEntity(dm.id, campaign.id, { name: "Princess Donut" });
    const event = await createEvent(dm.id, campaign.id, {
      title: "Doomed Gathering",
      summary: "vanishingsoon",
      participants: [{ entityId: donut.id, role: "ACTOR" }],
      secret: false,
    });
    expect((await searchCanon(dm.id, campaign.id, "vanishingsoon")).hits).toHaveLength(1);

    await archiveEvent(dm.id, campaign.id, event.id);

    expect(
      await prisma.searchDoc.findFirst({ where: { targetId: event.id } }),
    ).toBeNull();
    expect((await searchCanon(dm.id, campaign.id, "vanishingsoon")).hits).toHaveLength(0);
  });

  it("hides secret events and events with only hidden participants from players (invariant #5)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const player = await addPlayer(campaign.id, "player@test.com");

    const visible = await makeEntity(dm.id, campaign.id, { name: "Seen Hero" });
    const hidden = await makeEntity(dm.id, campaign.id, {
      name: "Unseen Villain",
      visibility: "DM_ONLY",
    });

    const open = await createEvent(dm.id, campaign.id, {
      title: "Public Skirmish",
      summary: "eventword",
      participants: [{ entityId: visible.id, role: "ACTOR" }],
      secret: false,
    });
    await createEvent(dm.id, campaign.id, {
      title: "Hidden Meeting",
      summary: "eventword",
      participants: [{ entityId: visible.id, role: "ACTOR" }],
      secret: true,
    });
    await createEvent(dm.id, campaign.id, {
      title: "Villain Scheme",
      summary: "eventword",
      participants: [{ entityId: hidden.id, role: "ACTOR" }],
      secret: false,
    });

    const dmResult = await searchCanon(dm.id, campaign.id, "eventword");
    expect(dmResult.hits).toHaveLength(3);

    const playerResult = await searchCanon(player.id, campaign.id, "eventword");
    expect(playerResult.hits.map((h) => h.targetId)).toEqual([open.id]);
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

  it("rebuilds relationship and event docs too", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const a = await makeEntity(dm.id, campaign.id, { name: "Knight" });
    const b = await makeEntity(dm.id, campaign.id, { name: "Squire" });
    const rel = await createRelationship(dm.id, campaign.id, a.id, {
      type: "MENTOR_OF",
      targetId: b.id,
      notes: "reindexrel",
      secret: false,
    });
    const event = await createEvent(dm.id, campaign.id, {
      title: "Reindex Rite",
      summary: "reindexevt",
      participants: [{ entityId: a.id, role: "ACTOR" }],
      secret: false,
    });

    // Wipe the index out from under the campaign (all three target types).
    await prisma.searchDoc.deleteMany();
    expect((await searchCanon(dm.id, campaign.id, "reindexrel")).hits).toHaveLength(0);
    expect((await searchCanon(dm.id, campaign.id, "reindexevt")).hits).toHaveLength(0);

    // 2 entities + 1 relationship + 1 event.
    const { indexed } = await reindexCampaign(dm.id, campaign.id);
    expect(indexed).toBe(4);

    expect((await searchCanon(dm.id, campaign.id, "reindexrel")).hits.map((h) => h.targetId)).toEqual([
      rel.id,
    ]);
    expect((await searchCanon(dm.id, campaign.id, "reindexevt")).hits.map((h) => h.targetId)).toEqual([
      event.id,
    ]);
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
