import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CanonStatus, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createGenericEntity } from "@/server/services/entities";
import {
  archiveEvent,
  createEvent,
  listEventsForEntity,
} from "@/server/services/events";

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
});
