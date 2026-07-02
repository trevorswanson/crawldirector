import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";
import {
  CanonStatus,
  ChangeSource,
  EntityType,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { RelationshipType } from "@/generated/prisma/client";
import { createCampaign } from "@/server/services/campaigns";
import {
  getMyCrawlerLoadout,
  getMyCrawlerSheet,
  listAssignableCrawlers,
  listPlayerMemberships,
  setPlayerCrawler,
} from "@/server/services/crawlers";

// Service-layer tests against a real Postgres (see campaigns.test.ts). The
// player↔crawler link is membership metadata, not canon, so it does not route
// through the review pipeline; these lock the link + the own-crawler read
// projection (invariant #5).
function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function addPlayer(userId: string, campaignId: string) {
  return prisma.membership.create({
    data: { userId, campaignId, role: Role.PLAYER },
  });
}

async function makeCrawler(
  campaignId: string,
  name: string,
  overrides: {
    visibility?: Visibility;
    status?: CanonStatus;
    crawler?: Record<string, unknown>;
  } = {},
) {
  return prisma.entity.create({
    data: {
      campaignId,
      type: EntityType.CRAWLER,
      name,
      visibility: overrides.visibility ?? Visibility.DM_ONLY,
      status: overrides.status ?? CanonStatus.CANON,
      source: ChangeSource.DM,
      isStub: false,
      crawler: {
        create: {
          level: 7,
          hp: 42,
          mp: 12,
          gold: 300,
          currentFloor: 9,
          isAlive: true,
          killCount: 5,
          viewCount: BigInt(0),
          followerCount: BigInt(1200),
          favoriteCount: BigInt(0),
          ...(overrides.crawler ?? {}),
        },
      },
    },
  });
}

async function makeEntity(
  campaignId: string,
  type: EntityType,
  name: string,
  overrides: { status?: CanonStatus; visibility?: Visibility } = {},
) {
  return prisma.entity.create({
    data: {
      campaignId,
      type,
      name,
      status: overrides.status ?? CanonStatus.CANON,
      visibility: overrides.visibility ?? Visibility.DM_ONLY,
    },
  });
}

async function link(
  campaignId: string,
  type: RelationshipType,
  sourceId: string,
  targetId: string,
  overrides: { secret?: boolean; status?: CanonStatus } = {},
) {
  return prisma.relationship.create({
    data: {
      campaignId,
      type,
      sourceId,
      targetId,
      secret: overrides.secret ?? false,
      status: overrides.status ?? CanonStatus.CANON,
    },
  });
}

beforeEach(async () => {
  await prisma.membership.deleteMany();
  await prisma.relationship.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("setPlayerCrawler", () => {
  it("links and unlinks a player's crawler (DM action)", async () => {
    const owner = await makeUser("dm@link.test");
    const player = await makeUser("p@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link" });
    const membership = await addPlayer(player.id, campaign.id);
    const crawler = await makeCrawler(campaign.id, "Donut");

    await setPlayerCrawler(owner.id, campaign.id, membership.id, crawler.id);
    expect(
      (await prisma.membership.findUnique({ where: { id: membership.id } }))
        ?.crawlerEntityId,
    ).toBe(crawler.id);

    await setPlayerCrawler(owner.id, campaign.id, membership.id, null);
    expect(
      (await prisma.membership.findUnique({ where: { id: membership.id } }))
        ?.crawlerEntityId,
    ).toBeNull();
  });

  it("rejects a non-crawler entity", async () => {
    const owner = await makeUser("dm2@link.test");
    const player = await makeUser("p2@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link2" });
    const membership = await addPlayer(player.id, campaign.id);
    const npc = await prisma.entity.create({
      data: { campaignId: campaign.id, type: EntityType.NPC, name: "Mordecai" },
    });

    await expect(
      setPlayerCrawler(owner.id, campaign.id, membership.id, npc.id),
    ).rejects.toThrow(/does not exist in this campaign/);
  });

  it("rejects a crawler from another campaign", async () => {
    const owner = await makeUser("dm3@link.test");
    const player = await makeUser("p3@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link3" });
    const other = await createCampaign(owner.id, { name: "Other" });
    const membership = await addPlayer(player.id, campaign.id);
    const foreign = await makeCrawler(other.id, "Foreign");

    await expect(
      setPlayerCrawler(owner.id, campaign.id, membership.id, foreign.id),
    ).rejects.toThrow(/does not exist in this campaign/);
  });

  it("refuses a player caller (DM-only)", async () => {
    const owner = await makeUser("dm4@link.test");
    const player = await makeUser("p4@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link4" });
    const membership = await addPlayer(player.id, campaign.id);
    const crawler = await makeCrawler(campaign.id, "Carl");

    await expect(
      setPlayerCrawler(player.id, campaign.id, membership.id, crawler.id),
    ).rejects.toThrow(/permission/);
  });

  it("rejects a non-PLAYER target membership", async () => {
    const owner = await makeUser("dm5@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link5" });
    const ownerMembership = await prisma.membership.findFirstOrThrow({
      where: { campaignId: campaign.id, userId: owner.id },
    });
    const crawler = await makeCrawler(campaign.id, "Carl");

    await expect(
      setPlayerCrawler(owner.id, campaign.id, ownerMembership.id, crawler.id),
    ).rejects.toThrow(/Only players control crawlers/);
  });

  it("rejects a membership from another campaign", async () => {
    const owner = await makeUser("dm6@link.test");
    const player = await makeUser("p6@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link6" });
    const other = await createCampaign(owner.id, { name: "Other6" });
    const foreignMembership = await addPlayer(player.id, other.id);
    const crawler = await makeCrawler(campaign.id, "Carl");

    await expect(
      setPlayerCrawler(owner.id, campaign.id, foreignMembership.id, crawler.id),
    ).rejects.toThrow(/not part of this campaign/);
  });
});

