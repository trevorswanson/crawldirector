import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CanonStatus, Prisma, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import {
  createCampaign,
  setCampaignCurrentFloor,
} from "@/server/services/campaigns";
import { createCrawler, createGenericEntity } from "@/server/services/entities";
import {
  archiveEvent,
  archiveEventCausality,
  applyEventEffects,
  createEvent,
  linkEventCause,
  listCampaignFloors,
  listCampaignTimeline,
  listEventsForEntity,
  orderEventsFromCausality,
  reorderEvent,
  resolveFloorEntities,
  resolveFloorEntity,
  restoreEvent,
  restoreEventCausality,
  setEventLock,
  updateEvent,
} from "@/server/services/events";
import {
  applyAutoApprovedEntityChangeSet,
  applyAutoApprovedEventChangeSet,
  approveChangeSet,
} from "@/server/services/review";
import { OpKind } from "@/generated/prisma/client";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function approveAcceptedChangeSet(
  userId: string,
  campaignId: string,
  changeSetId: string,
) {
  await prisma.changeOperation.updateMany({
    where: { changeSetId, decision: "PENDING" },
    data: { decision: "ACCEPTED" },
  });
  return approveChangeSet(userId, campaignId, changeSetId);
}

async function makeEntity(
  userId: string,
  campaignId: string,
  name: string,
  visibility: "DM_ONLY" | "SHARED_WITH_PLAYERS" = "DM_ONLY",
) {
  return createGenericEntity(userId, campaignId, {
    type: "NPC",
    name,
    summary: "",
    description: "",
    visibility,
    tags: [],
  });
}

async function makeCrawler(
  userId: string,
  campaignId: string,
  name: string,
  visibility: "DM_ONLY" | "SHARED_WITH_PLAYERS" = "DM_ONLY",
) {
  return createCrawler(userId, campaignId, {
    name,
    summary: "",
    description: "",
    visibility,
    tags: [],
    level: 1,
    gold: 0,
    viewCount: BigInt(0),
    followerCount: BigInt(0),
    favoriteCount: BigInt(0),
    killCount: 0,
    isAlive: true,
  });
}

