import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CanonStatus, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createGenericEntity } from "@/server/services/entities";
import {
  archiveRelationship,
  createRelationship,
  listConnectionsForEntity,
  setRelationshipLock,
} from "@/server/services/relationships";

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

describe("relationship service", () => {
  it("creates an edge through the pipeline with provenance, on both ends", async () => {
    const owner = await makeUser("owner@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const source = await makeEntity(owner.id, campaign.id, "Carl");
    const target = await makeEntity(owner.id, campaign.id, "Donut");

    const edge = await createRelationship(owner.id, campaign.id, source.id, {
      type: "ALLY_OF",
      targetId: target.id,
      disposition: 80,
      notes: "Partners on the crawl",
      secret: false,
    });

    // Canon row with provenance.
    const row = await prisma.relationship.findUnique({ where: { id: edge.id } });
    expect(row?.status).toBe(CanonStatus.CANON);
    expect(row?.type).toBe("ALLY_OF");
    expect(row?.disposition).toBe(80);
    expect(row?.notes).toBe("Partners on the crawl");
    expect(row?.source).toBe("DM");

    const provenance = await prisma.provenance.findMany({
      where: { relationshipId: edge.id },
    });
    expect(provenance.length).toBeGreaterThan(0);
    expect(provenance.every((p) => p.source === "DM")).toBe(true);

    // Outgoing from source, incoming to target.
    const fromSource = await listConnectionsForEntity(owner.id, campaign.id, source.id);
    expect(fromSource).toHaveLength(1);
    expect(fromSource[0].direction).toBe("out");
    expect(fromSource[0].other.name).toBe("Donut");

    const fromTarget = await listConnectionsForEntity(owner.id, campaign.id, target.id);
    expect(fromTarget).toHaveLength(1);
    expect(fromTarget[0].direction).toBe("in");
    expect(fromTarget[0].other.name).toBe("Carl");
  });

  it("hides secret edges and edges to invisible entities from players", async () => {
    const owner = await makeUser("owner2@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    const hub = await makeEntity(owner.id, campaign.id, "Hub", "SHARED_WITH_PLAYERS");
    const shared = await makeEntity(owner.id, campaign.id, "Shared", "SHARED_WITH_PLAYERS");
    const hidden = await makeEntity(owner.id, campaign.id, "Hidden", "DM_ONLY");

    // public edge to a shared entity
    await createRelationship(owner.id, campaign.id, hub.id, {
      type: "ALLY_OF",
      targetId: shared.id,
      secret: false,
    });
    // secret edge to a shared entity
    await createRelationship(owner.id, campaign.id, hub.id, {
      type: "BETRAYED",
      targetId: shared.id,
      secret: true,
    });
    // public edge to a DM-only entity
    await createRelationship(owner.id, campaign.id, hub.id, {
      type: "KNOWS_ABOUT",
      targetId: hidden.id,
      secret: false,
    });

    const asDm = await listConnectionsForEntity(owner.id, campaign.id, hub.id);
    expect(asDm).toHaveLength(3);

    const asPlayer = await listConnectionsForEntity(player.id, campaign.id, hub.id);
    expect(asPlayer).toHaveLength(1);
    expect(asPlayer[0].type).toBe("ALLY_OF");
    expect(asPlayer[0].other.name).toBe("Shared");
  });

  it("soft-archives an edge but retains it", async () => {
    const owner = await makeUser("owner3@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const source = await makeEntity(owner.id, campaign.id, "A");
    const target = await makeEntity(owner.id, campaign.id, "B");
    const edge = await createRelationship(owner.id, campaign.id, source.id, {
      type: "RIVAL_OF",
      targetId: target.id,
      secret: false,
    });

    await archiveRelationship(owner.id, campaign.id, edge.id);

    const row = await prisma.relationship.findUnique({ where: { id: edge.id } });
    expect(row?.status).toBe(CanonStatus.ARCHIVED);
    const connections = await listConnectionsForEntity(owner.id, campaign.id, source.id);
    expect(connections).toHaveLength(0);
  });

  it("locks and unlocks an edge with audit history", async () => {
    const owner = await makeUser("owner-lock@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const source = await makeEntity(owner.id, campaign.id, "A");
    const target = await makeEntity(owner.id, campaign.id, "B");
    const edge = await createRelationship(owner.id, campaign.id, source.id, {
      type: "ALLY_OF",
      targetId: target.id,
      secret: false,
    });

    const locked = await setRelationshipLock(owner.id, campaign.id, edge.id, true);
    expect(locked.locked).toBe(true);
    expect(locked.sourceId).toBe(source.id);
    expect(locked.targetId).toBe(target.id);
    await expect(
      archiveRelationship(owner.id, campaign.id, edge.id),
    ).rejects.toThrow(/locked/);

    const connections = await listConnectionsForEntity(owner.id, campaign.id, source.id);
    expect(connections[0].locked).toBe(true);

    const unlocked = await setRelationshipLock(owner.id, campaign.id, edge.id, false);
    expect(unlocked.locked).toBe(false);

    const audit = await prisma.auditLog.findMany({
      where: { targetType: "RELATIONSHIP", targetId: edge.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((entry) => entry.action)).toEqual(["LOCK", "UNLOCK"]);
  });

  it("blocks players from creating edges", async () => {
    const owner = await makeUser("owner4@test.com");
    const player = await makeUser("player4@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const a = await makeEntity(owner.id, campaign.id, "A");
    const b = await makeEntity(owner.id, campaign.id, "B");

    await expect(
      createRelationship(player.id, campaign.id, a.id, {
        type: "ALLY_OF",
        targetId: b.id,
        secret: false,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("blocks players from locking edges", async () => {
    const owner = await makeUser("owner-player-lock@test.com");
    const player = await makeUser("player-lock@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const a = await makeEntity(owner.id, campaign.id, "A");
    const b = await makeEntity(owner.id, campaign.id, "B");
    const edge = await createRelationship(owner.id, campaign.id, a.id, {
      type: "ALLY_OF",
      targetId: b.id,
      secret: false,
    });

    await expect(
      setRelationshipLock(player.id, campaign.id, edge.id, true),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects a self-edge and a missing target", async () => {
    const owner = await makeUser("owner5@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const a = await makeEntity(owner.id, campaign.id, "A");

    await expect(
      createRelationship(owner.id, campaign.id, a.id, {
        type: "ALLY_OF",
        targetId: a.id,
        secret: false,
      }),
    ).rejects.toThrow(/two different entities/);

    await expect(
      createRelationship(owner.id, campaign.id, a.id, {
        type: "ALLY_OF",
        targetId: "does-not-exist",
        secret: false,
      }),
    ).rejects.toThrow(/Entity not found/);
  });

  it("rejects an endpoint that is not live canon", async () => {
    const owner = await makeUser("owner7@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const canon = await makeEntity(owner.id, campaign.id, "Canon");
    // A non-canon entity row (e.g. draft) must not be a valid endpoint.
    const pending = await prisma.entity.create({
      data: {
        campaignId: campaign.id,
        type: "NPC",
        name: "Draft NPC",
        status: CanonStatus.PENDING,
      },
      select: { id: true },
    });

    await expect(
      createRelationship(owner.id, campaign.id, canon.id, {
        type: "ALLY_OF",
        targetId: pending.id,
        secret: false,
      }),
    ).rejects.toThrow(/Entity not found/);
  });

  it("returns no connections for a non-member", async () => {
    const owner = await makeUser("owner6@test.com");
    const stranger = await makeUser("stranger@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const a = await makeEntity(owner.id, campaign.id, "A");
    const b = await makeEntity(owner.id, campaign.id, "B");
    await createRelationship(owner.id, campaign.id, a.id, {
      type: "ALLY_OF",
      targetId: b.id,
      secret: false,
    });

    expect(await listConnectionsForEntity(stranger.id, campaign.id, a.id)).toEqual([]);
  });
});