describe("listPlayerMemberships / listAssignableCrawlers", () => {
  it("lists players with their linked crawler and the assignable crawlers", async () => {
    const owner = await makeUser("dm7@link.test");
    const p1 = await prisma.user.create({
      data: { email: "p7a@link.test", name: "Alice" },
    });
    const p2 = await makeUser("p7b@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link7" });
    const m1 = await addPlayer(p1.id, campaign.id);
    await addPlayer(p2.id, campaign.id);
    const carl = await makeCrawler(campaign.id, "Carl", {
      status: CanonStatus.PENDING,
    });
    const donut = await makeCrawler(campaign.id, "Donut");
    await setPlayerCrawler(owner.id, campaign.id, m1.id, carl.id);

    const players = await listPlayerMemberships(owner.id, campaign.id);
    expect(players).toHaveLength(2);
    const alice = players.find((p) => p.userId === p1.id);
    const bob = players.find((p) => p.userId === p2.id);
    expect(alice).toMatchObject({
      userName: "Alice",
      userEmail: "p7a@link.test",
      crawler: { id: carl.id, name: "Carl" },
    });
    expect(bob?.crawler).toBeNull();

    // Owner is not a PLAYER, so not listed.
    expect(players.some((p) => p.userId === owner.id)).toBe(false);

    // An archived (removed) crawler is excluded from the picker.
    const archived = await makeCrawler(campaign.id, "Gone", {
      status: CanonStatus.ARCHIVED,
    });

    const crawlers = await listAssignableCrawlers(owner.id, campaign.id);
    expect(crawlers.map((c) => c.id).sort()).toEqual([carl.id, donut.id].sort());
    expect(crawlers.some((c) => c.id === archived.id)).toBe(false);
    // A PENDING crawler is still assignable (linkable ahead of approval).
    expect(crawlers.find((c) => c.id === carl.id)?.status).toBe(
      CanonStatus.PENDING,
    );

    await expect(
      listPlayerMemberships(p1.id, campaign.id),
    ).rejects.toThrow(/permission/);
    await expect(
      listAssignableCrawlers(p2.id, campaign.id),
    ).rejects.toThrow(/permission/);
  });
});

