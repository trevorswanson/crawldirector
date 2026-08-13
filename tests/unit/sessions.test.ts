import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the chat-provider seam only for `generateSessionRecap` (mirrors
// ask.test.ts) — everything else in this file runs against the real Postgres
// service layer.
const { resolveCampaignProvider } = vi.hoisted(() => ({
  resolveCampaignProvider: vi.fn(),
}));

vi.mock("@/server/ai", async (importActual) => {
  const actual = await importActual<typeof import("@/server/ai")>();
  return { ...actual, resolveCampaignProvider };
});

import { CanonStatus, EntityType, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  addSessionLogEntry,
  createSession,
  generateSessionRecap,
  getSession,
  listSessions,
  promoteSessionLogEntryToEvent,
  publishSessionRecap,
} from "@/server/services/sessions";

const SAMPLE_USAGE = {
  inputTokens: 1000,
  outputTokens: 200,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

function fakeProvider(text: string, over: { id?: string; model?: string } = {}) {
  const model = over.model ?? "claude-opus-4-8";
  const providerId = over.id ?? "anthropic";
  return {
    id: providerId,
    model,
    generate: vi.fn().mockResolvedValue({ text, usage: SAMPLE_USAGE, model, providerId }),
    generateStructured: vi.fn(),
    embed: vi.fn(),
  };
}

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
  resolveCampaignProvider.mockReset();
  await prisma.aiUsage.deleteMany();
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

describe("promoteSessionLogEntryToEvent", () => {
  it("creates a canonical Event from the entry's text, with tagged live entities as ACTOR participants", async () => {
    const owner = await makeUser("dm@promote.test");
    const campaign = await createCampaign(owner.id, { name: "Promote" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    const npc = await makeEntity(campaign.id, "Carl");
    const entry = await addSessionLogEntry(owner.id, campaign.id, session.id, {
      text: "Carl insulted the Maestro on air",
      taggedIds: [npc.id],
    });

    const result = await promoteSessionLogEntryToEvent(owner.id, campaign.id, session.id, entry.id, {
      title: "Maestro incident",
    });

    const event = await prisma.event.findUniqueOrThrow({
      where: { id: result.id },
      include: { participants: true },
    });
    expect(event.title).toBe("Maestro incident");
    expect(event.summary).toBe("Carl insulted the Maestro on air");
    expect(event.status).toBe(CanonStatus.CANON);
    expect(event.source).toBe("DM");
    expect(event.participants).toHaveLength(1);
    expect(event.participants[0]).toMatchObject({ entityId: npc.id, role: "ACTOR" });

    const updatedEntry = await prisma.sessionLogEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updatedEntry.promotedEventId).toBe(result.id);
  });

  it("creates an Event with no participants when the entry has no tags", async () => {
    const owner = await makeUser("dm@promote2.test");
    const campaign = await createCampaign(owner.id, { name: "Promote" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    const entry = await addSessionLogEntry(owner.id, campaign.id, session.id, {
      text: "A quiet moment",
    });

    const result = await promoteSessionLogEntryToEvent(owner.id, campaign.id, session.id, entry.id, {
      title: "Quiet moment",
    });

    const event = await prisma.event.findUniqueOrThrow({
      where: { id: result.id },
      include: { participants: true },
    });
    expect(event.participants).toHaveLength(0);
  });

  it("drops a tagged entity that is no longer live canon", async () => {
    const owner = await makeUser("dm@promote3.test");
    const campaign = await createCampaign(owner.id, { name: "Promote" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    const npc = await makeEntity(campaign.id, "Carl");
    const entry = await addSessionLogEntry(owner.id, campaign.id, session.id, {
      text: "Carl vanishes",
      taggedIds: [npc.id],
    });
    await prisma.entity.update({ where: { id: npc.id }, data: { status: CanonStatus.ARCHIVED } });

    const result = await promoteSessionLogEntryToEvent(owner.id, campaign.id, session.id, entry.id, {
      title: "Disappearance",
    });

    const event = await prisma.event.findUniqueOrThrow({
      where: { id: result.id },
      include: { participants: true },
    });
    expect(event.participants).toHaveLength(0);
  });

  it("rejects promoting an entry that has already been promoted", async () => {
    const owner = await makeUser("dm@promote4.test");
    const campaign = await createCampaign(owner.id, { name: "Promote" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    const entry = await addSessionLogEntry(owner.id, campaign.id, session.id, { text: "Once" });
    await promoteSessionLogEntryToEvent(owner.id, campaign.id, session.id, entry.id, {
      title: "First",
    });

    await expect(
      promoteSessionLogEntryToEvent(owner.id, campaign.id, session.id, entry.id, {
        title: "Again",
      }),
    ).rejects.toThrow("This entry has already been promoted to an event.");
  });

  it("rejects an empty title", async () => {
    const owner = await makeUser("dm@promote5.test");
    const campaign = await createCampaign(owner.id, { name: "Promote" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    const entry = await addSessionLogEntry(owner.id, campaign.id, session.id, { text: "Once" });

    await expect(
      promoteSessionLogEntryToEvent(owner.id, campaign.id, session.id, entry.id, { title: "   " }),
    ).rejects.toThrow("Event title is required.");
  });

  it("rejects an unknown entry id", async () => {
    const owner = await makeUser("dm@promote6.test");
    const campaign = await createCampaign(owner.id, { name: "Promote" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });

    await expect(
      promoteSessionLogEntryToEvent(owner.id, campaign.id, session.id, "nope", { title: "T" }),
    ).rejects.toThrow("Log entry not found.");
  });

  it("rejects a player caller", async () => {
    const owner = await makeUser("dm@promote7.test");
    const player = await makeUser("player@promote7.test");
    const campaign = await createCampaign(owner.id, { name: "Promote" });
    await addPlayer(player.id, campaign.id);
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    const entry = await addSessionLogEntry(owner.id, campaign.id, session.id, { text: "Once" });

    await expect(
      promoteSessionLogEntryToEvent(player.id, campaign.id, session.id, entry.id, { title: "T" }),
    ).rejects.toThrow("You do not have permission to edit this campaign.");
  });
});

describe("generateSessionRecap", () => {
  it("generates a recap from the log and records usage", async () => {
    const owner = await makeUser("dm@recap.test");
    const campaign = await createCampaign(owner.id, { name: "Recap" });
    const session = await createSession(owner.id, campaign.id, { title: "Session 1" });
    await addSessionLogEntry(owner.id, campaign.id, session.id, { text: "Donut insulted the Maestro" });

    const provider = fakeProvider("Previously on Dungeon Crawler World: chaos ensued.");
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await generateSessionRecap(owner.id, campaign.id, session.id);

    expect(result.recap).toBe("Previously on Dungeon Crawler World: chaos ensued.");
    expect(result.model).toBe("claude-opus-4-8");

    const userMsg = provider.generate.mock.calls[0][0].messages[0].content;
    expect(userMsg).toContain("Donut insulted the Maestro");

    const usage = await prisma.aiUsage.findMany({
      where: { campaignId: campaign.id, generatorId: "session-recap" },
    });
    expect(usage).toHaveLength(1);
    expect(usage[0].outputTokens).toBe(SAMPLE_USAGE.outputTokens);
  });

  it("includes promoted events (with participants) as context alongside the raw log", async () => {
    const owner = await makeUser("dm@recap2.test");
    const campaign = await createCampaign(owner.id, { name: "Recap" });
    const session = await createSession(owner.id, campaign.id, { title: "Session 1" });
    const npc = await makeEntity(campaign.id, "Carl");
    const entry = await addSessionLogEntry(owner.id, campaign.id, session.id, {
      text: "Carl insulted the Maestro on air",
      taggedIds: [npc.id],
    });
    await promoteSessionLogEntryToEvent(owner.id, campaign.id, session.id, entry.id, {
      title: "Maestro incident",
    });
    await addSessionLogEntry(owner.id, campaign.id, session.id, { text: "A quiet aftermath" });

    const provider = fakeProvider("Recap text.");
    resolveCampaignProvider.mockResolvedValue(provider);

    await generateSessionRecap(owner.id, campaign.id, session.id);

    const userMsg = provider.generate.mock.calls[0][0].messages[0].content;
    expect(userMsg).toContain("Maestro incident");
    expect(userMsg).toContain("Carl");
    expect(userMsg).toContain("A quiet aftermath");
  });

  it("rejects a session with no log entries", async () => {
    const owner = await makeUser("dm@recap3.test");
    const campaign = await createCampaign(owner.id, { name: "Recap" });
    const session = await createSession(owner.id, campaign.id, { title: "Empty" });

    await expect(generateSessionRecap(owner.id, campaign.id, session.id)).rejects.toThrow(
      "Add a log entry before generating a recap.",
    );
  });

  it("rejects an unknown session id", async () => {
    const owner = await makeUser("dm@recap4.test");
    const campaign = await createCampaign(owner.id, { name: "Recap" });

    await expect(generateSessionRecap(owner.id, campaign.id, "nope")).rejects.toThrow(
      "Session not found.",
    );
  });

  it("rejects a player caller", async () => {
    const owner = await makeUser("dm@recap5.test");
    const player = await makeUser("player@recap5.test");
    const campaign = await createCampaign(owner.id, { name: "Recap" });
    await addPlayer(player.id, campaign.id);
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    await addSessionLogEntry(owner.id, campaign.id, session.id, { text: "Once" });

    await expect(generateSessionRecap(player.id, campaign.id, session.id)).rejects.toThrow(
      "You do not have permission to edit this campaign.",
    );
  });

  it("throws a safe error when no provider is configured", async () => {
    const owner = await makeUser("dm@recap6.test");
    const campaign = await createCampaign(owner.id, { name: "Recap" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    await addSessionLogEntry(owner.id, campaign.id, session.id, { text: "Once" });
    resolveCampaignProvider.mockResolvedValue(null);

    await expect(generateSessionRecap(owner.id, campaign.id, session.id)).rejects.toThrow(
      ServiceError,
    );
  });

  it("turns a provider failure into a safe ServiceError (invariant #6)", async () => {
    const owner = await makeUser("dm@recap7.test");
    const campaign = await createCampaign(owner.id, { name: "Recap" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    await addSessionLogEntry(owner.id, campaign.id, session.id, { text: "Once" });
    const provider = fakeProvider("unused");
    provider.generate.mockRejectedValue({ status: 401, message: "x-api-key: sk-leak" });
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(generateSessionRecap(owner.id, campaign.id, session.id)).rejects.toThrow(
      ServiceError,
    );
    await expect(generateSessionRecap(owner.id, campaign.id, session.id)).rejects.not.toThrow(
      /sk-leak/,
    );
  });

  it("rejects when the model returns an empty recap", async () => {
    const owner = await makeUser("dm@recap8.test");
    const campaign = await createCampaign(owner.id, { name: "Recap" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });
    await addSessionLogEntry(owner.id, campaign.id, session.id, { text: "Once" });
    resolveCampaignProvider.mockResolvedValue(fakeProvider("   "));

    await expect(generateSessionRecap(owner.id, campaign.id, session.id)).rejects.toThrow(
      "The model did not return a usable recap.",
    );
  });
});

describe("publishSessionRecap", () => {
  it("creates a player-visible SYSTEM_MESSAGE from the recap text, source DM", async () => {
    const owner = await makeUser("dm@publish.test");
    const campaign = await createCampaign(owner.id, { name: "Publish" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });

    const result = await publishSessionRecap(owner.id, campaign.id, session.id, {
      title: "Previously on Dungeon Crawler World: Session 1",
      recap: "Donut insulted the Maestro live on air.",
    });

    const entity = await prisma.entity.findUniqueOrThrow({ where: { id: result.id } });
    expect(entity.type).toBe(EntityType.SYSTEM_MESSAGE);
    expect(entity.name).toBe("Previously on Dungeon Crawler World: Session 1");
    expect(entity.description).toBe("Donut insulted the Maestro live on air.");
    expect(entity.visibility).toBe("PLAYER_VISIBLE");
    expect(entity.status).toBe(CanonStatus.CANON);
    expect(entity.source).toBe("DM");
    expect(entity.tags).toEqual(["recap"]);
  });

  it("rejects a blank title", async () => {
    const owner = await makeUser("dm@publish2.test");
    const campaign = await createCampaign(owner.id, { name: "Publish" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });

    await expect(
      publishSessionRecap(owner.id, campaign.id, session.id, { title: "   ", recap: "Text" }),
    ).rejects.toThrow("Recap title is required.");
  });

  it("rejects blank recap text", async () => {
    const owner = await makeUser("dm@publish3.test");
    const campaign = await createCampaign(owner.id, { name: "Publish" });
    const session = await createSession(owner.id, campaign.id, { title: "S" });

    await expect(
      publishSessionRecap(owner.id, campaign.id, session.id, { title: "T", recap: "   " }),
    ).rejects.toThrow("Recap text is required.");
  });

  it("rejects an unknown session", async () => {
    const owner = await makeUser("dm@publish4.test");
    const campaign = await createCampaign(owner.id, { name: "Publish" });

    await expect(
      publishSessionRecap(owner.id, campaign.id, "nope", { title: "T", recap: "Text" }),
    ).rejects.toThrow("Session not found.");
  });

  it("rejects a player caller", async () => {
    const owner = await makeUser("dm@publish5.test");
    const player = await makeUser("player@publish5.test");
    const campaign = await createCampaign(owner.id, { name: "Publish" });
    await addPlayer(player.id, campaign.id);
    const session = await createSession(owner.id, campaign.id, { title: "S" });

    await expect(
      publishSessionRecap(player.id, campaign.id, session.id, { title: "T", recap: "Text" }),
    ).rejects.toThrow("You do not have permission to edit this campaign.");
  });
});
