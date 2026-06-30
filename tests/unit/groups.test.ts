import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createGenericEntity } from "@/server/services/entities";
import { createRelationship } from "@/server/services/relationships";
import { getGroupRoster, isGroupEntityType } from "@/server/services/groups";

type GenericType = Parameters<typeof createGenericEntity>[2]["type"];

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function makeEntity(
  userId: string,
  campaignId: string,
  type: GenericType,
  name: string,
  visibility: "DM_ONLY" | "PLAYER_VISIBLE" = "DM_ONLY",
) {
  return createGenericEntity(userId, campaignId, {
    type,
    name,
    summary: "",
    description: "",
    visibility,
    tags: [],
  });
}

function link(
  userId: string,
  campaignId: string,
  sourceId: string,
  type: "MEMBER_OF" | "LEADS",
  targetId: string,
  secret = false,
  bounds: { sinceDay?: number; untilDay?: number } = {},
) {
  return createRelationship(userId, campaignId, sourceId, {
    type,
    targetId,
    secret,
    ...bounds,
  });
}

beforeEach(async () => {
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.relationship.deleteMany();
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

describe("isGroupEntityType", () => {
  it("recognizes group types and rejects individuals", () => {
    expect(isGroupEntityType("GUILD")).toBe(true);
    expect(isGroupEntityType("PARTY")).toBe(true);
    expect(isGroupEntityType("FACTION")).toBe(true);
    expect(isGroupEntityType("ORGANIZATION")).toBe(true);
    expect(isGroupEntityType("NPC")).toBe(false);
    expect(isGroupEntityType("LOCATION")).toBe(false);
  });
});

describe("getGroupRoster", () => {
  it("rolls up guild -> party -> member with leaders nested", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    const guild = await makeEntity(dm.id, campaign.id, "GUILD", "The Guild");
    const party = await makeEntity(dm.id, campaign.id, "PARTY", "Princess Party");
    const emptyParty = await makeEntity(dm.id, campaign.id, "PARTY", "Lone Party");
    const carl = await makeEntity(dm.id, campaign.id, "NPC", "Carl");
    const donut = await makeEntity(dm.id, campaign.id, "NPC", "Donut");
    const guildLeader = await makeEntity(dm.id, campaign.id, "NPC", "Guildmaster");
    const partyLeader = await makeEntity(dm.id, campaign.id, "NPC", "Captain");

    // member edges (source MEMBER_OF target-group)
    await link(dm.id, campaign.id, carl.id, "MEMBER_OF", party.id);
    await link(dm.id, campaign.id, donut.id, "MEMBER_OF", party.id);
    await link(dm.id, campaign.id, party.id, "MEMBER_OF", guild.id);
    await link(dm.id, campaign.id, emptyParty.id, "MEMBER_OF", guild.id);
    // leadership edges (source LEADS target-group)
    await link(dm.id, campaign.id, guildLeader.id, "LEADS", guild.id);
    await link(dm.id, campaign.id, partyLeader.id, "LEADS", party.id);

    const roster = await getGroupRoster(dm.id, campaign.id, guild.id);
    expect(roster).not.toBeNull();
    if (!roster) return;

    expect(roster.group.name).toBe("The Guild");
    // distinct non-group members across the whole subtree (Carl, Donut)
    expect(roster.rolledUpMemberCount).toBe(2);

    expect(roster.leaders.map((l) => l.entity.name)).toEqual(["Guildmaster"]);

    const memberNames = roster.members.map((m) => m.entity.name).sort();
    expect(memberNames).toEqual(["Lone Party", "Princess Party"]);

    const princess = roster.members.find(
      (m) => m.entity.name === "Princess Party",
    );
    expect(princess?.subRoster).not.toBeNull();
    expect(princess?.subRoster?.leaders.map((l) => l.entity.name)).toEqual([
      "Captain",
    ]);
    expect(
      princess?.subRoster?.members.map((m) => m.entity.name).sort(),
    ).toEqual(["Carl", "Donut"]);
    // sub-group leaf members nested below it; subRoster on individuals is null
    expect(princess?.subRoster?.members.every((m) => m.subRoster === null)).toBe(
      true,
    );

    const lone = roster.members.find((m) => m.entity.name === "Lone Party");
    expect(lone?.subRoster?.members).toHaveLength(0);
  });

  it("hides secret membership edges and invisible members from players", async () => {
    const dm = await makeUser("dm2@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    const party = await makeEntity(
      dm.id,
      campaign.id,
      "PARTY",
      "Open Party",
      "PLAYER_VISIBLE",
    );
    const shown = await makeEntity(
      dm.id,
      campaign.id,
      "NPC",
      "Shown",
      "PLAYER_VISIBLE",
    );
    const hiddenEntity = await makeEntity(
      dm.id,
      campaign.id,
      "NPC",
      "Hidden",
      "DM_ONLY",
    );
    const secretMember = await makeEntity(
      dm.id,
      campaign.id,
      "NPC",
      "SecretMember",
      "PLAYER_VISIBLE",
    );

    await link(dm.id, campaign.id, shown.id, "MEMBER_OF", party.id);
    // member is canon-invisible to players → omitted
    await link(dm.id, campaign.id, hiddenEntity.id, "MEMBER_OF", party.id);
    // edge itself is secret → omitted even though the member is visible
    await link(dm.id, campaign.id, secretMember.id, "MEMBER_OF", party.id, true);

    const dmRoster = await getGroupRoster(dm.id, campaign.id, party.id);
    expect(dmRoster?.members.map((m) => m.entity.name).sort()).toEqual([
      "Hidden",
      "SecretMember",
      "Shown",
    ]);

    const playerRoster = await getGroupRoster(player.id, campaign.id, party.id);
    expect(playerRoster?.members.map((m) => m.entity.name)).toEqual(["Shown"]);
    expect(playerRoster?.rolledUpMemberCount).toBe(1);
  });

  it("does not loop on a membership cycle", async () => {
    const dm = await makeUser("dm3@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const a = await makeEntity(dm.id, campaign.id, "GUILD", "Group A");
    const b = await makeEntity(dm.id, campaign.id, "GUILD", "Group B");

    await link(dm.id, campaign.id, a.id, "MEMBER_OF", b.id);
    await link(dm.id, campaign.id, b.id, "MEMBER_OF", a.id);

    const roster = await getGroupRoster(dm.id, campaign.id, a.id);
    expect(roster?.members.map((m) => m.entity.name)).toEqual(["Group B"]);
    const b1 = roster?.members[0];
    expect(b1?.subRoster?.members.map((m) => m.entity.name)).toEqual(["Group A"]);
    // A is already expanded, so it isn't expanded again — terminates.
    expect(b1?.subRoster?.members[0].subRoster).toBeNull();
  });

  it("excludes archived membership edges", async () => {
    const dm = await makeUser("dm4@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const party = await makeEntity(dm.id, campaign.id, "PARTY", "Party");
    const member = await makeEntity(dm.id, campaign.id, "NPC", "Member");

    const edge = await link(dm.id, campaign.id, member.id, "MEMBER_OF", party.id);

    let roster = await getGroupRoster(dm.id, campaign.id, party.id);
    expect(roster?.members).toHaveLength(1);

    await prisma.relationship.update({
      where: { id: edge.id },
      data: { status: "ARCHIVED" },
    });

    roster = await getGroupRoster(dm.id, campaign.id, party.id);
    expect(roster?.members).toHaveLength(0);
    expect(roster?.rolledUpMemberCount).toBe(0);
  });

  it("filters roster membership to the requested crawl day", async () => {
    const dm = await makeUser("dm-bounded@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const party = await makeEntity(dm.id, campaign.id, "PARTY", "Party");
    const founder = await makeEntity(dm.id, campaign.id, "NPC", "Founder");
    const lateJoiner = await makeEntity(dm.id, campaign.id, "NPC", "Late Joiner");
    const departed = await makeEntity(dm.id, campaign.id, "NPC", "Departed");
    const leader = await makeEntity(dm.id, campaign.id, "NPC", "Captain");

    await link(dm.id, campaign.id, founder.id, "MEMBER_OF", party.id, false, {
      sinceDay: 5,
    });
    await link(dm.id, campaign.id, lateJoiner.id, "MEMBER_OF", party.id, false, {
      sinceDay: 12,
    });
    await link(dm.id, campaign.id, departed.id, "MEMBER_OF", party.id, false, {
      sinceDay: 1,
      untilDay: 8,
    });
    await link(dm.id, campaign.id, leader.id, "LEADS", party.id, false, {
      sinceDay: 10,
    });

    const day7 = await getGroupRoster(dm.id, campaign.id, party.id, { asOfDay: 7 });
    expect(day7?.members.map((m) => m.entity.name).sort()).toEqual([
      "Departed",
      "Founder",
    ]);
    expect(day7?.leaders).toHaveLength(0);
    expect(day7?.rolledUpMemberCount).toBe(2);

    const day12 = await getGroupRoster(dm.id, campaign.id, party.id, { asOfDay: 12 });
    expect(day12?.members.map((m) => m.entity.name).sort()).toEqual([
      "Founder",
      "Late Joiner",
    ]);
    expect(day12?.leaders.map((m) => m.entity.name)).toEqual(["Captain"]);
    expect(day12?.rolledUpMemberCount).toBe(2);
  });

  it("carries the edge's disposition and notes onto roster entries", async () => {
    const dm = await makeUser("dm-roster-fields@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const party = await makeEntity(dm.id, campaign.id, "PARTY", "Party");
    const carl = await makeEntity(dm.id, campaign.id, "NPC", "Carl");

    // The roster editor round-trips these on an edit, so getGroupRoster must
    // expose them (a bare day-bounds edit would otherwise null them out).
    await createRelationship(dm.id, campaign.id, carl.id, {
      type: "MEMBER_OF",
      targetId: party.id,
      disposition: 42,
      notes: "trusted lieutenant",
      sinceDay: 3,
    });

    const roster = await getGroupRoster(dm.id, campaign.id, party.id);
    const carlEntry = roster?.members.find((m) => m.entity.name === "Carl");
    expect(carlEntry?.disposition).toBe(42);
    expect(carlEntry?.notes).toBe("trusted lieutenant");
    expect(carlEntry?.sinceDay).toBe(3);
  });

  it("treats bounded historical memberships as inactive in the current roster", async () => {
    const dm = await makeUser("dm-current-bounds@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const party = await makeEntity(dm.id, campaign.id, "PARTY", "Party");
    const current = await makeEntity(dm.id, campaign.id, "NPC", "Current");
    const departed = await makeEntity(dm.id, campaign.id, "NPC", "Departed");

    await link(dm.id, campaign.id, current.id, "MEMBER_OF", party.id, false, {
      sinceDay: 5,
    });
    await link(dm.id, campaign.id, departed.id, "MEMBER_OF", party.id, false, {
      sinceDay: 1,
      untilDay: 8,
    });

    const roster = await getGroupRoster(dm.id, campaign.id, party.id);
    expect(roster?.members.map((m) => m.entity.name)).toEqual(["Current"]);
    expect(roster?.rolledUpMemberCount).toBe(1);
  });

  it("returns null for a non-member of the campaign", async () => {
    const dm = await makeUser("dm5@test.com");
    const outsider = await makeUser("outsider@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const party = await makeEntity(dm.id, campaign.id, "PARTY", "Party");

    const roster = await getGroupRoster(outsider.id, campaign.id, party.id);
    expect(roster).toBeNull();
  });

  it("excludes soft-archived members even for the DM", async () => {
    const dm = await makeUser("dm-arch@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const party = await makeEntity(dm.id, campaign.id, "PARTY", "Party");
    const member = await makeEntity(dm.id, campaign.id, "NPC", "Member");

    // Membership edge stays active; only the member entity is archived.
    await link(dm.id, campaign.id, member.id, "MEMBER_OF", party.id);
    await prisma.entity.update({
      where: { id: member.id },
      data: { status: "ARCHIVED" },
    });

    const roster = await getGroupRoster(dm.id, campaign.id, party.id);
    expect(roster?.members).toHaveLength(0);
    expect(roster?.rolledUpMemberCount).toBe(0);
  });

  it("returns null for a missing group id", async () => {
    const dm = await makeUser("dm6@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    const roster = await getGroupRoster(dm.id, campaign.id, "does-not-exist");
    expect(roster).toBeNull();
  });

  it("hides a DM-only group's roster from players", async () => {
    const dm = await makeUser("dm7@test.com");
    const player = await makeUser("player7@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const party = await makeEntity(dm.id, campaign.id, "PARTY", "Secret Party");

    expect(await getGroupRoster(dm.id, campaign.id, party.id)).not.toBeNull();
    expect(await getGroupRoster(player.id, campaign.id, party.id)).toBeNull();
  });
});