describe("getMyCrawlerSheet", () => {
  it("returns the caller's own linked crawler sheet (even DM_ONLY)", async () => {
    const owner = await makeUser("dm8@link.test");
    const player = await makeUser("p8@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link8" });
    const membership = await addPlayer(player.id, campaign.id);
    const crawler = await makeCrawler(campaign.id, "Carl", {
      visibility: Visibility.DM_ONLY,
      crawler: { stats: { STR: 80, DEX: 40 } },
    });
    await setPlayerCrawler(owner.id, campaign.id, membership.id, crawler.id);

    const sheet = await getMyCrawlerSheet(player.id, campaign.id);
    expect(sheet).toMatchObject({
      entityId: crawler.id,
      name: "Carl",
      level: 7,
      hp: 42,
      mp: 12,
      gold: 300,
      currentFloor: 9,
      isAlive: true,
      killCount: 5,
      stats: { STR: 80, DEX: 40 },
    });
    expect(sheet?.followerCount).toBe(BigInt(1200));
  });

  it("returns null when the player has no crawler linked", async () => {
    const owner = await makeUser("dm9@link.test");
    const player = await makeUser("p9@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link9" });
    await addPlayer(player.id, campaign.id);

    expect(await getMyCrawlerSheet(player.id, campaign.id)).toBeNull();
  });

  it("returns null for a non-member and never another player's crawler", async () => {
    const owner = await makeUser("dm10@link.test");
    const player = await makeUser("p10@link.test");
    const outsider = await makeUser("out10@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link10" });
    const membership = await addPlayer(player.id, campaign.id);
    const crawler = await makeCrawler(campaign.id, "Carl");
    await setPlayerCrawler(owner.id, campaign.id, membership.id, crawler.id);

    // The outsider isn't a member -> no membership row -> null.
    expect(await getMyCrawlerSheet(outsider.id, campaign.id)).toBeNull();
    // A second player without a link doesn't inherit the first player's crawler.
    const player2 = await makeUser("p10b@link.test");
    await addPlayer(player2.id, campaign.id);
    expect(await getMyCrawlerSheet(player2.id, campaign.id)).toBeNull();
  });

  it("does not surface a non-CANON linked crawler to the player (invariant #5)", async () => {
    const owner = await makeUser("dm12@link.test");
    const player = await makeUser("p12@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link12" });
    const membership = await addPlayer(player.id, campaign.id);
    // A PENDING crawler (e.g. an unapproved AI CREATE_ENTITY proposal) linked
    // ahead of approval must not render — the player sees the empty state.
    const pending = await makeCrawler(campaign.id, "Proposed Carl", {
      status: CanonStatus.PENDING,
    });
    await setPlayerCrawler(owner.id, campaign.id, membership.id, pending.id);
    expect(await getMyCrawlerSheet(player.id, campaign.id)).toBeNull();

    // Archiving flips status to ARCHIVED without clearing the link (SetNull only
    // fires on a hard delete), so the archived crawler must also stop rendering.
    await prisma.entity.update({
      where: { id: pending.id },
      data: { status: CanonStatus.ARCHIVED },
    });
    expect(await getMyCrawlerSheet(player.id, campaign.id)).toBeNull();

    // Once CANON, the player's own crawler renders.
    await prisma.entity.update({
      where: { id: pending.id },
      data: { status: CanonStatus.CANON },
    });
    expect((await getMyCrawlerSheet(player.id, campaign.id))?.entityId).toBe(
      pending.id,
    );
  });

  it("drops non-numeric stat values so the sheet never shows garbage", async () => {
    const owner = await makeUser("dm11@link.test");
    const player = await makeUser("p11@link.test");
    const campaign = await createCampaign(owner.id, { name: "Link11" });
    const membership = await addPlayer(player.id, campaign.id);
    const crawler = await makeCrawler(campaign.id, "Carl", {
      crawler: { stats: { STR: 55, BOGUS: "x", NESTED: { a: 1 } } },
    });
    await setPlayerCrawler(owner.id, campaign.id, membership.id, crawler.id);

    const sheet = await getMyCrawlerSheet(player.id, campaign.id);
    expect(sheet?.stats).toEqual({ STR: 55 });
  });
});

