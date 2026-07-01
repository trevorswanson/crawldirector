import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";
import {
  createCampaign,
  getCampaignForUser,
  getMembershipRole,
  listCampaignsForUser,
  getCampaignCanonIntegrity,
  getCampaignHeaderStatus,
} from "@/server/services/campaigns";
import {
  CanonStatus,
  ChangeSource,
  EntityType,
  Role,
  Visibility,
} from "@/generated/prisma/client";

// These tests exercise the service layer against a real Postgres database
// (DATABASE_URL). They wipe the relevant tables between runs, so point
// DATABASE_URL at a disposable/test database. CI provisions one; locally use
// `podman run ... postgres` + `prisma migrate deploy`.
function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

beforeEach(async () => {
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createCampaign", () => {
  it("makes the creator an OWNER member", async () => {
    const user = await makeUser("owner@test.com");
    const campaign = await createCampaign(user.id, { name: "World Dungeon" });

    const membership = await prisma.membership.findFirst({
      where: { campaignId: campaign.id, userId: user.id },
    });
    expect(membership?.role).toBe("OWNER");
  });

  it("returns the member's role (and null for a non-member) via getMembershipRole", async () => {
    const owner = await makeUser("role-owner@test.com");
    const player = await makeUser("role-player@test.com");
    const outsider = await makeUser("role-outsider@test.com");
    const campaign = await createCampaign(owner.id, { name: "Roles" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    expect(await getMembershipRole(owner.id, campaign.id)).toBe(Role.OWNER);
    expect(await getMembershipRole(player.id, campaign.id)).toBe(Role.PLAYER);
    expect(await getMembershipRole(outsider.id, campaign.id)).toBeNull();
  });

  it("persists a provided summary", async () => {
    const user = await makeUser("sum@test.com");
    const campaign = await createCampaign(user.id, {
      name: "Has summary",
      summary: "A floor-by-floor run",
    });

    const stored = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: { summary: true },
    });
    expect(stored?.summary).toBe("A floor-by-floor run");
  });

  it("stores null for an empty summary", async () => {
    const user = await makeUser("nosum@test.com");
    const campaign = await createCampaign(user.id, {
      name: "No summary",
      summary: "",
    });

    const stored = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: { summary: true },
    });
    expect(stored?.summary).toBeNull();
  });

  it("rejects invalid input at the boundary", async () => {
    const user = await makeUser("c@test.com");
    await expect(createCampaign(user.id, { name: "" })).rejects.toThrow();
  });
});

describe("listCampaignsForUser", () => {
  it("scopes listings to the user's own campaigns (tenancy)", async () => {
    const a = await makeUser("a@test.com");
    const b = await makeUser("b@test.com");
    await createCampaign(a.id, { name: "A's world" });

    expect(await listCampaignsForUser(b.id)).toHaveLength(0);

    const aList = await listCampaignsForUser(a.id);
    expect(aList).toHaveLength(1);
    expect(aList[0].name).toBe("A's world");
    // The member projection carries the requesting user's role.
    expect(aList[0].members[0]?.role).toBe("OWNER");
  });
});

describe("getCampaignForUser", () => {
  it("returns the campaign (with member count) for a member", async () => {
    const a = await makeUser("a@test.com");
    const campaign = await createCampaign(a.id, { name: "Secret" });

    const result = await getCampaignForUser(a.id, campaign.id);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Secret");
    expect(result?.members[0]?.role).toBe("OWNER");
    expect(result?._count.members).toBe(1);
  });

  it("returns null when a non-member fetches a campaign (never leak existence)", async () => {
    const a = await makeUser("a@test.com");
    const b = await makeUser("b@test.com");
    const campaign = await createCampaign(a.id, { name: "Secret" });

    expect(await getCampaignForUser(b.id, campaign.id)).toBeNull();
  });
});