beforeEach(async () => {
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.event.deleteMany();
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

describe("event service", () => {
  it("logs an event through the pipeline with provenance and participants", async () => {
    const owner = await makeUser("owner@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const donut = await makeEntity(owner.id, campaign.id, "Donut");

    const event = await createEvent(owner.id, campaign.id, {
      title: "Floor 9 boss fight",
      summary: "They beat the Sledge boss.",
      floor: 9,
      timeLabel: "Day 3",
      secret: false,
      participants: [
        { entityId: carl.id, role: "ACTOR" },
        { entityId: donut.id, role: "ACTOR" },
      ],
    });

    const row = await prisma.event.findUnique({
      where: { id: event.id },
      include: { participants: true },
    });
    expect(row?.status).toBe(CanonStatus.CANON);
    expect(row?.title).toBe("Floor 9 boss fight");
    expect(row?.orderKey).toBe(9);
    expect(row?.inGameTime).toEqual({ basis: "FLOOR_START", floor: 9, label: "Day 3" });
    expect(row?.source).toBe("DM");
    expect(row?.participants).toHaveLength(2);

    const provenance = await prisma.provenance.findMany({
      where: { eventId: event.id },
    });
    expect(provenance.length).toBeGreaterThan(0);
    expect(provenance.every((p) => p.source === "DM")).toBe(true);

    // Shows on both participants' timelines, with the other listed as co-actor.
    const carlTimeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(carlTimeline).toHaveLength(1);
    expect(carlTimeline[0].role).toBe("ACTOR");
    expect(carlTimeline[0].time).toMatchObject({
      basis: "FLOOR_START",
      floor: 9,
      label: "Day 3",
      phrase: "Day 3",
    });
    expect(carlTimeline[0].others).toHaveLength(1);
    expect(carlTimeline[0].others[0].name).toBe("Donut");

    const donutTimeline = await listEventsForEntity(owner.id, campaign.id, donut.id);
    expect(donutTimeline[0].others[0].name).toBe("Carl");
  });

  it("stores effects declared while logging a new event as unapplied", async () => {
    const owner = await makeUser("owner-fx@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeCrawler(owner.id, campaign.id, "Carl");

    const event = await createEvent(owner.id, campaign.id, {
      title: "Carl finds 100 gold",
      summary: "",
      floor: 1,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
      effects: [
        { kind: "ADJUST_STAT", targetEntityId: carl.id, stat: "gold", delta: 100 },
      ],
    });

    const row = await prisma.event.findUnique({ where: { id: event.id } });
    const stored = row?.effects as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      kind: "ADJUST_STAT",
      targetEntityId: carl.id,
      stat: "gold",
      delta: 100,
      applied: false,
    });
    // Declared, not yet applied — no entity state mutated and no APPLY change set.
    expect(stored[0].reviewStatus ?? null).toBeNull();
    const crawler = await prisma.crawler.findUnique({ where: { id: carl.id } });
    expect(crawler?.gold).toBe(0);

    // Projected onto the DM timeline as an unapplied effect.
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].effects).toHaveLength(1);
    expect(timeline[0].effects[0].applied).toBe(false);
  });

  it("rejects a logged effect whose target is not a crawler", async () => {
    const owner = await makeUser("owner-fx-bad@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const npc = await makeEntity(owner.id, campaign.id, "Mordecai");

    await expect(
      createEvent(owner.id, campaign.id, {
        title: "Bad effect",
        summary: "",
        floor: 1,
        secret: false,
        participants: [{ entityId: npc.id, role: "ACTOR" }],
        effects: [
          { kind: "ADJUST_STAT", targetEntityId: npc.id, stat: "gold", delta: 10 },
        ],
      }),
    ).rejects.toThrow(ServiceError);
  });

  it("orders an entity's timeline by in-game floor, newest first", async () => {
    const owner = await makeUser("owner-order@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    await createEvent(owner.id, campaign.id, {
      title: "Early",
      floor: 1,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "Later",
      floor: 9,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline.map((e) => e.title)).toEqual(["Later", "Early"]);
  });

  it("projects malformed in-game time as empty timeline time", async () => {
    const owner = await makeUser("owner-bad-time@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    const event = await createEvent(owner.id, campaign.id, {
      title: "Bad time",
      floor: 3,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await prisma.event.update({
      where: { id: event.id },
      data: { inGameTime: [] },
    });

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].time).toMatchObject({
      basis: "UNSCHEDULED",
      floor: null,
      label: null,
      phrase: null,
    });
  });

  it("lists the campaign-wide timeline with visible participants", async () => {
    const owner = await makeUser("campaign-timeline-owner@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const donut = await makeEntity(owner.id, campaign.id, "Donut");

    await createEvent(owner.id, campaign.id, {
      title: "Early stunt",
      floor: 2,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "Later boss fight",
      floor: 9,
      timeLabel: "Day 3",
      secret: false,
      participants: [
        { entityId: carl.id, role: "ACTOR" },
        { entityId: donut.id, role: "TARGET" },
      ],
    });

    const timeline = await listCampaignTimeline(owner.id, campaign.id);

    expect(timeline.map((event) => event.title)).toEqual([
      "Later boss fight",
      "Early stunt",
    ]);
    expect(timeline[0].time).toMatchObject({ floor: 9, label: "Day 3", phrase: "Day 3" });
    expect(timeline[0].participants.map((p) => `${p.name}:${p.role}`)).toEqual([
      "Carl:ACTOR",
      "Donut:TARGET",
    ]);
  });

  it("scopes the campaign timeline for players", async () => {
    const owner = await makeUser("campaign-timeline-owner2@test.com");
    const player = await makeUser("campaign-timeline-player@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const publicEntity = await makeEntity(
      owner.id,
      campaign.id,
      "Public crawler",
      "SHARED_WITH_PLAYERS",
    );
    const secretEntity = await makeEntity(owner.id, campaign.id, "Secret NPC");

    await createEvent(owner.id, campaign.id, {
      title: "Public scene",
      floor: 3,
      secret: false,
      participants: [
        { entityId: publicEntity.id, role: "ACTOR" },
        { entityId: secretEntity.id, role: "WITNESS" },
      ],
    });
    await createEvent(owner.id, campaign.id, {
      title: "Hidden scene",
      floor: 4,
      secret: true,
      participants: [{ entityId: publicEntity.id, role: "ACTOR" }],
    });

    const timeline = await listCampaignTimeline(player.id, campaign.id);

    expect(timeline).toHaveLength(1);
    expect(timeline[0].title).toBe("Public scene");
    expect(timeline[0].participants.map((p) => p.name)).toEqual([
      "Public crawler",
    ]);
  });

  it("dedupes repeated (entity, role) participants", async () => {
    const owner = await makeUser("owner-dupe@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    const event = await createEvent(owner.id, campaign.id, {
      title: "Solo moment",
      secret: false,
      participants: [
        { entityId: carl.id, role: "ACTOR" },
        { entityId: carl.id, role: "ACTOR" },
      ],
    });

    const participants = await prisma.eventParticipant.findMany({
      where: { eventId: event.id },
    });
    expect(participants).toHaveLength(1);
  });

  it("hides secret events and invisible co-participants from players", async () => {
    const owner = await makeUser("owner2@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    const hub = await makeEntity(owner.id, campaign.id, "Hub", "SHARED_WITH_PLAYERS");
    const shared = await makeEntity(owner.id, campaign.id, "Shared", "SHARED_WITH_PLAYERS");
    const hidden = await makeEntity(owner.id, campaign.id, "Hidden", "DM_ONLY");

    // A public event with a shared and a hidden co-participant.
    await createEvent(owner.id, campaign.id, {
      title: "Public brawl",
      secret: false,
      participants: [
        { entityId: hub.id, role: "ACTOR" },
        { entityId: shared.id, role: "TARGET" },
        { entityId: hidden.id, role: "WITNESS" },
      ],
    });
    // A secret event.
    await createEvent(owner.id, campaign.id, {
      title: "Secret betrayal",
      secret: true,
      participants: [{ entityId: hub.id, role: "ACTOR" }],
    });

    const asDm = await listEventsForEntity(owner.id, campaign.id, hub.id);
    expect(asDm).toHaveLength(2);

    const asPlayer = await listEventsForEntity(player.id, campaign.id, hub.id);
    expect(asPlayer).toHaveLength(1);
    expect(asPlayer[0].title).toBe("Public brawl");
    // The hidden witness is dropped; only the shared target remains.
    expect(asPlayer[0].others.map((o) => o.name)).toEqual(["Shared"]);
  });

  it("soft-archives an event but retains it", async () => {
    const owner = await makeUser("owner3@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "A thing happened",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const result = await archiveEvent(owner.id, campaign.id, event.id);

    const row = await prisma.event.findUnique({ where: { id: event.id } });
    expect(row?.status).toBe(CanonStatus.ARCHIVED);
    expect(result.participantIds).toEqual([carl.id]);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline).toHaveLength(0);
  });

  it("restores an archived event through an audited change set", async () => {
    const owner = await makeUser("restore-event@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "A thing happened",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await archiveEvent(owner.id, campaign.id, event.id);
    const result = await restoreEvent(owner.id, campaign.id, event.id);

    expect(result.participantIds).toEqual([carl.id]);
    const row = await prisma.event.findUnique({ where: { id: event.id } });
    expect(row?.status).toBe(CanonStatus.CANON);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline.map((item) => item.id)).toContain(event.id);
    const provenance = await prisma.provenance.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
      include: { changeSet: { select: { title: true } } },
    });
    expect(provenance.at(-1)?.changeSet.title).toBe("Restore event");
    expect(provenance.at(-1)?.source).toBe("DM");
  });

  it("rejects archiving a missing event", async () => {
    const owner = await makeUser("archive-missing@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await expect(
      archiveEvent(owner.id, campaign.id, "missing-event-id"),
    ).rejects.toThrow("Event not found.");
  });

  it("locks and unlocks an event with audit history", async () => {
    const owner = await makeUser("owner-event-lock@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Protected lore",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const locked = await setEventLock(owner.id, campaign.id, event.id, true);
    expect(locked.locked).toBe(true);
    expect(locked.participantIds).toEqual([carl.id]);
    const alreadyLocked = await setEventLock(owner.id, campaign.id, event.id, true);
    expect(alreadyLocked.locked).toBe(true);
    expect(alreadyLocked.participantIds).toEqual([carl.id]);
    await expect(archiveEvent(owner.id, campaign.id, event.id)).rejects.toThrow(
      /locked/,
    );

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].locked).toBe(true);

    const unlocked = await setEventLock(owner.id, campaign.id, event.id, false);
    expect(unlocked.locked).toBe(false);

    const audit = await prisma.auditLog.findMany({
      where: { targetType: "EVENT", targetId: event.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((entry) => entry.action)).toEqual(["LOCK", "UNLOCK"]);
  });

  it("returns no events for a non-member", async () => {
    const owner = await makeUser("owner-nm@test.com");
    const outsider = await makeUser("outsider@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    await createEvent(owner.id, campaign.id, {
      title: "Private lore",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const timeline = await listEventsForEntity(outsider.id, campaign.id, carl.id);
    expect(timeline).toEqual([]);
  });

  it("blocks players from logging events", async () => {
    const owner = await makeUser("owner4@test.com");
    const player = await makeUser("player4@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    await expect(
      createEvent(player.id, campaign.id, {
        title: "Player event",
        secret: false,
        participants: [{ entityId: carl.id, role: "ACTOR" }],
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("blocks players from locking events", async () => {
    const owner = await makeUser("owner-event-player-lock@test.com");
    const player = await makeUser("player-event-lock@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Canon event",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await expect(
      setEventLock(player.id, campaign.id, event.id, true),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects a participant that is not live canon", async () => {
    const owner = await makeUser("owner5@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    await expect(
      createEvent(owner.id, campaign.id, {
        title: "Ghost event",
        secret: false,
        participants: [
          { entityId: carl.id, role: "ACTOR" },
          { entityId: "missing", role: "TARGET" },
        ],
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("refuses to archive a locked event", async () => {
    const owner = await makeUser("owner6@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Pinned event",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await prisma.event.update({
      where: { id: event.id },
      data: { locked: true },
    });

    await expect(
      archiveEvent(owner.id, campaign.id, event.id),
    ).rejects.toThrow(/locked/);
    const row = await prisma.event.findUnique({ where: { id: event.id } });
    expect(row?.status).toBe(CanonStatus.CANON);
  });

  it("links events into a cause/effect chain through the pipeline with provenance", async () => {
    const owner = await makeUser("owner-cause@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const stunt = await createEvent(owner.id, campaign.id, {
      title: "Carl blows up the arena",
      floor: 3,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const stockDrop = await createEvent(owner.id, campaign.id, {
      title: "Sponsor stock drops",
      floor: 4,
      secret: false,
      participants: [{ entityId: carl.id, role: "AFFECTED" }],
    });

    const link = await linkEventCause(owner.id, campaign.id, {
      causeId: stunt.id,
      effectId: stockDrop.id,
      weight: 80,
      note: "Broadcast backlash.",
    });

    const row = await prisma.eventCausality.findUnique({
      where: { id: link.id },
    });
    expect(row?.status).toBe(CanonStatus.CANON);
    expect(row?.causeId).toBe(stunt.id);
    expect(row?.effectId).toBe(stockDrop.id);
    expect(row?.weight).toBe(80);
    expect(row?.note).toBe("Broadcast backlash.");

    const provenance = await prisma.provenance.findMany({
      where: { eventCausalityId: link.id },
    });
    expect(provenance.map((p) => p.field).sort()).toEqual([
      "causeId",
      "effectId",
      "note",
      "weight",
    ]);

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    const effect = timeline.find((event) => event.id === stockDrop.id);
    const cause = timeline.find((event) => event.id === stunt.id);
    expect(effect?.causedBy).toEqual([
      { id: stunt.id, title: "Carl blows up the arena", linkId: link.id },
    ]);
    expect(cause?.causes).toEqual([
      { id: stockDrop.id, title: "Sponsor stock drops", linkId: link.id },
    ]);
  });

  it("rejects causality links that would create a cycle", async () => {
    const owner = await makeUser("owner-cycle@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const first = await createEvent(owner.id, campaign.id, {
      title: "First",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const second = await createEvent(owner.id, campaign.id, {
      title: "Second",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const third = await createEvent(owner.id, campaign.id, {
      title: "Third",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await linkEventCause(owner.id, campaign.id, {
      causeId: first.id,
      effectId: second.id,
    });
    await linkEventCause(owner.id, campaign.id, {
      causeId: second.id,
      effectId: third.id,
    });

    await expect(
      linkEventCause(owner.id, campaign.id, {
        causeId: third.id,
        effectId: first.id,
      }),
    ).rejects.toThrow(/cycle/i);
  });

  it("hides causality links to secret events from players", async () => {
    const owner = await makeUser("owner-cause-visibility@test.com");
    const player = await makeUser("player-cause-visibility@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const carl = await makeEntity(owner.id, campaign.id, "Carl", "SHARED_WITH_PLAYERS");
    const publicEvent = await createEvent(owner.id, campaign.id, {
      title: "Public consequence",
      secret: false,
      participants: [{ entityId: carl.id, role: "AFFECTED" }],
    });
    const secretEvent = await createEvent(owner.id, campaign.id, {
      title: "Secret cause",
      secret: true,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await linkEventCause(owner.id, campaign.id, {
      causeId: secretEvent.id,
      effectId: publicEvent.id,
    });

    const asDm = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(asDm.find((event) => event.id === publicEvent.id)?.causedBy[0]).toMatchObject(
      { id: secretEvent.id, title: "Secret cause" },
    );

    const asPlayer = await listEventsForEntity(player.id, campaign.id, carl.id);
    expect(asPlayer.find((event) => event.id === publicEvent.id)?.causedBy).toEqual(
      [],
    );
  });

  it("hides causality links to events with only invisible participants from players", async () => {
    const owner = await makeUser("owner-cause-invisible-part@test.com");
    const player = await makeUser("player-cause-invisible-part@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const publicEntity = await makeEntity(
      owner.id,
      campaign.id,
      "Public crawler",
      "SHARED_WITH_PLAYERS",
    );
    const secretEntity = await makeEntity(
      owner.id,
      campaign.id,
      "Secret NPC",
      "DM_ONLY",
    );

    const publicEvent = await createEvent(owner.id, campaign.id, {
      title: "Public consequence",
      secret: false,
      participants: [{ entityId: publicEntity.id, role: "AFFECTED" }],
    });
    const invisiblePartEvent = await createEvent(owner.id, campaign.id, {
      title: "Invisible-participant cause",
      secret: false,
      participants: [{ entityId: secretEntity.id, role: "ACTOR" }],
    });

    await linkEventCause(owner.id, campaign.id, {
      causeId: invisiblePartEvent.id,
      effectId: publicEvent.id,
    });

    const asDm = await listEventsForEntity(owner.id, campaign.id, publicEntity.id);
    expect(asDm.find((event) => event.id === publicEvent.id)?.causedBy[0]).toMatchObject(
      { id: invisiblePartEvent.id, title: "Invisible-participant cause" },
    );

    const asPlayer = await listEventsForEntity(player.id, campaign.id, publicEntity.id);
    expect(asPlayer.find((event) => event.id === publicEvent.id)?.causedBy).toEqual(
      [],
    );

    const campaignTimelineAsPlayer = await listCampaignTimeline(player.id, campaign.id);
    expect(campaignTimelineAsPlayer.find((event) => event.id === publicEvent.id)?.causedBy).toEqual(
      [],
    );
  });

  it("keeps causality links to archived events visible to DMs but hidden from players", async () => {
    const owner = await makeUser("owner-cause-archived-event@test.com");
    const player = await makeUser("player-cause-archived-event@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const carl = await makeEntity(
      owner.id,
      campaign.id,
      "Carl",
      "SHARED_WITH_PLAYERS",
    );

    const publicEvent = await createEvent(owner.id, campaign.id, {
      title: "Public consequence",
      secret: false,
      participants: [{ entityId: carl.id, role: "AFFECTED" }],
    });
    const causeEvent = await createEvent(owner.id, campaign.id, {
      title: "Archived cause",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await linkEventCause(owner.id, campaign.id, {
      causeId: causeEvent.id,
      effectId: publicEvent.id,
    });

    await archiveEvent(owner.id, campaign.id, causeEvent.id);

    const asDm = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(asDm.find((event) => event.id === publicEvent.id)?.causedBy[0]).toMatchObject(
      { id: causeEvent.id, title: "Archived cause" },
    );

    const asPlayer = await listEventsForEntity(player.id, campaign.id, carl.id);
    expect(asPlayer.find((event) => event.id === publicEvent.id)?.causedBy).toEqual(
      [],
    );
  });

  it("soft-archives a causality link and drops it from timelines", async () => {
    const owner = await makeUser("owner-cause-archive@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const cause = await createEvent(owner.id, campaign.id, {
      title: "Cause",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const effect = await createEvent(owner.id, campaign.id, {
      title: "Effect",
      secret: false,
      participants: [{ entityId: carl.id, role: "AFFECTED" }],
    });
    const link = await linkEventCause(owner.id, campaign.id, {
      causeId: cause.id,
      effectId: effect.id,
    });

    const result = await archiveEventCausality(owner.id, campaign.id, link.id);

    expect(result.affectedEventIds.sort()).toEqual([cause.id, effect.id].sort());
    const row = await prisma.eventCausality.findUnique({ where: { id: link.id } });
    expect(row?.status).toBe(CanonStatus.ARCHIVED);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline.flatMap((event) => event.causes)).toEqual([]);
    expect(timeline.flatMap((event) => event.causedBy)).toEqual([]);
  });

  it("restores an archived causality link through an audited change set", async () => {
    const owner = await makeUser("restore-cause@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const cause = await createEvent(owner.id, campaign.id, {
      title: "Cause",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const effect = await createEvent(owner.id, campaign.id, {
      title: "Effect",
      secret: false,
      participants: [{ entityId: carl.id, role: "AFFECTED" }],
    });
    const link = await linkEventCause(owner.id, campaign.id, {
      causeId: cause.id,
      effectId: effect.id,
    });

    await archiveEventCausality(owner.id, campaign.id, link.id);
    const result = await restoreEventCausality(owner.id, campaign.id, link.id);

    expect(result.affectedEventIds.sort()).toEqual([cause.id, effect.id].sort());
    const row = await prisma.eventCausality.findUnique({ where: { id: link.id } });
    expect(row?.status).toBe(CanonStatus.CANON);
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline.flatMap((event) => event.causes).map((item) => item.linkId)).toContain(
      link.id,
    );
    const provenance = await prisma.provenance.findMany({
      where: { eventCausalityId: link.id },
      orderBy: { createdAt: "asc" },
      include: { changeSet: { select: { title: true } } },
    });
    expect(provenance.at(-1)?.changeSet.title).toBe("Restore event causality");
    expect(provenance.at(-1)?.source).toBe("DM");
  });

  it("projects causality summaries on the campaign timeline", async () => {
    const owner = await makeUser("owner-campaign-causality@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const cause = await createEvent(owner.id, campaign.id, {
      title: "Cause",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const effect = await createEvent(owner.id, campaign.id, {
      title: "Effect",
      secret: false,
      participants: [{ entityId: carl.id, role: "AFFECTED" }],
    });
    const link = await linkEventCause(owner.id, campaign.id, {
      causeId: cause.id,
      effectId: effect.id,
    });

    const timeline = await listCampaignTimeline(owner.id, campaign.id);
    const causeRow = timeline.find((event) => event.id === cause.id);
    const effectRow = timeline.find((event) => event.id === effect.id);

    expect(causeRow?.causes).toEqual([
      { id: effect.id, title: "Effect", linkId: link.id },
    ]);
    expect(effectRow?.causedBy).toEqual([
      { id: cause.id, title: "Cause", linkId: link.id },
    ]);
  });

  it("rejects malformed direct event operations defensively", async () => {
    const owner = await makeUser("owner-event-defensive@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Existing",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await expect(
      applyAutoApprovedEventChangeSet(owner.id, campaign.id, {
        title: "Bad title",
        operations: [
          {
            op: OpKind.UPDATE_EVENT,
            targetId: event.id,
            patch: { title: { to: "" } },
          },
        ],
      }),
    ).rejects.toThrow(/title is required/i);

    await expect(
      applyAutoApprovedEventChangeSet(owner.id, campaign.id, {
        title: "No effects",
        operations: [
          {
            op: OpKind.APPLY_EVENT_EFFECTS,
            targetId: event.id,
            patch: {},
          },
        ],
      }),
    ).rejects.toThrow(/no effects left/i);

    await expect(
      applyAutoApprovedEventChangeSet(owner.id, campaign.id, {
        title: "Bad causality",
        operations: [
          {
            op: OpKind.CREATE_EVENT_CAUSALITY,
            patch: {},
          },
        ],
      }),
    ).rejects.toThrow(/endpoints are required/i);

    await expect(
      applyAutoApprovedEventChangeSet(owner.id, campaign.id, {
        title: "Bad event effect",
        operations: [
          {
            op: OpKind.CREATE_EVENT,
            patch: {
              title: { to: "Effectful event" },
              participants: {
                to: [{ entityId: carl.id, role: "ACTOR" }],
              },
              effects: {
                to: [
                  {
                    kind: "ADJUST_STAT",
                    targetEntityId: carl.id,
                    stat: "gold",
                    delta: 1,
                  },
                ],
              },
            },
          },
        ],
      }),
    ).rejects.toThrow(/target must be a crawler/i);
  });

  it("refuses to create a self-causality link", async () => {
    const owner = await makeUser("owner-self-cause@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Loop",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await expect(
      linkEventCause(owner.id, campaign.id, {
        causeId: event.id,
        effectId: event.id,
      }),
    ).rejects.toThrow(/cannot cause itself/i);
  });

  it("blocks archiving a locked causality link", async () => {
    const owner = await makeUser("owner-cause-locked@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const cause = await createEvent(owner.id, campaign.id, {
      title: "Cause",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const effect = await createEvent(owner.id, campaign.id, {
      title: "Effect",
      secret: false,
      participants: [{ entityId: carl.id, role: "AFFECTED" }],
    });
    const link = await linkEventCause(owner.id, campaign.id, {
      causeId: cause.id,
      effectId: effect.id,
    });
    await prisma.eventCausality.update({
      where: { id: link.id },
      data: { locked: true },
    });

    await expect(
      archiveEventCausality(owner.id, campaign.id, link.id),
    ).rejects.toThrow(/locked/);
    const row = await prisma.eventCausality.findUnique({ where: { id: link.id } });
    expect(row?.status).toBe(CanonStatus.CANON);
  });

  it("allows relinking after archiving a causality link", async () => {
    const owner = await makeUser("owner-relink@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const cause = await createEvent(owner.id, campaign.id, {
      title: "Cause",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const effect = await createEvent(owner.id, campaign.id, {
      title: "Effect",
      secret: false,
      participants: [{ entityId: carl.id, role: "AFFECTED" }],
    });

    const link1 = await linkEventCause(owner.id, campaign.id, {
      causeId: cause.id,
      effectId: effect.id,
    });
    expect(link1.id).toBeDefined();

    await archiveEventCausality(owner.id, campaign.id, link1.id);

    const link2 = await linkEventCause(owner.id, campaign.id, {
      causeId: cause.id,
      effectId: effect.id,
    });
    expect(link2.id).toBeDefined();
    expect(link2.id).not.toBe(link1.id);

    await expect(
      linkEventCause(owner.id, campaign.id, {
        causeId: cause.id,
        effectId: effect.id,
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("serializes concurrent causality links and prevents cycles under race conditions", async () => {
    const owner = await makeUser("owner-concurrent@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const a = await createEvent(owner.id, campaign.id, {
      title: "A",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const b = await createEvent(owner.id, campaign.id, {
      title: "B",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const results = await Promise.allSettled([
      linkEventCause(owner.id, campaign.id, { causeId: a.id, effectId: b.id }),
      linkEventCause(owner.id, campaign.id, { causeId: b.id, effectId: a.id }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect((failed[0] as PromiseRejectedResult).reason.message).toMatch(/cycle/i);
  });

  it("rejects archiving a missing event causality link", async () => {
    const owner = await makeUser("archive-causality-missing@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await expect(
      archiveEventCausality(owner.id, campaign.id, "missing-causality-id"),
    ).rejects.toThrow("Causality link not found.");
  });
});

describe("updateEvent", () => {
  it("edits an event's scalar fields through the pipeline, bumping version + provenance", async () => {
    const owner = await makeUser("owner-edit@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Boss fight",
      summary: "Initial summary",
      floor: 9,
      timeLabel: "Day 3",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const before = await prisma.event.findUnique({ where: { id: event.id } });

    const result = await updateEvent(owner.id, campaign.id, event.id, {
      title: "Boss fight (revised)",
      summary: "They actually fled",
      floor: 10,
      timeLabel: "Day 4",
      secret: true,
    });
    expect(result.participantIds).toContain(carl.id);

    const row = await prisma.event.findUnique({ where: { id: event.id } });
    expect(row?.title).toBe("Boss fight (revised)");
    expect(row?.summary).toBe("They actually fled");
    expect(row?.secret).toBe(true);
    expect(row?.orderKey).toBe(10);
    expect(row?.inGameTime).toMatchObject({ floor: 10, label: "Day 4" });
    expect(row?.version).toBe((before?.version ?? 0) + 1);

    // The edit is visible on the entity timeline.
    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].title).toBe("Boss fight (revised)");
    expect(timeline[0].time).toMatchObject({ floor: 10, label: "Day 4" });

    const provenance = await prisma.provenance.findMany({
      where: { eventId: event.id, field: "title" },
    });
    expect(provenance.length).toBeGreaterThan(0);
  });

  it("clears optional time fields when omitted on edit", async () => {
    const owner = await makeUser("owner-edit-clear@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Event",
      floor: 5,
      timeLabel: "Day 1",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await updateEvent(owner.id, campaign.id, event.id, {
      title: "Event",
      secret: false,
    });

    const row = await prisma.event.findUnique({ where: { id: event.id } });
    expect(row?.orderKey).toBe(0);
    expect(row?.inGameTime).toMatchObject({});
  });

  it("reconciles participants on edit: adds, removes, and re-roles", async () => {
    const owner = await makeUser("owner-edit-parts@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const donut = await makeEntity(owner.id, campaign.id, "Donut");
    const mordecai = await makeEntity(owner.id, campaign.id, "Mordecai");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Boss fight",
      secret: false,
      participants: [
        { entityId: carl.id, role: "ACTOR" },
        { entityId: donut.id, role: "ACTOR" },
      ],
    });

    // Keep Carl as ACTOR, re-role Donut WITNESS→ drop, add Mordecai as TARGET.
    const result = await updateEvent(owner.id, campaign.id, event.id, {
      title: "Boss fight",
      secret: false,
      participants: [
        { entityId: carl.id, role: "WITNESS" },
        { entityId: mordecai.id, role: "TARGET" },
      ],
    });

    // Affected pages include both the dropped (Donut) and added (Mordecai) ends.
    expect(result.participantIds.sort()).toEqual(
      [carl.id, donut.id, mordecai.id].sort(),
    );

    const rows = await prisma.eventParticipant.findMany({
      where: { eventId: event.id },
      select: { entityId: true, role: true },
    });
    const set = rows.map((r) => `${r.entityId}:${r.role}`).sort();
    expect(set).toEqual([`${carl.id}:WITNESS`, `${mordecai.id}:TARGET`].sort());

    // Donut's timeline no longer shows the event; Mordecai's does.
    const donutTl = await listEventsForEntity(owner.id, campaign.id, donut.id);
    expect(donutTl).toHaveLength(0);
    const mordTl = await listEventsForEntity(owner.id, campaign.id, mordecai.id);
    expect(mordTl).toHaveLength(1);
    expect(mordTl[0].role).toBe("TARGET");
  });

  it("exposes every role the viewed entity holds on an event", async () => {
    const owner = await makeUser("owner-selfroles@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Dual role",
      secret: false,
      participants: [
        { entityId: carl.id, role: "ACTOR" },
        { entityId: carl.id, role: "WITNESS" },
      ],
    });
    expect(event.id).toBeTruthy();

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline).toHaveLength(1);
    expect([...timeline[0].selfRoles].sort()).toEqual(["ACTOR", "WITNESS"]);
  });

  it("rejects a stale event edit (base version mismatch)", async () => {
    const owner = await makeUser("owner-stale-event@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Original",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const current = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { version: true },
    });

    // An edit built against an older version must not clobber the current row.
    await expect(
      applyAutoApprovedEventChangeSet(owner.id, campaign.id, {
        title: "Edit event",
        operations: [
          {
            op: OpKind.UPDATE_EVENT,
            targetId: event.id,
            patch: {
              _baseVersion: { to: current.version + 5 },
              title: { to: "Stale clobber" },
            },
          },
        ],
      }),
    ).rejects.toThrow(/changed since you opened it/i);

    const row = await prisma.event.findUnique({ where: { id: event.id } });
    expect(row?.title).toBe("Original");
  });

  it("leaves participants untouched when the edit omits them", async () => {
    const owner = await makeUser("owner-edit-noparts@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const donut = await makeEntity(owner.id, campaign.id, "Donut");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Boss fight",
      secret: false,
      participants: [
        { entityId: carl.id, role: "ACTOR" },
        { entityId: donut.id, role: "ACTOR" },
      ],
    });

    await updateEvent(owner.id, campaign.id, event.id, {
      title: "Renamed",
      secret: false,
    });

    const rows = await prisma.eventParticipant.findMany({ where: { eventId: event.id } });
    expect(rows).toHaveLength(2);
  });

  it("does not add effect targets as affected participants until effects apply", async () => {
    const owner = await makeUser("owner-effect-declare@test.com");
    const player = await makeUser("player-effect-declare@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const hiddenNpc = await makeEntity(owner.id, campaign.id, "Secret source");
    const crawler = await makeCrawler(
      owner.id,
      campaign.id,
      "Public crawler",
      "SHARED_WITH_PLAYERS",
    );
    const event = await createEvent(owner.id, campaign.id, {
      title: "Hidden consequence",
      secret: false,
      participants: [{ entityId: hiddenNpc.id, role: "ACTOR" }],
    });

    await updateEvent(owner.id, campaign.id, event.id, {
      title: "Hidden consequence",
      secret: false,
      effects: [
        {
          kind: "ADJUST_STAT",
          targetEntityId: crawler.id,
          stat: "gold",
          delta: 50,
        },
      ],
    });

    const rows = await prisma.eventParticipant.findMany({
      where: { eventId: event.id },
      select: { entityId: true, role: true },
    });
    expect(rows.map((row) => `${row.entityId}:${row.role}`).sort()).toEqual([
      `${hiddenNpc.id}:ACTOR`,
    ]);

    const playerTimeline = await listEventsForEntity(player.id, campaign.id, crawler.id);
    expect(playerTimeline).toHaveLength(0);
  });

  it("keeps applied effect targets as affected participants during later edits", async () => {
    const owner = await makeUser("owner-applied-effect-parts@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const hiddenNpc = await makeEntity(owner.id, campaign.id, "Secret source");
    const crawler = await makeCrawler(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Loot consequence",
      secret: false,
      participants: [{ entityId: hiddenNpc.id, role: "ACTOR" }],
    });

    await updateEvent(owner.id, campaign.id, event.id, {
      title: "Loot consequence",
      secret: false,
      effects: [
        {
          kind: "ADJUST_STAT",
          targetEntityId: crawler.id,
          stat: "gold",
          delta: 50,
        },
      ],
    });
    const applyResult = await applyEventEffects(owner.id, campaign.id, event.id);
    await approveAcceptedChangeSet(owner.id, campaign.id, applyResult.changeSetId);

    await updateEvent(owner.id, campaign.id, event.id, {
      title: "Loot consequence renamed",
      secret: false,
      participants: [{ entityId: hiddenNpc.id, role: "ACTOR" }],
    });

    const rows = await prisma.eventParticipant.findMany({
      where: { eventId: event.id },
      select: { entityId: true, role: true },
    });
    expect(rows.map((row) => `${row.entityId}:${row.role}`).sort()).toEqual(
      [`${crawler.id}:AFFECTED`, `${hiddenNpc.id}:ACTOR`].sort(),
    );
  });

  it("rejects an edit that drops all participants or names a non-canon one", async () => {
    const owner = await makeUser("owner-edit-badparts@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Boss fight",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await expect(
      updateEvent(owner.id, campaign.id, event.id, {
        title: "Boss fight",
        secret: false,
        // Zod rejects an empty participant list before the service runs.
        participants: [],
      }),
    ).rejects.toThrow(/at least one participant/i);

    await expect(
      updateEvent(owner.id, campaign.id, event.id, {
        title: "Boss fight",
        secret: false,
        participants: [{ entityId: "ghost", role: "ACTOR" }],
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("blocks editing a locked event", async () => {
    const owner = await makeUser("owner-edit-lock@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Sealed",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await setEventLock(owner.id, campaign.id, event.id, true);

    await expect(
      updateEvent(owner.id, campaign.id, event.id, {
        title: "Tampered",
        secret: false,
      }),
    ).rejects.toThrow(/locked/);

    const row = await prisma.event.findUnique({ where: { id: event.id } });
    expect(row?.title).toBe("Sealed");
  });

  it("rejects editing a missing event and blocks players", async () => {
    const owner = await makeUser("owner-edit-missing@test.com");
    const player = await makeUser("player-edit@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Event",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await expect(
      updateEvent(owner.id, campaign.id, "missing", {
        title: "Event",
        secret: false,
      }),
    ).rejects.toThrow(/not found/);

    await expect(
      updateEvent(player.id, campaign.id, event.id, {
        title: "Event",
        secret: false,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("event order (orderKey + rank)", () => {
  it("derives orderKey from the floor and never carries it in the patch", async () => {
    const owner = await makeUser("order-derive@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    const event = await createEvent(owner.id, campaign.id, {
      title: "Floor 7 scene",
      floor: 7,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const row = await prisma.event.findUnique({ where: { id: event.id } });
    expect(row?.orderKey).toBe(7);
    expect(row?.rank).toBeTruthy();

    // The reviewable patch the change set stored must not contain `orderKey` —
    // order is derived, not editable canon (ADR 0004).
    const operation = await prisma.changeOperation.findFirst({
      where: { op: OpKind.CREATE_EVENT, targetId: event.id },
    });
    expect(operation).not.toBeNull();
    expect(Object.keys(operation?.patch as object)).not.toContain("orderKey");
  });

  it("gives events on a floor distinct ranks, newest first", async () => {
    const owner = await makeUser("order-rank@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    const first = await createEvent(owner.id, campaign.id, {
      title: "First",
      floor: 9,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const second = await createEvent(owner.id, campaign.id, {
      title: "Second",
      floor: 9,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const rows = await prisma.event.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { id: true, rank: true },
    });
    const rankById = new Map(rows.map((row) => [row.id, row.rank]));
    expect(rankById.get(first.id)).not.toBe(rankById.get(second.id));
    // Newer event ranks higher, so it sorts first within the floor.
    expect(rankById.get(second.id)! > rankById.get(first.id)!).toBe(true);

    const timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual(["Second", "First"]);
  });

  it("reorders an event within its floor by dropping it between neighbours", async () => {
    const owner = await makeUser("reorder@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    const a = await createEvent(owner.id, campaign.id, {
      title: "A",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "B",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const c = await createEvent(owner.id, campaign.id, {
      title: "C",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    // Newest first → displayed order is C, B, A.
    let timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual(["C", "B", "A"]);

    // Move C to the bottom: drop it below A (aboveId = A, belowId = null).
    const result = await reorderEvent(owner.id, campaign.id, c.id, {
      aboveId: a.id,
      belowId: null,
    });
    expect(result.participantIds).toContain(carl.id);

    timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual(["B", "A", "C"]);
  });

  it("rejects a cross-floor reorder", async () => {
    const owner = await makeUser("reorder-cross@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const onFive = await createEvent(owner.id, campaign.id, {
      title: "Five",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const onNine = await createEvent(owner.id, campaign.id, {
      title: "Nine",
      floor: 9,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await expect(
      reorderEvent(owner.id, campaign.id, onFive.id, { aboveId: onNine.id }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("reassigns orderKey and rank when an edit moves the event to a new floor", async () => {
    const owner = await makeUser("reorder-move-floor@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    // An existing event on floor 12 so the moved event must rank below it.
    await createEvent(owner.id, campaign.id, {
      title: "Resident",
      floor: 12,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const event = await createEvent(owner.id, campaign.id, {
      title: "Mover",
      floor: 3,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const before = await prisma.event.findUnique({ where: { id: event.id } });

    await updateEvent(owner.id, campaign.id, event.id, {
      title: "Mover",
      floor: 12,
      secret: false,
    });

    const after = await prisma.event.findUnique({ where: { id: event.id } });
    expect(after?.orderKey).toBe(12);
    expect(after?.rank).not.toBe(before?.rank);
  });

  it("requires DM access to reorder", async () => {
    const owner = await makeUser("reorder-owner@test.com");
    const player = await makeUser("reorder-player@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Scene",
      floor: 4,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await expect(
      reorderEvent(player.id, campaign.id, event.id, { aboveId: null, belowId: null }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects reordering next to itself", async () => {
    const owner = await makeUser("reorder-self@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Scene",
      floor: 4,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await expect(
      reorderEvent(owner.id, campaign.id, event.id, { aboveId: event.id }),
    ).rejects.toThrow("An event cannot be reordered next to itself.");
  });

  it("handles identical rank reorder early return", async () => {
    const owner = await makeUser("reorder-same@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Scene",
      floor: 4,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const result = await reorderEvent(owner.id, campaign.id, event.id, {
      aboveId: null,
      belowId: null,
    });
    expect(result.id).toBe(event.id);
  });

  it("rejects reordering when aboveId and belowId are the same", async () => {
    const owner = await makeUser("reorder-same-neighbor@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const event = await createEvent(owner.id, campaign.id, {
      title: "Scene",
      floor: 4,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const neighbor = await createEvent(owner.id, campaign.id, {
      title: "Neighbor",
      floor: 4,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await expect(
      reorderEvent(owner.id, campaign.id, event.id, {
        aboveId: neighbor.id,
        belowId: neighbor.id,
      }),
    ).rejects.toThrow("Could not place the event between those neighbours.");
  });
});

describe("order from causality (ADR 0004 slice 3)", () => {
  it("reorders an inverted causal pair so the cause precedes its effect", async () => {
    const owner = await makeUser("order-causality@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    // A logged first (earlier in fiction), C logged second (later). Then C is
    // declared the cause of A — an inversion: the effect A sits before its cause.
    const a = await createEvent(owner.id, campaign.id, {
      title: "A",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const c = await createEvent(owner.id, campaign.id, {
      title: "C",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await linkEventCause(owner.id, campaign.id, { causeId: c.id, effectId: a.id });

    // Before: newest-first display is C, A.
    let timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual(["C", "A"]);

    const result = await orderEventsFromCausality(owner.id, campaign.id);
    expect(result.updatedIds.length).toBeGreaterThan(0);
    expect(result.affectedEntityIds).toContain(carl.id);

    // After: C precedes A in fiction, so the later-first display is A, C.
    timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual(["A", "C"]);

    // The reorder is audited as a mechanical causality pass.
    const audit = await prisma.auditLog.findFirst({
      where: { campaignId: campaign.id, action: "REORDER", targetId: c.id },
      orderBy: { createdAt: "desc" },
    });
    expect((audit?.detail as { reason?: string })?.reason).toBe("CAUSALITY");
  });

  it("is a no-op when the timeline is already causally ordered", async () => {
    const owner = await makeUser("order-causality-noop@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    // A (earlier) causes C (later) — already consistent.
    const a = await createEvent(owner.id, campaign.id, {
      title: "A",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const c = await createEvent(owner.id, campaign.id, {
      title: "C",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await linkEventCause(owner.id, campaign.id, { causeId: a.id, effectId: c.id });

    const result = await orderEventsFromCausality(owner.id, campaign.id);
    expect(result.updatedIds).toEqual([]);
    expect(result.affectedEntityIds).toEqual([]);
  });

  it("never moves a locked (pinned) event, flowing movable ones around it", async () => {
    const owner = await makeUser("order-causality-locked@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    const pinned = await createEvent(owner.id, campaign.id, {
      title: "Pinned",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const movable = await createEvent(owner.id, campaign.id, {
      title: "Movable",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await setEventLock(owner.id, campaign.id, pinned.id, true);
    // The movable event is declared the cause of the locked one — it must sort
    // before the locked event, which itself cannot move.
    await linkEventCause(owner.id, campaign.id, {
      causeId: movable.id,
      effectId: pinned.id,
    });

    const before = await prisma.event.findUnique({ where: { id: pinned.id } });
    const result = await orderEventsFromCausality(owner.id, campaign.id);
    expect(result.updatedIds).toEqual([movable.id]);
    const after = await prisma.event.findUnique({ where: { id: pinned.id } });
    expect(after?.rank).toBe(before?.rank); // pinned rank untouched

    const timeline = await listCampaignTimeline(owner.id, campaign.id);
    // Movable now precedes Pinned in fiction → later-first display is Pinned, Movable.
    expect(timeline.map((event) => event.title)).toEqual(["Pinned", "Movable"]);
  });

  it("never moves an event whose intra-floor order is system-derived", async () => {
    const owner = await makeUser("order-causality-derived@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    // A FLOOR_START anchor with a concrete offset is order-derived → pinned.
    const derived = await createEvent(owner.id, campaign.id, {
      title: "Derived",
      basis: "FLOOR_START",
      floor: 5,
      offset: 2,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const movable = await createEvent(owner.id, campaign.id, {
      title: "Movable",
      floor: 5,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await linkEventCause(owner.id, campaign.id, {
      causeId: movable.id,
      effectId: derived.id,
    });

    const before = await prisma.event.findUnique({ where: { id: derived.id } });
    const result = await orderEventsFromCausality(owner.id, campaign.id);
    expect(result.updatedIds).not.toContain(derived.id);
    const after = await prisma.event.findUnique({ where: { id: derived.id } });
    expect(after?.rank).toBe(before?.rank); // derived-order rank untouched
  });

  it("denies a non-DM", async () => {
    const owner = await makeUser("order-causality-owner@test.com");
    const player = await makeUser("order-causality-player@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    await expect(
      orderEventsFromCausality(player.id, campaign.id),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("typed timeRef (ADR 0004 slice 2)", () => {
  it("persists the typed basis/offset/unit and generates the phrase", async () => {
    const owner = await makeUser("timeref-basic@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    const event = await createEvent(owner.id, campaign.id, {
      title: "Air throttled",
      basis: "FLOOR_COLLAPSE",
      floor: 9,
      offset: 12,
      unit: "HOUR",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const row = await prisma.event.findUnique({ where: { id: event.id } });
    expect(row?.orderKey).toBe(9);
    expect(row?.inGameTime).toEqual({
      basis: "FLOOR_COLLAPSE",
      floor: 9,
      offset: 12,
      unit: "HOUR",
    });

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    expect(timeline[0].time).toMatchObject({
      basis: "FLOOR_COLLAPSE",
      offset: 12,
      unit: "HOUR",
      phrase: "12 hours before Floor 9 falls",
    });
  });

  it("derives intra-floor rank from FLOOR_START offsets, later-in-fiction first", async () => {
    const owner = await makeUser("timeref-derive-start@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    // Logged out of order; the offset (not the log order) decides placement.
    for (const [title, offset] of [
      ["Day 1", 1],
      ["Day 5", 5],
      ["Day 3", 3],
    ] as const) {
      await createEvent(owner.id, campaign.id, {
        title,
        basis: "FLOOR_START",
        floor: 9,
        offset,
        unit: "DAY",
        secret: false,
        participants: [{ entityId: carl.id, role: "ACTOR" }],
      });
    }

    const timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual(["Day 5", "Day 3", "Day 1"]);
  });

  it("derives FLOOR_COLLAPSE rank so less time remaining sorts later", async () => {
    const owner = await makeUser("timeref-derive-collapse@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    await createEvent(owner.id, campaign.id, {
      title: "10h before",
      basis: "FLOOR_COLLAPSE",
      floor: 9,
      offset: 10,
      unit: "HOUR",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "2h before",
      basis: "FLOOR_COLLAPSE",
      floor: 9,
      offset: 2,
      unit: "HOUR",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    // 2h-before is closer to collapse (later in fiction) so it sorts on top.
    const timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual(["2h before", "10h before"]);
  });

  it("re-derives the rank when an edit changes the offset within a floor", async () => {
    const owner = await makeUser("timeref-reedit@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    const early = await createEvent(owner.id, campaign.id, {
      title: "Early",
      basis: "FLOOR_START",
      floor: 9,
      offset: 1,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "Mid",
      basis: "FLOOR_START",
      floor: 9,
      offset: 5,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    // Push Early past Mid by bumping its offset; the derived rank should follow.
    await updateEvent(owner.id, campaign.id, early.id, {
      title: "Early",
      basis: "FLOOR_START",
      floor: 9,
      offset: 9,
      unit: "DAY",
      secret: false,
    });

    const timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual(["Early", "Mid"]);
  });

  it("orders an EVENT-anchored time by its resolved day, not its log order (ADR 0008)", async () => {
    // Regression: an EVENT-basis time ("14 days after A") used to be appended on
    // top by log recency and ignored by the floor-relative siblings' ordering, so
    // it sorted above a later FLOOR_START event instead of by its resolved day.
    const owner = await makeUser("timeref-event-day-order@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    // Floor 8 runs days 61–82, so FLOOR_START / EVENT times resolve to a day.
    await createGenericEntity(owner.id, campaign.id, {
      type: "FLOOR",
      name: "The Bone Market",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
      floorNumber: 8,
      theme: "",
      startDay: 61,
      collapseDay: 82,
    });

    const eventA = await createEvent(owner.id, campaign.id, {
      title: "Event A",
      basis: "FLOOR_START",
      floor: 8,
      offset: 0,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    // C (day 77) logged before B so the old log-recency bug would sink it below B.
    await createEvent(owner.id, campaign.id, {
      title: "Event C",
      basis: "FLOOR_START",
      floor: 8,
      offset: 16,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    // B is "14 days after Event A" → day 75, between A (61) and C (77).
    await createEvent(owner.id, campaign.id, {
      title: "Event B",
      basis: "EVENT",
      floor: 8,
      anchorEventId: eventA.id,
      offset: 14,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual([
      "Event C",
      "Event B",
      "Event A",
    ]);
  });

  it("re-ranks EVENT-anchored dependents when their anchor's time moves (ADR 0008)", async () => {
    const owner = await makeUser("timeref-anchor-move@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    await createGenericEntity(owner.id, campaign.id, {
      type: "FLOOR",
      name: "The Bone Market",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
      floorNumber: 8,
      theme: "",
      startDay: 61,
      collapseDay: 82,
    });

    const anchor = await createEvent(owner.id, campaign.id, {
      title: "Anchor",
      basis: "FLOOR_START",
      floor: 8,
      offset: 0,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    // Dependent is "5 days after Anchor" → day 66 initially.
    await createEvent(owner.id, campaign.id, {
      title: "Dependent",
      basis: "EVENT",
      floor: 8,
      anchorEventId: anchor.id,
      offset: 5,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "Marker",
      basis: "FLOOR_START",
      floor: 8,
      offset: 10,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    // Initially: Marker (71), Dependent (66), Anchor (61).
    let timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual([
      "Marker",
      "Dependent",
      "Anchor",
    ]);

    // Move the anchor to day 76; Dependent ("5 days after") now resolves to 81 and
    // must climb above both Anchor (76) and Marker (71).
    await updateEvent(owner.id, campaign.id, anchor.id, {
      title: "Anchor",
      basis: "FLOOR_START",
      floor: 8,
      offset: 15,
      unit: "DAY",
      secret: false,
    });

    timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual([
      "Dependent",
      "Anchor",
      "Marker",
    ]);
  });

  it("re-ranks a floor's events when its startDay anchor moves (ADR 0008)", async () => {
    // The floor-anchor analogue of the event-time re-rank above: editing a FLOOR
    // entity's startDay shifts the resolved day of every FLOOR_START event on it
    // (and of EVENT-basis events transitively anchored to them on other floors),
    // so their stored intra-floor rank must be re-derived.
    const owner = await makeUser("timeref-floor-anchor-move@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    // Floor 8 runs days 61–82; floor 9 runs days 100–130. Anchors let FLOOR_START
    // / FLOOR_COLLAPSE / EVENT times resolve to concrete days.
    const floor8 = await createGenericEntity(owner.id, campaign.id, {
      type: "FLOOR",
      name: "The Bone Market",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
      floorNumber: 8,
      theme: "",
      startDay: 61,
      collapseDay: 82,
    });
    await createGenericEntity(owner.id, campaign.id, {
      type: "FLOOR",
      name: "The Iron Tangle",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
      floorNumber: 9,
      theme: "",
      startDay: 100,
      collapseDay: 130,
    });

    // Floor 8: a fixed FLOOR_COLLAPSE (day 82) and a FLOOR_START that tracks the
    // floor's open day (day 61, moves with startDay).
    await createEvent(owner.id, campaign.id, {
      title: "F8 Collapse",
      basis: "FLOOR_COLLAPSE",
      floor: 8,
      offset: 0,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const f8Start = await createEvent(owner.id, campaign.id, {
      title: "F8 Start",
      basis: "FLOOR_START",
      floor: 8,
      offset: 0,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    // Floor 9: two fixed events, plus an EVENT-basis dependent anchored to the
    // floor-8 start. It lives on floor 9, so it is reached only transitively (not
    // as a floor-8 seed), and tracks F8 Start's day (61, moves with startDay).
    await createEvent(owner.id, campaign.id, {
      title: "F9 Marker",
      basis: "FLOOR_COLLAPSE",
      floor: 9,
      offset: 0,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "F9 Low",
      basis: "FLOOR_START",
      floor: 9,
      offset: 0,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "F9 After",
      basis: "EVENT",
      floor: 9,
      anchorEventId: f8Start.id,
      offset: 0,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    // Initially: floor 9 [Marker 130, Low 100, After 61], floor 8 [Collapse 82,
    // Start 61]. Timeline is floor-desc, then later-in-fiction first.
    let timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual([
      "F9 Marker",
      "F9 Low",
      "F9 After",
      "F8 Collapse",
      "F8 Start",
    ]);

    // Move floor 8's open day 61 → 115 through the entity-update path. F8 Start now
    // resolves to 115 (climbing above the fixed F8 Collapse at 82), and the
    // transitively anchored F9 After climbs to 115 too (between F9 Low at 100 and
    // F9 Marker at 130).
    await applyAutoApprovedEntityChangeSet(owner.id, campaign.id, {
      title: "Shift floor 8 open day",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: floor8.id,
          patch: { "data.startDay": { from: 61, to: 115 } },
        },
      ],
    });

    timeline = await listCampaignTimeline(owner.id, campaign.id);
    expect(timeline.map((event) => event.title)).toEqual([
      "F9 Marker",
      "F9 After",
      "F9 Low",
      "F8 Start",
      "F8 Collapse",
    ]);
  });

  it("resolves the anchor title for EVENT-basis phrasing and validates the anchor", async () => {
    const owner = await makeUser("timeref-anchor@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");

    const stunt = await createEvent(owner.id, campaign.id, {
      title: "Carl's stunt",
      floor: 3,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const fallout = await createEvent(owner.id, campaign.id, {
      title: "Fallout",
      basis: "EVENT",
      anchorEventId: stunt.id,
      offset: -2,
      unit: "DAY",
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    const timeline = await listEventsForEntity(owner.id, campaign.id, carl.id);
    const falloutRow = timeline.find((event) => event.id === fallout.id);
    expect(falloutRow?.time).toMatchObject({
      basis: "EVENT",
      anchorEventId: stunt.id,
      phrase: "2 days before Carl's stunt",
    });

    // A dangling anchor is rejected; an event can't anchor to itself.
    await expect(
      createEvent(owner.id, campaign.id, {
        title: "Bad anchor",
        basis: "EVENT",
        anchorEventId: "does-not-exist",
        secret: false,
        participants: [{ entityId: carl.id, role: "ACTOR" }],
      }),
    ).rejects.toBeInstanceOf(ServiceError);
    await expect(
      updateEvent(owner.id, campaign.id, stunt.id, {
        title: "Carl's stunt",
        basis: "EVENT",
        anchorEventId: stunt.id,
        secret: false,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("campaign floor metadata", () => {
  async function makeFloor(
    userId: string,
    campaignId: string,
    name: string,
    floorNumber: number,
    theme = "",
    visibility: "DM_ONLY" | "SHARED_WITH_PLAYERS" = "DM_ONLY",
  ) {
    return createGenericEntity(userId, campaignId, {
      type: "FLOOR",
      name,
      summary: "",
      description: "",
      visibility,
      tags: [],
      floorNumber,
      theme,
    });
  }

  it("ladders floors, names them from FLOOR entities, and marks the current floor", async () => {
    const owner = await makeUser("owner-floors@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const larracos = await makeFloor(
      owner.id,
      campaign.id,
      "Larracos",
      9,
      "Castle siege · the moat runs red",
    );
    await makeFloor(owner.id, campaign.id, "The Bone Market", 8);

    await createEvent(owner.id, campaign.id, {
      title: "Floor 8 deal",
      floor: 8,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "Floor 9 opener",
      floor: 9,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "Floor 9 siege",
      floor: 9,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });

    await setCampaignCurrentFloor(owner.id, campaign.id, larracos.id);

    const meta = await listCampaignFloors(owner.id, campaign.id);

    expect(meta.currentFloorId).toBe(larracos.id);
    expect(meta.currentFloorNumber).toBe(9);
    expect(meta.byNumber[9]).toMatchObject({
      name: "Larracos",
      theme: "Castle siege · the moat runs red",
      entityId: larracos.id,
    });
    expect(meta.byNumber[8]?.name).toBe("The Bone Market");

    // Ladder runs 1 → deepest known, with reached/logged/current flags.
    expect(meta.ladder).toHaveLength(9);
    const floor9 = meta.ladder.find((floor) => floor.number === 9)!;
    expect(floor9).toMatchObject({ current: true, reached: true, logged: true, count: 2 });
    const floor8 = meta.ladder.find((floor) => floor.number === 8)!;
    expect(floor8).toMatchObject({ current: false, reached: true, logged: true, count: 1 });
    const floor1 = meta.ladder.find((floor) => floor.number === 1)!;
    expect(floor1).toMatchObject({ logged: false, reached: true });

    // The live event is the newest event on the current floor.
    const timeline = await listCampaignTimeline(owner.id, campaign.id);
    const topFloor9 = timeline.find((event) => event.orderKey === 9);
    expect(meta.liveEventId).toBe(topFloor9?.id);

    // Picker lists FLOOR entities sorted by number.
    expect(meta.floorEntities.map((floor) => floor.floorNumber)).toEqual([8, 9]);
  });

  it("persists and surfaces floor open/collapse anchors (ADR 0008)", async () => {
    const owner = await makeUser("owner-floor-anchors@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    const floor = await createGenericEntity(owner.id, campaign.id, {
      type: "FLOOR",
      name: "Larracos",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
      floorNumber: 9,
      theme: "Castle siege",
      startDay: 40,
      collapseDay: 47,
    });

    const stored = (
      await prisma.entity.findUnique({ where: { id: floor.id }, select: { data: true } })
    )?.data as { startDay?: number; collapseDay?: number };
    expect(stored.startDay).toBe(40);
    expect(stored.collapseDay).toBe(47);

    const meta = await listCampaignFloors(owner.id, campaign.id);
    expect(meta.byNumber[9]).toMatchObject({ startDay: 40, collapseDay: 47 });

    // A floor without anchors surfaces nulls (the default).
    await makeFloor(owner.id, campaign.id, "The Bone Market", 8);
    const meta2 = await listCampaignFloors(owner.id, campaign.id);
    expect(meta2.byNumber[8]).toMatchObject({ startDay: null, collapseDay: null });
  });

  it("hides secret events and DM-only floors from players", async () => {
    const owner = await makeUser("owner-floor-vis@test.com");
    const player = await makeUser("player-floor-vis@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const carl = await makeEntity(
      owner.id,
      campaign.id,
      "Carl",
      "SHARED_WITH_PLAYERS",
    );
    const hiddenFloor = await makeFloor(owner.id, campaign.id, "Hidden Floor", 9); // DM_ONLY
    const hiddenNpc = await makeEntity(owner.id, campaign.id, "Mordecai");
    await setCampaignCurrentFloor(owner.id, campaign.id, hiddenFloor.id);

    await createEvent(owner.id, campaign.id, {
      title: "Public beat",
      floor: 9,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "Secret beat",
      floor: 9,
      secret: true,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    await createEvent(owner.id, campaign.id, {
      title: "Public hidden-participant beat",
      floor: 10,
      secret: false,
      participants: [{ entityId: hiddenNpc.id, role: "ACTOR" }],
    });

    const playerMeta = await listCampaignFloors(player.id, campaign.id);
    // The DM-only FLOOR entity isn't visible, so no name resolves.
    expect(playerMeta.byNumber[9]).toBeUndefined();
    expect(playerMeta.floorEntities).toHaveLength(0);
    // The raw current FLOOR id is hidden from the player projection.
    expect(playerMeta.currentFloorId).toBeNull();
    expect(playerMeta.currentFloorNumber).toBeNull();
    // Only the public event with a visible participant is counted on floor 9.
    expect(playerMeta.ladder.find((floor) => floor.number === 9)?.count).toBe(1);
    // A public event with only hidden participants should not extend/count the ladder.
    expect(playerMeta.ladder.find((floor) => floor.number === 10)).toBeUndefined();
  });

  it("uses the player-visible event projection for the current floor live marker", async () => {
    const owner = await makeUser("owner-floor-live-vis@test.com");
    const player = await makeUser("player-floor-live-vis@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const carl = await makeEntity(
      owner.id,
      campaign.id,
      "Carl",
      "SHARED_WITH_PLAYERS",
    );
    const hiddenNpc = await makeEntity(owner.id, campaign.id, "Mordecai");
    const floor = await makeFloor(
      owner.id,
      campaign.id,
      "Larracos",
      9,
      "",
      "SHARED_WITH_PLAYERS",
    );

    const visibleEvent = await createEvent(owner.id, campaign.id, {
      title: "Visible current beat",
      floor: 9,
      secret: false,
      participants: [{ entityId: carl.id, role: "ACTOR" }],
    });
    const hiddenParticipantEvent = await createEvent(owner.id, campaign.id, {
      title: "Hidden current beat",
      floor: 9,
      secret: false,
      participants: [{ entityId: hiddenNpc.id, role: "ACTOR" }],
    });
    await prisma.event.update({
      where: { id: visibleEvent.id },
      data: { rank: "a1" },
    });
    await prisma.event.update({
      where: { id: hiddenParticipantEvent.id },
      data: { rank: "z1" },
    });
    await setCampaignCurrentFloor(owner.id, campaign.id, floor.id);

    const playerMeta = await listCampaignFloors(player.id, campaign.id);

    expect(playerMeta.currentFloorId).toBe(floor.id);
    expect(playerMeta.currentFloorNumber).toBe(9);
    expect(playerMeta.ladder.find((item) => item.number === 9)?.count).toBe(1);
    expect(playerMeta.liveEventId).toBe(visibleEvent.id);
    expect(playerMeta.liveEventId).not.toBe(hiddenParticipantEvent.id);
  });

  it("sets and clears the current floor, rejecting non-floor targets and players", async () => {
    const owner = await makeUser("owner-set-floor@test.com");
    const player = await makeUser("player-set-floor@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const floor = await makeFloor(owner.id, campaign.id, "Larracos", 9);
    const npc = await makeEntity(owner.id, campaign.id, "Mordecai");

    const set = await setCampaignCurrentFloor(owner.id, campaign.id, floor.id);
    expect(set).toEqual({ currentFloorId: floor.id, floorNumber: 9 });
    expect(
      (await prisma.campaign.findUnique({ where: { id: campaign.id } }))?.currentFloorId,
    ).toBe(floor.id);

    // Non-FLOOR target is rejected.
    await expect(
      setCampaignCurrentFloor(owner.id, campaign.id, npc.id),
    ).rejects.toBeInstanceOf(ServiceError);

    // Players can't set it.
    await expect(
      setCampaignCurrentFloor(player.id, campaign.id, floor.id),
    ).rejects.toBeInstanceOf(ServiceError);

    // Clearing nulls the pointer.
    const cleared = await setCampaignCurrentFloor(owner.id, campaign.id, null);
    expect(cleared.currentFloorId).toBeNull();
    expect(
      (await prisma.campaign.findUnique({ where: { id: campaign.id } }))?.currentFloorId,
    ).toBeNull();
  });

  it("returns empty metadata for non-members in listCampaignFloors", async () => {
    const owner = await makeUser("owner-floor-non@test.com");
    const stranger = await makeUser("stranger-floor-non@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });

    const meta = await listCampaignFloors(stranger.id, campaign.id);
    expect(meta.ladder).toHaveLength(0);
    expect(meta.floorEntities).toHaveLength(0);
  });

  it("tolerates invalid json format in floor data", async () => {
    const owner = await makeUser("owner-floor-invalid@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    
    // Create a floor entity with invalid data (string instead of object)
    await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: "FLOOR",
        name: "Broken Floor",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        status: CanonStatus.CANON,
        data: "invalid json string" as unknown as Prisma.InputJsonValue,
      }
    });

    const meta = await listCampaignFloors(owner.id, campaign.id);
    // Should not throw, but should handle null floorNumber
    expect(meta.floorEntities).toHaveLength(1);
    expect(meta.floorEntities[0].floorNumber).toBeNull();
  });
});

describe("resolveFloorEntity (ADR 0008 §1)", () => {
  function makeFloor(
    userId: string,
    campaignId: string,
    name: string,
    floorNumber: number,
    visibility: "DM_ONLY" | "SHARED_WITH_PLAYERS" = "DM_ONLY",
  ) {
    return createGenericEntity(userId, campaignId, {
      type: "FLOOR",
      name,
      summary: "",
      description: "",
      visibility,
      tags: [],
      floorNumber,
    });
  }

  it("resolves a floor number to its FLOOR entity", async () => {
    const owner = await makeUser("resolve-floor@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const larracos = await makeFloor(owner.id, campaign.id, "Larracos", 9);

    const ref = await resolveFloorEntity(owner.id, campaign.id, 9);
    expect(ref).toMatchObject({ id: larracos.id, name: "Larracos", floorNumber: 9 });
  });

  it("returns null for a number with no FLOOR entity", async () => {
    const owner = await makeUser("resolve-floor-missing@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await makeFloor(owner.id, campaign.id, "Larracos", 9);

    expect(await resolveFloorEntity(owner.id, campaign.id, 3)).toBeNull();
  });

  it("batch-resolves multiple numbers and skips unknowns", async () => {
    const owner = await makeUser("resolve-floor-batch@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const floor8 = await makeFloor(owner.id, campaign.id, "The Bone Market", 8);
    const floor9 = await makeFloor(owner.id, campaign.id, "Larracos", 9);

    const map = await resolveFloorEntities(owner.id, campaign.id, [8, 9, 99]);
    expect(map.get(8)?.id).toBe(floor8.id);
    expect(map.get(9)?.id).toBe(floor9.id);
    expect(map.has(99)).toBe(false);
  });

  it("returns an empty map when given no numbers", async () => {
    const owner = await makeUser("resolve-floor-empty@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await makeFloor(owner.id, campaign.id, "Larracos", 9);

    expect((await resolveFloorEntities(owner.id, campaign.id, [])).size).toBe(0);
  });

  it("does not resolve a DM-only floor for a player", async () => {
    const owner = await makeUser("resolve-floor-dm@test.com");
    const player = await makeUser("resolve-floor-player@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    const hidden = await makeFloor(owner.id, campaign.id, "Secret Floor", 9, "DM_ONLY");
    const shared = await makeFloor(
      owner.id,
      campaign.id,
      "Open Floor",
      8,
      "SHARED_WITH_PLAYERS",
    );

    expect(await resolveFloorEntity(player.id, campaign.id, 9)).toBeNull();
    expect((await resolveFloorEntity(player.id, campaign.id, 8))?.id).toBe(shared.id);
    // The DM still resolves the hidden floor.
    expect((await resolveFloorEntity(owner.id, campaign.id, 9))?.id).toBe(hidden.id);
  });

  it("returns an empty map for a non-member", async () => {
    const owner = await makeUser("resolve-floor-owner@test.com");
    const stranger = await makeUser("resolve-floor-stranger@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await makeFloor(owner.id, campaign.id, "Larracos", 9);

    expect(await resolveFloorEntity(stranger.id, campaign.id, 9)).toBeNull();
  });
});
