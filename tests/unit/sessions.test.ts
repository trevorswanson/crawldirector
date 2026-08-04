import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { EntityType, Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  addSessionLogEntry,
  createSession,
  getSession,
  listSessions,
} from "@/server/services/sessions";

// Service-layer tests against a real Postgres (see campaigns.test.ts). Sessions
// and their log entries are scratch, not canon, so they're created by a direct
// DM mutation — not the review pipeline (mirrors knowledge.test.ts).

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

function addPlayer(userId: string, campaignId: string) {
  return prisma.membership.create({ data: { userId, campaignId, role: Role.PLAYER } });
}

function makeEntity(campaignId: string, name: string) {
  return prisma.entity.create({
    data: { campaignId, type: EntityType.NPC, name },
  });
}

beforeEach(async () => {
  await prisma.sessionLogEntry.deleteMany();
  await prisma.gameSession.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createSession", () => {
  it("creates a session with all fields, trimmed", async () => {
    const owner = await makeUser("dm@session.test");
    const campaign = await createCampaign(owner.id, { name: "Sessions" });

    const created = await createSession(owner.id, campaign.id, {
      title: "  Session 12  ",
      playedAt: "2026-08-04",
      focus: "  Floor 9  ",
      notes: "  prep notes  ",
    });

    const stored = await prisma.gameSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.title).toBe("Session 12");
    expect(stored.focus).toBe("Floor 9");
    expect(stored.notes).toBe("prep notes");
    expect(stored.playedAt?.toISOString().slice(0, 10)).toBe("2026-08-04");
  });

  it("creates a session with only a title", async () => {
    const owner = await makeUser("dm@session2.test");
    const campaign = await createCampaign(owner.id, { name: "Sessions" });

    const created = await createSession(owner.id, campaign.id, { title: "Bare" });
    const stored = await prisma.gameSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.playedAt).toBeNull();
    expect(stored.focus).toBeNull();
    expect(stored.notes).toBeNull();
  });

  it("rejects an empty title", async () => {
    const owner = await makeUser("dm@session3.test");
    const campaign = await createCampaign(owner.id, { name: "Sessions" });
    await expect(createSession(owner.id, campaign.id, { title: "   " })).rejects.toThrow(
      "Session title is required.",
    );
  });

  it("rejects a player caller", async () => {
    const owner = await makeUser("dm@session4.test");
    const player = await makeUser("player@session4.test");
    const campaign = await createCampaign(owner.id, { name: "Sessions" });
    await addPlayer(player.id, campaign.id);

    await expect(createSession(player.id, campaign.id, { title: "S" })).rejects.toThrow(
      "You do not have permission to edit this campaign.",
    );
  });
});

describe("listSessions", () => {
  it("lists sessions newest-played-first with entry counts", async () => {
    const owner = await makeUser("dm@list.test");
    const campaign = await createCampaign(owner.id, { name: "List" });

    const older = await createSession(owner.id, campaign.id, {
      title: "Older",
      playedAt: "2026-07-01",
    });
    const newer = await createSession(owner.id, campaign.id, {
      title: "Newer",
      playedAt: "2026-08-01",
    });
    await addSessionLogEntry(owner.id, campaign.id, newer.id, { text: "one" });
    await addSessionLogEntry(owner.id, campaign.id, newer.id, { text: "two" });

    const sessions = await listSessions(owner.id, campaign.id);
    expect(sessions.map((s) => s.id)).toEqual([newer.id, older.id]);
    expect(sessions[0].entryCount).toBe(2);
    expect(sessions[1].entryCount).toBe(0);
  });

  it("rejects a non-member", async () => {
    const owner = await makeUser("dm@list2.test");
    const outsider = await makeUser("outsider@list2.test");
    const campaign = await createCampaign(owner.id, { name: "List" });
    await expect(listSessions(outsider.id, campaign.id)).rejects.toThrow(
      "You do not have permission to edit this campaign.",
    );
  });
});

describe("addSessionLogEntry + getSession", () => {
  it("appends entries and resolves tagged entities on read", async () => {
    const owner = await makeUser("dm@log.test");
    const campaign = await createCampaign(owner.id, { name: "Log" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    const npc = await makeEntity(campaign.id, "Carl");

    await addSessionLogEntry(owner.id, campaign.id, session.id, {
      text: "Carl fought a goblin",
      taggedIds: [npc.id],
    });
    await addSessionLogEntry(owner.id, campaign.id, session.id, { text: "Quiet moment" });

    const detail = await getSession(owner.id, campaign.id, session.id);
    expect(detail?.entries).toHaveLength(2);
    expect(detail?.entries[0].text).toBe("Carl fought a goblin");
    expect(detail?.entries[0].taggedEntities).toEqual([
      { id: npc.id, name: "Carl", type: "NPC" },
    ]);
    expect(detail?.entries[1].taggedEntities).toEqual([]);
  });

  it("drops tagged ids that don't resolve to a live entity in the campaign", async () => {
    const owner = await makeUser("dm@log2.test");
    const otherOwner = await makeUser("other@log2.test");
    const campaign = await createCampaign(owner.id, { name: "Log" });
    const otherCampaign = await createCampaign(otherOwner.id, { name: "Other" });
    const foreignEntity = await makeEntity(otherCampaign.id, "Foreign");
    const session = await createSession(owner.id, campaign.id, { title: "S" });

    await addSessionLogEntry(owner.id, campaign.id, session.id, {
      text: "Mentions a foreign entity",
      taggedIds: [foreignEntity.id, "does-not-exist"],
    });

    const detail = await getSession(owner.id, campaign.id, session.id);
    expect(detail?.entries[0].taggedEntities).toEqual([]);
  });

  it("rejects empty text", async () => {
    const owner = await makeUser("dm@log3.test");
    const campaign = await createCampaign(owner.id, { name: "Log" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    await expect(
      addSessionLogEntry(owner.id, campaign.id, session.id, { text: "   " }),
    ).rejects.toThrow("Log entry text is required.");
  });

  it("rejects an unknown session id", async () => {
    const owner = await makeUser("dm@log4.test");
    const campaign = await createCampaign(owner.id, { name: "Log" });
    await expect(
      addSessionLogEntry(owner.id, campaign.id, "nope", { text: "x" }),
    ).rejects.toThrow("Session not found.");
  });

  it("returns null for an unknown session on read", async () => {
    const owner = await makeUser("dm@log5.test");
    const campaign = await createCampaign(owner.id, { name: "Log" });
    expect(await getSession(owner.id, campaign.id, "nope")).toBeNull();
  });
});