describe("getCampaignHeaderStatus", () => {
  it("returns the current floor and latest resolvable absolute day for a member", async () => {
    const owner = await makeUser("hud-owner@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon run" });
    const floor = await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: EntityType.FLOOR,
        name: "The Hunting Grounds",
        data: { floorNumber: 9, startDay: 40, collapseDay: 70 },
        visibility: Visibility.DM_ONLY,
        source: ChangeSource.DM,
        status: CanonStatus.CANON,
      },
    });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { currentFloorId: floor.id },
    });
    await prisma.event.createMany({
      data: [
        {
          campaignId: campaign.id,
          title: "Older scene",
          inGameTime: { basis: "FLOOR_START", floor: 9, offset: 2, unit: "DAY" },
          orderKey: 9,
          rank: "a0",
          status: CanonStatus.CANON,
        },
        {
          campaignId: campaign.id,
          title: "Latest scene",
          inGameTime: { basis: "FLOOR_START", floor: 9, offset: 12, unit: "DAY" },
          orderKey: 9,
          rank: "b0",
          status: CanonStatus.CANON,
        },
      ],
    });

    await expect(getCampaignHeaderStatus(owner.id, campaign.id)).resolves.toEqual({
      currentFloor: { id: floor.id, name: "The Hunting Grounds", floorNumber: 9 },
      currentDay: 52,
    });
  });

  it("defaults floor 1 to day 1 so FLOOR_START events resolve without an explicit startDay", async () => {
    const owner = await makeUser("hud-floor1@test.com");
    const campaign = await createCampaign(owner.id, { name: "Tutorial run" });
    const floor = await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: EntityType.FLOOR,
        name: "Tutorial",
        // No startDay set — the resolution layer should treat floor 1 as day 1.
        data: { floorNumber: 1 },
        visibility: Visibility.DM_ONLY,
        source: ChangeSource.DM,
        status: CanonStatus.CANON,
      },
    });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { currentFloorId: floor.id },
    });
    await prisma.event.create({
      data: {
        campaignId: campaign.id,
        title: "Three days in",
        inGameTime: { basis: "FLOOR_START", floor: 1, offset: 3, unit: "DAY" },
        orderKey: 1,
        rank: "a0",
        status: CanonStatus.CANON,
      },
    });

    await expect(getCampaignHeaderStatus(owner.id, campaign.id)).resolves.toEqual({
      currentFloor: { id: floor.id, name: "Tutorial", floorNumber: 1 },
      currentDay: 4,
    });
  });

  it("returns null for a non-member without leaking campaign status", async () => {
    const owner = await makeUser("hud-owner2@test.com");
    const outsider = await makeUser("hud-outsider@test.com");
    const campaign = await createCampaign(owner.id, { name: "Private crawl" });

    await expect(getCampaignHeaderStatus(outsider.id, campaign.id)).resolves.toBeNull();
  });
});

