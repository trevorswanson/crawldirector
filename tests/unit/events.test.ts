import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CanonStatus, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createCrawler, createGenericEntity } from "@/server/services/entities";
import {
  archiveEvent,
  archiveEventCausality,
  applyEventEffects,
  createEvent,
  linkEventCause,
  listCampaignTimeline,
  listEventsForEntity,
  setEventLock,
  updateEvent,
} from "@/server/services/events";
import { applyAutoApprovedEventChangeSet } from "@/server/services/review";
import { OpKind } from "@/generated/prisma/client";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
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
    expect(row?.inGameTime).toEqual({ floor: 9, label: "Day 3" });
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
    expect(carlTimeline[0].time).toEqual({ floor: 9, label: "Day 3" });
    expect(carlTimeline[0].others).toHaveLength(1);
    expect(carlTimeline[0].others[0].name).toBe("Donut");

    const donutTimeline = await listEventsForEntity(owner.id, campaign.id, donut.id);
    expect(donutTimeline[0].others[0].name).toBe("Carl");
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
    expect(timeline[0].time).toEqual({ floor: 9, label: "Day 3" });
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
    await applyEventEffects(owner.id, campaign.id, event.id);

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