describe("getMyCrawlerLoadout", () => {
  async function setup() {
    const owner = await makeUser(`dm-load-${Math.random()}@x.test`);
    const player = await makeUser(`p-load-${Math.random()}@x.test`);
    const campaign = await createCampaign(owner.id, { name: "Loadout" });
    const membership = await addPlayer(player.id, campaign.id);
    const crawler = await makeCrawler(campaign.id, "Carl");
    await setPlayerCrawler(owner.id, campaign.id, membership.id, crawler.id);
    return { owner, player, campaign, crawler };
  }

  it("returns inventory, achievements, titles, and the loot-box reward chain", async () => {
    const { player, campaign, crawler } = await setup();

    // Inventory (even a DM_ONLY item — the link is the read grant).
    const sword = await makeEntity(campaign.id, EntityType.ITEM, "Vorpal Sword");
    await link(campaign.id, RelationshipType.OWNS_ITEM, crawler.id, sword.id);

    // Title.
    const title = await makeEntity(campaign.id, EntityType.TITLE, "Goblin Slayer");
    await link(campaign.id, RelationshipType.HOLDS_TITLE, crawler.id, title.id);

    // Achievement → box → contained item (the reward chain).
    const ach = await makeEntity(
      campaign.id,
      EntityType.ACHIEVEMENT,
      "First Blood",
    );
    await link(campaign.id, RelationshipType.EARNED_ACHIEVEMENT, crawler.id, ach.id);
    const box = await makeEntity(campaign.id, EntityType.BOX, "Bronze Box");
    await link(campaign.id, RelationshipType.GRANTS_BOX, ach.id, box.id);
    const potion = await makeEntity(campaign.id, EntityType.ITEM, "Health Potion");
    await link(campaign.id, RelationshipType.CONTAINS, box.id, potion.id);

    const loadout = await getMyCrawlerLoadout(player.id, campaign.id);
    expect(loadout?.items.map((i) => i.name)).toEqual(["Vorpal Sword"]);
    expect(loadout?.titles.map((t) => t.name)).toEqual(["Goblin Slayer"]);
    expect(loadout?.achievements.map((a) => a.name)).toEqual(["First Blood"]);
    expect(loadout?.lootBoxes).toHaveLength(1);
    expect(loadout?.lootBoxes[0]).toMatchObject({
      name: "Bronze Box",
      type: EntityType.BOX,
      fromAchievement: "First Blood",
    });
    expect(loadout?.lootBoxes[0].contents.map((c) => c.name)).toEqual([
      "Health Potion",
    ]);
  });

  it("hides secret edges and edges to non-CANON entities (invariant #5)", async () => {
    const { player, campaign, crawler } = await setup();

    // A secret OWNS_ITEM edge is DM-held knowledge — never on the player's sheet.
    const cursed = await makeEntity(campaign.id, EntityType.ITEM, "Cursed Ring");
    await link(campaign.id, RelationshipType.OWNS_ITEM, crawler.id, cursed.id, {
      secret: true,
    });
    // A visible edge to a still-PENDING item must not leak the unapproved entity.
    const pending = await makeEntity(campaign.id, EntityType.ITEM, "Proposed Loot", {
      status: CanonStatus.PENDING,
    });
    await link(campaign.id, RelationshipType.OWNS_ITEM, crawler.id, pending.id);
    // An archived edge is gone.
    const dropped = await makeEntity(campaign.id, EntityType.ITEM, "Old Boot");
    await link(campaign.id, RelationshipType.OWNS_ITEM, crawler.id, dropped.id, {
      status: CanonStatus.ARCHIVED,
    });
    // A box behind a secret GRANTS_BOX edge is not revealed either.
    const ach = await makeEntity(campaign.id, EntityType.ACHIEVEMENT, "Hidden");
    await link(campaign.id, RelationshipType.EARNED_ACHIEVEMENT, crawler.id, ach.id);
    const box = await makeEntity(campaign.id, EntityType.BOX, "Secret Box");
    await link(campaign.id, RelationshipType.GRANTS_BOX, ach.id, box.id, {
      secret: true,
    });

    const loadout = await getMyCrawlerLoadout(player.id, campaign.id);
    expect(loadout?.items).toEqual([]);
    expect(loadout?.achievements.map((a) => a.name)).toEqual(["Hidden"]);
    expect(loadout?.lootBoxes).toEqual([]);
  });

  it("returns null for a non-member, an unlinked player, and another campaign's crawler", async () => {
    const { campaign } = await setup();
    const outsider = await makeUser("out-load@x.test");
    expect(await getMyCrawlerLoadout(outsider.id, campaign.id)).toBeNull();

    const owner2 = await makeUser("dm-load2@x.test");
    const player2 = await makeUser("p-load2@x.test");
    const campaign2 = await createCampaign(owner2.id, { name: "Loadout2" });
    await addPlayer(player2.id, campaign2.id);
    // A member with no crawler linked gets an empty loadout, not another's.
    expect(await getMyCrawlerLoadout(player2.id, campaign2.id)).toBeNull();
  });

  it("returns null when the linked crawler is not CANON", async () => {
    const owner = await makeUser("dm-load3@x.test");
    const player = await makeUser("p-load3@x.test");
    const campaign = await createCampaign(owner.id, { name: "Loadout3" });
    const membership = await addPlayer(player.id, campaign.id);
    const pending = await makeCrawler(campaign.id, "Proposed", {
      status: CanonStatus.PENDING,
    });
    await setPlayerCrawler(owner.id, campaign.id, membership.id, pending.id);
    expect(await getMyCrawlerLoadout(player.id, campaign.id)).toBeNull();
  });

  it("dedupes a box granted by two earned achievements", async () => {
    const { player, campaign, crawler } = await setup();
    const a1 = await makeEntity(campaign.id, EntityType.ACHIEVEMENT, "Alpha");
    const a2 = await makeEntity(campaign.id, EntityType.ACHIEVEMENT, "Beta");
    await link(campaign.id, RelationshipType.EARNED_ACHIEVEMENT, crawler.id, a1.id);
    await link(campaign.id, RelationshipType.EARNED_ACHIEVEMENT, crawler.id, a2.id);
    const box = await makeEntity(campaign.id, EntityType.BOX, "Shared Box");
    await link(campaign.id, RelationshipType.GRANTS_BOX, a1.id, box.id);
    await link(campaign.id, RelationshipType.GRANTS_BOX, a2.id, box.id);

    const loadout = await getMyCrawlerLoadout(player.id, campaign.id);
    expect(loadout?.lootBoxes).toHaveLength(1);
    expect(loadout?.lootBoxes[0].fromAchievement).toBe("Alpha");
  });
});