describe("getCampaignCanonIntegrity", () => {
  it("throws an error if user is not a member", async () => {
    const owner = await makeUser("owner@test.com");
    const outsider = await makeUser("outsider@test.com");
    const campaign = await createCampaign(owner.id, { name: "World" });

    await expect(getCampaignCanonIntegrity(outsider.id, campaign.id)).rejects.toThrow(
      "You do not have access to this campaign."
    );
  });

  it("rejects a player member — canon integrity is a DM-only metric", async () => {
    const owner = await makeUser("owner@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(owner.id, { name: "World" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    await expect(getCampaignCanonIntegrity(player.id, campaign.id)).rejects.toThrow(
      "Only the DM can view canon integrity."
    );
  });

  it("returns 100% DM for an empty campaign", async () => {
    const owner = await makeUser("owner@test.com");
    const campaign = await createCampaign(owner.id, { name: "World" });

    const result = await getCampaignCanonIntegrity(owner.id, campaign.id);
    expect(result).toEqual({
      dmPercent: 100,
      aiPercent: 0,
      playerPercent: 0,
      lockedPercent: 0,
      dmCount: 0,
      aiCount: 0,
      playerCount: 0,
      lockedCount: 0,
      totalFields: 0,
    });
  });

  it("correctly calculates integrity for a mix of DM, AI, Player, and Locked fields", async () => {
    const owner = await makeUser("owner@test.com");
    const campaign = await createCampaign(owner.id, { name: "World" });

    // Create a DM entity.
    // Core fields: name, visibility, isStub. (summary, description, tags are not populated)
    // 3 populated fields, all DM
    await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: EntityType.NPC,
        name: "DM NPC",
        visibility: Visibility.DM_ONLY,
        isStub: false,
        source: ChangeSource.DM,
        status: CanonStatus.CANON,
      },
    });

    // Create an AI entity.
    // Core fields: name, description, visibility, isStub. (summary is null, tags is empty)
    // 4 populated fields, all AI
    const aiEntity = await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: EntityType.NPC,
        name: "AI NPC",
        description: "Generated by AI",
        visibility: Visibility.DM_ONLY,
        isStub: false,
        source: ChangeSource.AI,
        status: CanonStatus.CANON,
      },
    });

    // Create a ChangeSet for AI entity provenance overrides.
    const cs = await prisma.changeSet.create({
      data: {
        campaignId: campaign.id,
        source: ChangeSource.DM,
        title: "Edit AI description",
        status: "APPROVED",
      },
    });

    // Write a DM provenance override for the 'description' field of the AI entity.
    await prisma.provenance.create({
      data: {
        campaignId: campaign.id,
        entityId: aiEntity.id,
        changeSetId: cs.id,
        source: ChangeSource.DM,
        field: "description",
      },
    });

    // Create a Player suggestion entity.
    // Core fields: name, visibility, isStub.
    // 3 populated fields.
    await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: EntityType.NPC,
        name: "Player Suggestion NPC",
        visibility: Visibility.DM_ONLY,
        isStub: false,
        source: ChangeSource.PLAYER_SUGGESTION,
        status: CanonStatus.CANON,
      },
    });

    // Create a Crawler entity.
    // Core fields: name, visibility, isStub (3 fields)
    // Crawler fields: level, gold, isAlive, viewCount, followerCount, favoriteCount, killCount (7 fields)
    // Total 10 populated fields.
    // Lock the name field.
    await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: EntityType.CRAWLER,
        name: "Crawler 1",
        visibility: Visibility.DM_ONLY,
        isStub: false,
        source: ChangeSource.DM,
        status: CanonStatus.CANON,
        lockedFields: ["name"], // Lock name field
        crawler: {
          create: {
            level: 1,
            gold: 0,
            isAlive: true,
            viewCount: BigInt(0),
            followerCount: BigInt(0),
            favoriteCount: BigInt(0),
            killCount: 0,
          },
        },
      },
    });

    // Grand Totals:
    //   - DM: 3 (DM NPC) + 1 (AI NPC description override) + 9 (Crawler 1) = 13 DM fields.
    //   - AI: 3 (AI NPC fields) = 3 AI fields.
    //   - PLAYER: 3 (Player NPC fields) = 3 PLAYER fields.
    //   - LOCKED: 1 (Crawler 1 name field) = 1 LOCKED field.
    // Total fields = 13 + 3 + 3 + 1 = 20.
    // Percentages:
    //   - DM: 13 / 20 = 65%
    //   - AI: 3 / 20 = 15%
    //   - Player: 3 / 20 = 15%
    //   - Locked: 1 / 20 = 5%
    // Sum = 100%.

    const result = await getCampaignCanonIntegrity(owner.id, campaign.id);
    expect(result).toEqual({
      dmPercent: 65,
      aiPercent: 15,
      playerPercent: 15,
      lockedPercent: 5,
      dmCount: 13,
      aiCount: 3,
      playerCount: 3,
      lockedCount: 1,
      totalFields: 20,
    });
  });

  it("handles Hamilton method rounding correctly when fractions arise", async () => {
    const owner = await makeUser("owner@test.com");
    const campaign = await createCampaign(owner.id, { name: "World" });

    // Entity 1 (AI): name, visibility, isStub (AI) + description (DM). (3 AI, 1 DM).
    const e1 = await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: EntityType.NPC,
        name: "AI NPC",
        description: "AI description",
        visibility: Visibility.DM_ONLY,
        isStub: false,
        source: ChangeSource.AI,
        status: CanonStatus.CANON,
      },
    });

    const cs = await prisma.changeSet.create({
      data: {
        campaignId: campaign.id,
        source: ChangeSource.DM,
        title: "Edit e1 description",
        status: "APPROVED",
      },
    });

    await prisma.provenance.create({
      data: {
        campaignId: campaign.id,
        entityId: e1.id,
        changeSetId: cs.id,
        source: ChangeSource.DM,
        field: "description",
      },
    });

    // Entity 2 (Player): name, visibility, isStub (Player) + description (DM). (3 Player, 1 DM).
    const e2 = await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: EntityType.NPC,
        name: "Player NPC",
        description: "Player description",
        visibility: Visibility.DM_ONLY,
        isStub: false,
        source: ChangeSource.PLAYER_SUGGESTION,
        status: CanonStatus.CANON,
      },
    });

    await prisma.provenance.create({
      data: {
        campaignId: campaign.id,
        entityId: e2.id,
        changeSetId: cs.id,
        source: ChangeSource.DM,
        field: "description",
      },
    });

    // Entity 3 (DM): name, visibility, isStub (DM). (3 DM).
    await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: EntityType.NPC,
        name: "DM NPC",
        visibility: Visibility.DM_ONLY,
        isStub: false,
        source: ChangeSource.DM,
        status: CanonStatus.CANON,
      },
    });

    // Total fields: 11 fields.
    // Counts:
    // - DM: 3 (Entity 3) + 1 (Entity 1 description) + 1 (Entity 2 description) = 5 fields.
    // - AI: 3 fields.
    // - Player: 3 fields.
    // Raw percentages:
    // - DM: 5/11 * 100 = 45.4545%
    // - AI: 3/11 * 100 = 27.2727%
    // - Player: 3/11 * 100 = 27.2727%
    // Hamilton rounding yields: DM 46%, AI 27%, Player 27%, Locked 0%.

    const result = await getCampaignCanonIntegrity(owner.id, campaign.id);
    expect(result).toEqual({
      dmPercent: 46,
      aiPercent: 27,
      playerPercent: 27,
      lockedPercent: 0,
      dmCount: 5,
      aiCount: 3,
      playerCount: 3,
      lockedCount: 0,
      totalFields: 11,
    });
  });
});
