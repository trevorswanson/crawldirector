import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CanonStatus, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { archiveEntity, createGenericEntity } from "@/server/services/entities";
import {
  archiveRelationship,
  createRelationship,
  getCampaignRelationshipGraph,
  listConnectionsForEntity,
  restoreRelationship,
  setRelationshipLock,
  updateRelationship,
} from "@/server/services/relationships";
import { applyAutoApprovedRelationshipChangeSet } from "@/server/services/review";
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

  it("persists optional membership day bounds through create and edit", async () => {
    const owner = await makeUser("owner-membership-bounds@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const crawler = await makeEntity(owner.id, campaign.id, "Carl");
    const party = await makeEntity(owner.id, campaign.id, "Princess Posse");

    const edge = await createRelationship(owner.id, campaign.id, crawler.id, {
      type: "MEMBER_OF",
      targetId: party.id,
      sinceDay: 12,
      untilDay: 20,
      secret: false,
    });

    let row = await prisma.relationship.findUnique({ where: { id: edge.id } });
    expect(row?.sinceDay).toBe(12);
    expect(row?.untilDay).toBe(20);

    await updateRelationship(owner.id, campaign.id, edge.id, {
      type: "MEMBER_OF",
      sinceDay: 14,
      secret: false,
    });

    row = await prisma.relationship.findUnique({ where: { id: edge.id } });
    expect(row?.sinceDay).toBe(14);
    expect(row?.untilDay).toBeNull();

    const connection = await listConnectionsForEntity(owner.id, campaign.id, crawler.id);
    expect(connection[0]).toMatchObject({
      sinceDay: 14,
      untilDay: null,
    });
  });

  it("rejects inverted membership day bounds", async () => {
    const owner = await makeUser("owner-inverted-bounds@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const crawler = await makeEntity(owner.id, campaign.id, "Carl");
    const party = await makeEntity(owner.id, campaign.id, "Princess Posse");

    await expect(
      createRelationship(owner.id, campaign.id, crawler.id, {
        type: "MEMBER_OF",
        targetId: party.id,
        sinceDay: 20,
        untilDay: 12,
        secret: false,
      }),
    ).rejects.toThrow(/Since day must be before or equal to until day/);
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

  it("restores an archived edge through an audited change set", async () => {
    const owner = await makeUser("restore-edge@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const source = await makeEntity(owner.id, campaign.id, "A");
    const target = await makeEntity(owner.id, campaign.id, "B");
    const edge = await createRelationship(owner.id, campaign.id, source.id, {
      type: "RIVAL_OF",
      targetId: target.id,
      secret: false,
    });

    await archiveRelationship(owner.id, campaign.id, edge.id);
    const result = await restoreRelationship(owner.id, campaign.id, edge.id);

    expect(result.id).toBe(edge.id);
    const row = await prisma.relationship.findUnique({ where: { id: edge.id } });
    expect(row?.status).toBe(CanonStatus.CANON);
    const connections = await listConnectionsForEntity(owner.id, campaign.id, source.id);
    expect(connections).toHaveLength(1);
    const provenance = await prisma.provenance.findMany({
      where: { relationshipId: edge.id },
      orderBy: { createdAt: "asc" },
      include: { changeSet: { select: { title: true } } },
    });
    expect(provenance.at(-1)?.changeSet.title).toBe("Restore connection");
    expect(provenance.at(-1)?.source).toBe("DM");
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

  it("edits an edge's fields through the pipeline, bumping version + provenance", async () => {
    const owner = await makeUser("owner-edit@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const source = await makeEntity(owner.id, campaign.id, "Carl");
    const target = await makeEntity(owner.id, campaign.id, "Donut");
    const edge = await createRelationship(owner.id, campaign.id, source.id, {
      type: "ALLY_OF",
      targetId: target.id,
      disposition: 40,
      notes: "Early days",
      secret: false,
    });

    const before = await prisma.relationship.findUnique({ where: { id: edge.id } });

    const result = await updateRelationship(owner.id, campaign.id, edge.id, {
      type: "RIVAL_OF",
      disposition: -60,
      notes: "Fell out after Floor 9",
      secret: true,
    });
    expect(result).toMatchObject({ sourceId: source.id, targetId: target.id });

    const row = await prisma.relationship.findUnique({ where: { id: edge.id } });
    expect(row?.type).toBe("RIVAL_OF");
    expect(row?.disposition).toBe(-60);
    expect(row?.notes).toBe("Fell out after Floor 9");
    expect(row?.secret).toBe(true);
    expect(row?.sinceDay).toBeNull();
    expect(row?.untilDay).toBeNull();
    // Endpoints are never re-pointed by an edit.
    expect(row?.sourceId).toBe(source.id);
    expect(row?.targetId).toBe(target.id);
    expect(row?.version).toBe((before?.version ?? 0) + 1);

    const provenance = await prisma.provenance.findMany({
      where: { relationshipId: edge.id, changeSetId: { not: undefined } },
    });
    // The edit wrote its own provenance rows (one per edited field).
    expect(provenance.some((p) => p.field === "type")).toBe(true);
    expect(provenance.some((p) => p.field === "secret")).toBe(true);
  });

  it("clears optional edge fields when omitted on edit", async () => {
    const owner = await makeUser("owner-edit-clear@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const source = await makeEntity(owner.id, campaign.id, "A");
    const target = await makeEntity(owner.id, campaign.id, "B");
    const edge = await createRelationship(owner.id, campaign.id, source.id, {
      type: "ALLY_OF",
      targetId: target.id,
      disposition: 75,
      notes: "Has notes",
      secret: false,
    });

    await updateRelationship(owner.id, campaign.id, edge.id, {
      type: "ALLY_OF",
      secret: false,
    });

    const row = await prisma.relationship.findUnique({ where: { id: edge.id } });
    expect(row?.disposition).toBeNull();
    expect(row?.notes).toBeNull();
  });

  it("rejects a stale edge edit (base version mismatch)", async () => {
    const owner = await makeUser("owner-stale-edge@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const source = await makeEntity(owner.id, campaign.id, "A");
    const target = await makeEntity(owner.id, campaign.id, "B");
    const edge = await createRelationship(owner.id, campaign.id, source.id, {
      type: "ALLY_OF",
      targetId: target.id,
      secret: false,
    });
    const current = await prisma.relationship.findUniqueOrThrow({
      where: { id: edge.id },
      select: { type: true, version: true },
    });

    await expect(
      applyAutoApprovedRelationshipChangeSet(owner.id, campaign.id, {
        title: "Edit connection",
        operations: [
          {
            op: OpKind.UPDATE_RELATIONSHIP,
            targetId: edge.id,
            patch: {
              _baseVersion: { to: current.version + 5 },
              type: { to: "RIVAL_OF" },
            },
          },
        ],
      }),
    ).rejects.toThrow(/changed since you opened it/i);

    const row = await prisma.relationship.findUnique({ where: { id: edge.id } });
    expect(row?.type).toBe(current.type);
  });

  it("blocks editing a locked edge", async () => {
    const owner = await makeUser("owner-edit-lock@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const source = await makeEntity(owner.id, campaign.id, "A");
    const target = await makeEntity(owner.id, campaign.id, "B");
    const edge = await createRelationship(owner.id, campaign.id, source.id, {
      type: "ALLY_OF",
      targetId: target.id,
      secret: false,
    });
    await setRelationshipLock(owner.id, campaign.id, edge.id, true);

    await expect(
      updateRelationship(owner.id, campaign.id, edge.id, {
        type: "RIVAL_OF",
        secret: false,
      }),
    ).rejects.toThrow(/locked/);

    const row = await prisma.relationship.findUnique({ where: { id: edge.id } });
    expect(row?.type).toBe("ALLY_OF");
  });

  it("rejects editing a missing edge and blocks players", async () => {
    const owner = await makeUser("owner-edit-missing@test.com");
    const player = await makeUser("player-edit@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const source = await makeEntity(owner.id, campaign.id, "A");
    const target = await makeEntity(owner.id, campaign.id, "B");
    const edge = await createRelationship(owner.id, campaign.id, source.id, {
      type: "ALLY_OF",
      targetId: target.id,
      secret: false,
    });

    await expect(
      updateRelationship(owner.id, campaign.id, "missing", {
        type: "ALLY_OF",
        secret: false,
      }),
    ).rejects.toThrow(/not found/);

    await expect(
      updateRelationship(player.id, campaign.id, edge.id, {
        type: "ALLY_OF",
        secret: false,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
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

describe("getCampaignRelationshipGraph", () => {
  it("returns connected entities and their edges, omitting isolated entities", async () => {
    const owner = await makeUser("graph-owner@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const carl = await makeEntity(owner.id, campaign.id, "Carl");
    const donut = await makeEntity(owner.id, campaign.id, "Donut");
    await makeEntity(owner.id, campaign.id, "Loner"); // no edges

    const edge = await createRelationship(owner.id, campaign.id, carl.id, {
      type: "ALLY_OF",
      targetId: donut.id,
      secret: false,
    });

    const graph = await getCampaignRelationshipGraph(owner.id, campaign.id);
    expect(graph).not.toBeNull();
    expect(graph!.edges).toHaveLength(1);
    expect(graph!.edges[0]).toMatchObject({
      id: edge.id,
      type: "ALLY_OF",
      sourceId: carl.id,
      targetId: donut.id,
      secret: false,
    });
    // Only the two connected entities — the loner is not a graph node.
    expect(graph!.nodes.map((n) => n.name).sort()).toEqual(["Carl", "Donut"]);
  });

  it("flags a locked node", async () => {
    const owner = await makeUser("graph-lock@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const a = await makeEntity(owner.id, campaign.id, "A");
    const b = await makeEntity(owner.id, campaign.id, "B");
    await createRelationship(owner.id, campaign.id, a.id, {
      type: "ALLY_OF",
      targetId: b.id,
      secret: false,
    });
    await prisma.entity.update({ where: { id: a.id }, data: { locked: true } });

    const graph = await getCampaignRelationshipGraph(owner.id, campaign.id);
    expect(graph!.nodes.find((n) => n.id === a.id)?.locked).toBe(true);
    expect(graph!.nodes.find((n) => n.id === b.id)?.locked).toBe(false);
  });

  it("hides secret edges and edges to invisible/archived endpoints from players", async () => {
    const owner = await makeUser("graph-owner2@test.com");
    const player = await makeUser("graph-player@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    const hub = await makeEntity(owner.id, campaign.id, "Hub", "SHARED_WITH_PLAYERS");
    const shared = await makeEntity(owner.id, campaign.id, "Shared", "SHARED_WITH_PLAYERS");
    const hidden = await makeEntity(owner.id, campaign.id, "Hidden", "DM_ONLY");

    await createRelationship(owner.id, campaign.id, hub.id, {
      type: "ALLY_OF",
      targetId: shared.id,
      secret: false,
    });
    await createRelationship(owner.id, campaign.id, hub.id, {
      type: "BETRAYED",
      targetId: shared.id,
      secret: true,
    });
    await createRelationship(owner.id, campaign.id, hub.id, {
      type: "KNOWS_ABOUT",
      targetId: hidden.id,
      secret: false,
    });

    const asDm = await getCampaignRelationshipGraph(owner.id, campaign.id);
    expect(asDm!.edges).toHaveLength(3);
    expect(asDm!.nodes).toHaveLength(3);

    const asPlayer = await getCampaignRelationshipGraph(player.id, campaign.id);
    expect(asPlayer!.edges).toHaveLength(1);
    expect(asPlayer!.edges[0].type).toBe("ALLY_OF");
    // The DM-only "Hidden" entity never becomes a player-visible node.
    expect(asPlayer!.nodes.map((n) => n.name).sort()).toEqual(["Hub", "Shared"]);
  });

  it("drops edges to an archived endpoint for everyone", async () => {
    const owner = await makeUser("graph-archive@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const a = await makeEntity(owner.id, campaign.id, "A");
    const b = await makeEntity(owner.id, campaign.id, "B");
    await createRelationship(owner.id, campaign.id, a.id, {
      type: "ALLY_OF",
      targetId: b.id,
      secret: false,
    });

    await archiveEntity(owner.id, campaign.id, b.id);

    const graph = await getCampaignRelationshipGraph(owner.id, campaign.id);
    expect(graph!.edges).toHaveLength(0);
    expect(graph!.nodes).toHaveLength(0);
  });

  it("returns null for a non-member", async () => {
    const owner = await makeUser("graph-owner3@test.com");
    const stranger = await makeUser("graph-stranger@test.com");
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const a = await makeEntity(owner.id, campaign.id, "A");
    const b = await makeEntity(owner.id, campaign.id, "B");
    await createRelationship(owner.id, campaign.id, a.id, {
      type: "ALLY_OF",
      targetId: b.id,
      secret: false,
    });

    expect(await getCampaignRelationshipGraph(stranger.id, campaign.id)).toBeNull();
  });
});
