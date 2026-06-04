import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  EntityType,
  EventParticipantRole,
  RelationshipType,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  applyAutoApprovedEntityChangeSet,
  applyAutoApprovedEventChangeSet,
  applyAutoApprovedRelationshipChangeSet,
  approveChangeSet,
  createPendingEntityChangeSet,
  getEntityProvenance,
  getReviewChangeSetForUser,
  listPendingChangeSetsForUser,
  rejectChangeSet,
  reopenChangeSet,
  setChangeOperationDecision,
} from "@/server/services/review";

function makeUser(email: string, name?: string) {
  return prisma.user.create({ data: { email, name } });
}

beforeEach(async () => {
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
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

async function seed() {
  const owner = await makeUser("owner@test.com", "Owner DM");
  const campaign = await createCampaign(owner.id, { name: "Dungeon" });
  return { dmId: owner.id, campaignId: campaign.id };
}

async function versionOf(entityId: string) {
  const entity = await prisma.entity.findUniqueOrThrow({
    where: { id: entityId },
    select: { version: true },
  });
  return entity.version;
}

async function acceptAllOperations(changeSetId: string) {
  await prisma.changeOperation.updateMany({
    where: { changeSetId, decision: "PENDING" },
    data: { decision: "ACCEPTED" },
  });
}

async function createEntity(
  dmId: string,
  campaignId: string,
  name: string,
  type: EntityType = EntityType.NPC,
) {
  const result = await applyAutoApprovedEntityChangeSet(dmId, campaignId, {
    title: `Create ${name}`,
    operations: [
      {
        op: "CREATE_ENTITY",
        patch: {
          type: { to: type },
          name: { to: name },
          summary: { to: "Original summary" },
          description: { to: "Original description" },
          visibility: { to: Visibility.DM_ONLY },
          tags: { to: ["seed"] },
        },
      },
    ],
  });
  return result.targetIds[0];
}

describe("review service — approveChangeSet (single)", () => {
  it("refuses to approve untouched pending operations", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Pending");
    const baseVersion = await versionOf(entityId);
    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Still needs review",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: {
            _baseVersion: { to: baseVersion },
            summary: { to: "Unreviewed summary" },
          },
        },
      ],
    });

    await expect(approveChangeSet(dmId, campaignId, set.id)).rejects.toThrow(
      /accept at least one operation/i,
    );
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: entityId } }),
    ).resolves.toMatchObject({ summary: "Original summary", version: baseVersion });
    await expect(
      prisma.changeSet.findUniqueOrThrow({ where: { id: set.id } }),
    ).resolves.toMatchObject({ status: "PENDING" });
  });

  it("applies a pending entity update and records provenance", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Goblin");
    const baseVersion = await versionOf(entityId);

    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI rewrite",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: {
            _baseVersion: { to: baseVersion },
            summary: { from: "Original summary", to: "Rewritten summary" },
            description: { to: "Rewritten description" },
            visibility: { to: Visibility.SHARED_WITH_PLAYERS },
            tags: { to: ["rewritten"] },
          },
        },
      ],
    });

    await acceptAllOperations(set.id);
    const result = await approveChangeSet(dmId, campaignId, set.id);
    expect(result.targetIds).toEqual([entityId]);

    const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
    expect(entity.summary).toBe("Rewritten summary");
    expect(entity.visibility).toBe(Visibility.SHARED_WITH_PLAYERS);
    expect(entity.version).toBe(baseVersion + 1);

    const stored = await prisma.changeSet.findUniqueOrThrow({ where: { id: set.id } });
    expect(stored.status).toBe("APPROVED");
    expect(stored.reviewedById).toBe(dmId);

    const provenance = await prisma.provenance.findMany({
      where: { entityId, changeSetId: set.id },
    });
    expect(provenance.map((p) => p.field).sort()).toEqual(
      ["description", "summary", "tags", "visibility"].sort(),
    );
    expect(provenance.every((p) => p.source === "AI")).toBe(true);
  });

  it("creates a crawler through a pending change set and approval", async () => {
    const { dmId, campaignId } = await seed();
    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI proposes a crawler",
      operations: [
        {
          op: "CREATE_ENTITY",
          patch: {
            type: { to: EntityType.CRAWLER },
            name: { to: "Carl" },
            "crawler.level": { to: 7 },
            "crawler.gold": { to: 250 },
            "crawler.viewCount": { to: "1000000" },
            "crawler.isAlive": { to: false },
            "crawler.currentFloor": { to: 9 },
          },
        },
      ],
    });

    await acceptAllOperations(set.id);
    const result = await approveChangeSet(dmId, campaignId, set.id);
    const crawlerId = result.targetIds[0];

    const entity = await prisma.entity.findUniqueOrThrow({
      where: { id: crawlerId },
      include: { crawler: true },
    });
    expect(entity.type).toBe(EntityType.CRAWLER);
    expect(entity.crawler?.level).toBe(7);
    expect(entity.crawler?.gold).toBe(250);
    expect(entity.crawler?.viewCount).toBe(BigInt(1000000));
    expect(entity.crawler?.isAlive).toBe(false);
    expect(entity.crawler?.currentFloor).toBe(9);
  });

  it("soft-deletes an entity through a pending DELETE_ENTITY change set", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Doomed");
    const baseVersion = await versionOf(entityId);

    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Retire entity",
      operations: [
        {
          op: "DELETE_ENTITY",
          targetId: entityId,
          patch: {
            _baseVersion: { to: baseVersion },
            status: { from: "CANON", to: "ARCHIVED" },
          },
        },
      ],
    });

    await acceptAllOperations(set.id);
    await approveChangeSet(dmId, campaignId, set.id);

    const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
    expect(entity.status).toBe("ARCHIVED");
    expect(entity.version).toBe(baseVersion + 1);
  });

  it("rejects approval of a missing or non-pending change set", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      approveChangeSet(dmId, campaignId, "missing-id"),
    ).rejects.toThrow(ServiceError);
  });

  it("refuses to approve when an operation is blocked by a lock", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Locked");
    const baseVersion = await versionOf(entityId);
    await prisma.entity.update({
      where: { id: entityId },
      data: { lockedFields: ["summary"] },
    });

    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Touches a locked field",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: {
            _baseVersion: { to: baseVersion },
            summary: { to: "blocked" },
          },
        },
      ],
    });

    await acceptAllOperations(set.id);
    await expect(approveChangeSet(dmId, campaignId, set.id)).rejects.toThrow(
      /blocked by locks/,
    );
  });

  it("refuses to approve when an operation has gone stale", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Drifted");
    const baseVersion = await versionOf(entityId);

    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Stale proposal",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: {
            _baseVersion: { to: baseVersion },
            summary: { to: "late" },
          },
        },
      ],
    });

    // A direct DM edit bumps the version out from under the proposal.
    await applyAutoApprovedEntityChangeSet(dmId, campaignId, {
      title: "DM edit",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: {
            _baseVersion: { to: baseVersion },
            description: { to: "changed under it" },
          },
        },
      ],
    });

    await acceptAllOperations(set.id);
    await expect(approveChangeSet(dmId, campaignId, set.id)).rejects.toThrow(
      /stale/,
    );
  });
});

describe("review service — setChangeOperationDecision", () => {
  async function pendingUpdate(dmId: string, campaignId: string, entityId: string) {
    const baseVersion = await versionOf(entityId);
    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI proposal",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: {
            _baseVersion: { to: baseVersion },
            summary: { to: "AI summary" },
            description: { to: "AI description" },
          },
        },
      ],
    });
    const op = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSetId: set.id },
    });
    return { setId: set.id, opId: op.id };
  }

  it("rejects a single operation", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "NPC");
    const { setId, opId } = await pendingUpdate(dmId, campaignId, entityId);

    const updated = await setChangeOperationDecision(dmId, campaignId, setId, opId, {
      decision: "REJECTED",
    });
    expect(updated.decision).toBe("REJECTED");
  });

  it("accepts a single operation", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "NPC");
    const { setId, opId } = await pendingUpdate(dmId, campaignId, entityId);

    const updated = await setChangeOperationDecision(dmId, campaignId, setId, opId, {
      decision: "ACCEPTED",
    });
    expect(updated.decision).toBe("ACCEPTED");
  });

  it("stores an edited patch and applies it on approval", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "NPC");
    const { setId, opId } = await pendingUpdate(dmId, campaignId, entityId);

    await setChangeOperationDecision(dmId, campaignId, setId, opId, {
      decision: "EDITED",
      editedPatch: { summary: { to: "DM-edited summary" } },
    });

    await approveChangeSet(dmId, campaignId, setId);

    const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
    // The edited value wins; the un-edited description field is dropped.
    expect(entity.summary).toBe("DM-edited summary");
    expect(entity.description).toBe("Original description");
  });

  it("throws when the change set is missing", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      setChangeOperationDecision(dmId, campaignId, "missing", "op", {
        decision: "REJECTED",
      }),
    ).rejects.toThrow(/Change set not found/);
  });

  it("throws when the operation is missing", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "NPC");
    const { setId } = await pendingUpdate(dmId, campaignId, entityId);

    await expect(
      setChangeOperationDecision(dmId, campaignId, setId, "missing-op", {
        decision: "REJECTED",
      }),
    ).rejects.toThrow(/operation not found/);
  });

  it("rejects an edited patch with no fields", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "NPC");
    const { setId, opId } = await pendingUpdate(dmId, campaignId, entityId);

    await expect(
      setChangeOperationDecision(dmId, campaignId, setId, opId, {
        decision: "EDITED",
        editedPatch: {},
      }),
    ).rejects.toThrow(/at least one field/);
  });

  it("rejects an edited patch that introduces an unknown field", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "NPC");
    const { setId, opId } = await pendingUpdate(dmId, campaignId, entityId);

    await expect(
      setChangeOperationDecision(dmId, campaignId, setId, opId, {
        decision: "EDITED",
        editedPatch: { name: { to: "not in original" } },
      }),
    ).rejects.toThrow(/unknown field/);
  });
});

describe("review service — getEntityProvenance", () => {
  it("returns null for a non-member", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "NPC");
    const outsider = await makeUser("outsider@test.com");

    expect(await getEntityProvenance(outsider.id, campaignId, entityId)).toBeNull();
  });

  it("returns null when the entity has no applied operations", async () => {
    const { dmId, campaignId } = await seed();
    expect(
      await getEntityProvenance(dmId, campaignId, "no-such-entity"),
    ).toBeNull();
  });

  it("summarizes origin and latest change after approval", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Historied");
    const baseVersion = await versionOf(entityId);

    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "AI enriches the NPC",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: {
            _baseVersion: { to: baseVersion },
            summary: { to: "Enriched summary" },
          },
        },
      ],
    });
    await acceptAllOperations(set.id);
    await approveChangeSet(dmId, campaignId, set.id);

    const provenance = await getEntityProvenance(dmId, campaignId, entityId);
    expect(provenance).not.toBeNull();
    expect(provenance?.changeCount).toBeGreaterThan(0);
    expect(provenance?.approvedByLabel).toBe("Owner DM");
    expect(provenance?.lastChangeSource).toBe("AI");
  });
});

describe("review service — rejectChangeSet (single)", () => {
  it("rejects a pending change set without touching canon", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Untouched");
    const baseVersion = await versionOf(entityId);
    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Discard me",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: {
            _baseVersion: { to: baseVersion },
            summary: { to: "never applied" },
          },
        },
      ],
    });

    await rejectChangeSet(dmId, campaignId, set.id);

    const stored = await prisma.changeSet.findUniqueOrThrow({ where: { id: set.id } });
    expect(stored.status).toBe("REJECTED");
    expect(stored.reviewedById).toBe(dmId);
    const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
    expect(entity.summary).toBe("Original summary");
  });

  it("rejects rejection from a non-DM member", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "NPC");
    const baseVersion = await versionOf(entityId);
    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "x",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: { _baseVersion: { to: baseVersion }, summary: { to: "x" } },
        },
      ],
    });
    const player = await makeUser("player@test.com");
    await prisma.membership.create({
      data: { userId: player.id, campaignId, role: Role.PLAYER },
    });

    await expect(
      rejectChangeSet(player.id, campaignId, set.id),
    ).rejects.toThrow(ServiceError);
  });
});

describe("review service — reopenChangeSet", () => {
  it("reopens a rejected proposal and preserves its edited field selection", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Reconsidered");
    const baseVersion = await versionOf(entityId);
    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Reopen me",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: {
            _baseVersion: { to: baseVersion },
            summary: { to: "AI summary" },
            description: { to: "AI description" },
          },
        },
      ],
    });
    const operation = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSetId: set.id },
    });
    await setChangeOperationDecision(dmId, campaignId, set.id, operation.id, {
      decision: "EDITED",
      editedPatch: { summary: { to: "DM summary" } },
    });
    await rejectChangeSet(dmId, campaignId, set.id);

    await reopenChangeSet(dmId, campaignId, set.id);

    const reopened = await getReviewChangeSetForUser(dmId, campaignId, set.id);
    expect(reopened).toMatchObject({ status: "PENDING", reviewedById: null });
    expect(reopened?.operations[0]).toMatchObject({
      decision: "EDITED",
      editedPatch: { summary: { to: "DM summary" } },
    });
    await approveChangeSet(dmId, campaignId, set.id);
    await expect(
      prisma.entity.findUniqueOrThrow({ where: { id: entityId } }),
    ).resolves.toMatchObject({
      summary: "DM summary",
      description: "Original description",
    });
  });

  it("refuses to make approved canon pending again", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Approved");
    const baseVersion = await versionOf(entityId);
    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Approved proposal",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: entityId,
          patch: { _baseVersion: { to: baseVersion }, summary: { to: "Applied" } },
        },
      ],
    });
    await acceptAllOperations(set.id);
    await approveChangeSet(dmId, campaignId, set.id);

    await expect(reopenChangeSet(dmId, campaignId, set.id)).rejects.toThrow(
      /can't be reopened/i,
    );
  });
});

describe("review service — review queue enrichment", () => {
  it("attaches current values across entity and crawler fields", async () => {
    const { dmId, campaignId } = await seed();
    const npcId = await createEntity(dmId, campaignId, "Zev");
    const crawlerId = await createEntity(dmId, campaignId, "Carl", EntityType.CRAWLER);
    const npcVersion = await versionOf(npcId);
    const crawlerVersion = await versionOf(crawlerId);

    await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Touch every NPC field",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: npcId,
          patch: {
            _baseVersion: { to: npcVersion },
            type: { to: EntityType.NPC },
            name: { to: "Zev II" },
            summary: { to: "s" },
            description: { to: "d" },
            visibility: { to: Visibility.SHARED_WITH_PLAYERS },
            tags: { to: ["a"] },
            isStub: { to: true },
            data: { to: { extra: 1 } },
            customFields: { to: { threat: "high" } },
          },
        },
      ],
    });
    await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Touch crawler fields",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: crawlerId,
          patch: {
            _baseVersion: { to: crawlerVersion },
            "crawler.level": { to: 50 },
            "crawler.viewCount": { to: "9000" },
          },
        },
      ],
    });

    const queue = await listPendingChangeSetsForUser(dmId, campaignId);
    const npcOp = queue
      .flatMap((cs) => cs.operations)
      .find((op) => op.targetId === npcId);
    expect(npcOp?.currentValues.name).toBe("Zev");
    expect(npcOp?.currentValues.summary).toBe("Original summary");
    expect(npcOp?.currentValues.visibility).toBe(Visibility.DM_ONLY);
    expect(npcOp?.targetEntityType).toBe(EntityType.NPC);

    const crawlerOp = queue
      .flatMap((cs) => cs.operations)
      .find((op) => op.targetId === crawlerId);
    expect(crawlerOp?.currentValues["crawler.level"]).toBe(1);
    expect(crawlerOp?.currentValues["crawler.viewCount"]).toBe("0");
  });
});

describe("review service — entity apply edge cases", () => {
  it("applies a full crawler-field update on approval", async () => {
    const { dmId, campaignId } = await seed();
    const crawlerId = await createEntity(dmId, campaignId, "Carl", EntityType.CRAWLER);
    const baseVersion = await versionOf(crawlerId);

    const set = await createPendingEntityChangeSet(dmId, campaignId, {
      source: "AI",
      title: "Crawler stat sheet rewrite",
      operations: [
        {
          op: "UPDATE_ENTITY",
          targetId: crawlerId,
          patch: {
            _baseVersion: { to: baseVersion },
            name: { to: "Carl the Cat" },
            isStub: { to: false },
            "crawler.realName": { to: "Carl" },
            "crawler.crawlerNo": { to: "4847201" },
            "crawler.level": { to: 12 },
            "crawler.hp": { to: 340 },
            "crawler.mp": { to: 80 },
            "crawler.gold": { to: 999 },
            "crawler.viewCount": { to: "5000000" },
            "crawler.followerCount": { to: "120000" },
            "crawler.favoriteCount": { to: "9000" },
            "crawler.killCount": { to: 42 },
            "crawler.isAlive": { to: true },
            "crawler.currentFloor": { to: 11 },
          },
        },
      ],
    });

    await acceptAllOperations(set.id);
    await approveChangeSet(dmId, campaignId, set.id);

    const entity = await prisma.entity.findUniqueOrThrow({
      where: { id: crawlerId },
      include: { crawler: true },
    });
    expect(entity.name).toBe("Carl the Cat");
    expect(entity.crawler?.level).toBe(12);
    expect(entity.crawler?.followerCount).toBe(BigInt(120000));
    expect(entity.crawler?.killCount).toBe(42);
    expect(entity.crawler?.currentFloor).toBe(11);
  });

  it("rejects an update operation with no target id", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedEntityChangeSet(dmId, campaignId, {
        title: "Targetless update",
        operations: [{ op: "UPDATE_ENTITY", patch: { summary: { to: "x" } } }],
      }),
    ).rejects.toThrow(/Missing entity target/);
  });

  it("rejects a delete operation with no target id", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedEntityChangeSet(dmId, campaignId, {
        title: "Targetless delete",
        operations: [{ op: "DELETE_ENTITY", patch: {} }],
      }),
    ).rejects.toThrow(/Missing entity target/);
  });

  it("rejects a create operation without an entity type", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedEntityChangeSet(dmId, campaignId, {
        title: "Typeless create",
        operations: [{ op: "CREATE_ENTITY", patch: { name: { to: "Nameless" } } }],
      }),
    ).rejects.toThrow(/type is required/);
  });

  it("rejects an update targeting a missing entity", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedEntityChangeSet(dmId, campaignId, {
        title: "Ghost update",
        operations: [
          {
            op: "UPDATE_ENTITY",
            targetId: "missing",
            patch: { _baseVersion: { to: 1 }, summary: { to: "x" } },
          },
        ],
      }),
    ).rejects.toThrow(/Entity not found/);
  });

  it("rejects an update whose base version has drifted", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Drift");
    await expect(
      applyAutoApprovedEntityChangeSet(dmId, campaignId, {
        title: "Mismatched version",
        operations: [
          {
            op: "UPDATE_ENTITY",
            targetId: entityId,
            patch: { _baseVersion: { to: 99 }, summary: { to: "x" } },
          },
        ],
      }),
    ).rejects.toThrow(/changed since/);
  });

  it("rejects an update to a fully locked entity", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "Sealed");
    await prisma.entity.update({ where: { id: entityId }, data: { locked: true } });
    const baseVersion = await versionOf(entityId);
    await expect(
      applyAutoApprovedEntityChangeSet(dmId, campaignId, {
        title: "Blocked",
        operations: [
          {
            op: "UPDATE_ENTITY",
            targetId: entityId,
            patch: { _baseVersion: { to: baseVersion }, summary: { to: "x" } },
          },
        ],
      }),
    ).rejects.toThrow(/locked/);
  });

  it("rejects a delete targeting a missing entity", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedEntityChangeSet(dmId, campaignId, {
        title: "Ghost delete",
        operations: [{ op: "DELETE_ENTITY", targetId: "missing", patch: {} }],
      }),
    ).rejects.toThrow(/Entity not found/);
  });

  it("rejects a delete whose base version has drifted", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "DeleteDrift");
    await expect(
      applyAutoApprovedEntityChangeSet(dmId, campaignId, {
        title: "Stale delete",
        operations: [
          {
            op: "DELETE_ENTITY",
            targetId: entityId,
            patch: { _baseVersion: { to: 99 } },
          },
        ],
      }),
    ).rejects.toThrow(/changed since/);
  });

  it("rejects a delete of a locked entity", async () => {
    const { dmId, campaignId } = await seed();
    const entityId = await createEntity(dmId, campaignId, "PinnedDelete");
    await prisma.entity.update({ where: { id: entityId }, data: { locked: true } });
    await expect(
      applyAutoApprovedEntityChangeSet(dmId, campaignId, {
        title: "Locked delete",
        operations: [{ op: "DELETE_ENTITY", targetId: entityId, patch: {} }],
      }),
    ).rejects.toThrow(/locked/);
  });
});

describe("review service — relationship apply edge cases", () => {
  it("rejects a create with no relationship type", async () => {
    const { dmId, campaignId } = await seed();
    const a = await createEntity(dmId, campaignId, "A");
    const b = await createEntity(dmId, campaignId, "B");
    await expect(
      applyAutoApprovedRelationshipChangeSet(dmId, campaignId, {
        title: "No type",
        operations: [
          {
            op: "CREATE_RELATIONSHIP",
            patch: { sourceId: { to: a }, targetId: { to: b } },
          },
        ],
      }),
    ).rejects.toThrow(/type is required/);
  });

  it("rejects a create missing endpoints", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedRelationshipChangeSet(dmId, campaignId, {
        title: "No endpoints",
        operations: [
          { op: "CREATE_RELATIONSHIP", patch: { type: { to: RelationshipType.ALLIED_WITH } } },
        ],
      }),
    ).rejects.toThrow(/endpoints are required/);
  });

  it("rejects a self-referential edge", async () => {
    const { dmId, campaignId } = await seed();
    const a = await createEntity(dmId, campaignId, "Solo");
    await expect(
      applyAutoApprovedRelationshipChangeSet(dmId, campaignId, {
        title: "Self edge",
        operations: [
          {
            op: "CREATE_RELATIONSHIP",
            patch: {
              type: { to: RelationshipType.ALLIED_WITH },
              sourceId: { to: a },
              targetId: { to: a },
            },
          },
        ],
      }),
    ).rejects.toThrow(/two different entities/);
  });

  it("rejects an edge to a non-canon endpoint", async () => {
    const { dmId, campaignId } = await seed();
    const a = await createEntity(dmId, campaignId, "Real");
    await expect(
      applyAutoApprovedRelationshipChangeSet(dmId, campaignId, {
        title: "Phantom endpoint",
        operations: [
          {
            op: "CREATE_RELATIONSHIP",
            patch: {
              type: { to: RelationshipType.ALLIED_WITH },
              sourceId: { to: a },
              targetId: { to: "missing" },
            },
          },
        ],
      }),
    ).rejects.toThrow(/Entity not found/);
  });

  it("rejects a delete with no target id", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedRelationshipChangeSet(dmId, campaignId, {
        title: "Targetless delete",
        operations: [{ op: "DELETE_RELATIONSHIP", patch: {} }],
      }),
    ).rejects.toThrow(/Missing relationship target/);
  });

  it("rejects a delete targeting a missing edge", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedRelationshipChangeSet(dmId, campaignId, {
        title: "Ghost delete",
        operations: [
          { op: "DELETE_RELATIONSHIP", targetId: "missing", patch: {} },
        ],
      }),
    ).rejects.toThrow(/Relationship not found/);
  });

  it("rejects deleting a locked edge", async () => {
    const { dmId, campaignId } = await seed();
    const a = await createEntity(dmId, campaignId, "Anchor");
    const b = await createEntity(dmId, campaignId, "Bond");
    const created = await applyAutoApprovedRelationshipChangeSet(dmId, campaignId, {
      title: "Bond them",
      operations: [
        {
          op: "CREATE_RELATIONSHIP",
          patch: {
            type: { to: RelationshipType.ALLIED_WITH },
            sourceId: { to: a },
            targetId: { to: b },
          },
        },
      ],
    });
    const relId = created.targetIds[0];
    await prisma.relationship.update({ where: { id: relId }, data: { locked: true } });

    await expect(
      applyAutoApprovedRelationshipChangeSet(dmId, campaignId, {
        title: "Try to remove",
        operations: [{ op: "DELETE_RELATIONSHIP", targetId: relId, patch: {} }],
      }),
    ).rejects.toThrow(/locked/);
  });
});

describe("review service — event apply edge cases", () => {
  it("rejects a create with no title", async () => {
    const { dmId, campaignId } = await seed();
    const actor = await createEntity(dmId, campaignId, "Actor");
    await expect(
      applyAutoApprovedEventChangeSet(dmId, campaignId, {
        title: "wrapper",
        operations: [
          {
            op: "CREATE_EVENT",
            patch: {
              participants: { to: [{ entityId: actor, role: "ACTOR" }] },
            },
          },
        ],
      }),
    ).rejects.toThrow(/title is required/);
  });

  it("rejects a create with no resolvable participants", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedEventChangeSet(dmId, campaignId, {
        title: "wrapper",
        operations: [
          {
            op: "CREATE_EVENT",
            // Mixed junk: not-an-array entries, bad entityId, all dropped.
            patch: {
              title: { to: "Lonely event" },
              participants: {
                to: [42, ["nested"], { role: "ACTOR" }, { entityId: "" }],
              },
            },
          },
        ],
      }),
    ).rejects.toThrow(/at least one participant/);
  });

  it("defaults an unknown participant role to ACTOR and tolerates missing time", async () => {
    const { dmId, campaignId } = await seed();
    const actor = await createEntity(dmId, campaignId, "Hero");
    const created = await applyAutoApprovedEventChangeSet(dmId, campaignId, {
      title: "wrapper",
      operations: [
        {
          op: "CREATE_EVENT",
          patch: {
            title: { to: "Strange happening" },
            participants: { to: [{ entityId: actor, role: "WHATEVER" }] },
          },
        },
      ],
    });
    const participant = await prisma.eventParticipant.findFirstOrThrow({
      where: { eventId: created.targetIds[0] },
    });
    expect(participant.role).toBe(EventParticipantRole.ACTOR);
  });

  it("rejects an update with no target id", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedEventChangeSet(dmId, campaignId, {
        title: "wrapper",
        operations: [
          { op: "UPDATE_EVENT", patch: { status: { to: "ARCHIVED" } } },
        ],
      }),
    ).rejects.toThrow(/Missing event target/);
  });

  it("rejects an update targeting a missing event", async () => {
    const { dmId, campaignId } = await seed();
    await expect(
      applyAutoApprovedEventChangeSet(dmId, campaignId, {
        title: "wrapper",
        operations: [
          {
            op: "UPDATE_EVENT",
            targetId: "missing",
            patch: { status: { to: "ARCHIVED" } },
          },
        ],
      }),
    ).rejects.toThrow(/Event not found/);
  });

  it("applies a non-status event update by bumping the version", async () => {
    const { dmId, campaignId } = await seed();
    const actor = await createEntity(dmId, campaignId, "Star");
    const created = await applyAutoApprovedEventChangeSet(dmId, campaignId, {
      title: "wrapper",
      operations: [
        {
          op: "CREATE_EVENT",
          patch: {
            title: { to: "The premiere" },
            participants: { to: [{ entityId: actor, role: "ACTOR" }] },
          },
        },
      ],
    });
    const eventId = created.targetIds[0];

    await applyAutoApprovedEventChangeSet(dmId, campaignId, {
      title: "wrapper",
      operations: [
        {
          op: "UPDATE_EVENT",
          targetId: eventId,
          patch: { summary: { to: "Re-cut with notes" } },
        },
      ],
    });

    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.version).toBe(2);
    expect(event.status).toBe("CANON");
  });

  it("refuses to update a locked event", async () => {
    const { dmId, campaignId } = await seed();
    const actor = await createEntity(dmId, campaignId, "Fixed");
    const created = await applyAutoApprovedEventChangeSet(dmId, campaignId, {
      title: "wrapper",
      operations: [
        {
          op: "CREATE_EVENT",
          patch: {
            title: { to: "Pinned" },
            participants: { to: [{ entityId: actor, role: "ACTOR" }] },
          },
        },
      ],
    });
    const eventId = created.targetIds[0];
    await prisma.event.update({ where: { id: eventId }, data: { locked: true } });

    await expect(
      applyAutoApprovedEventChangeSet(dmId, campaignId, {
        title: "wrapper",
        operations: [
          {
            op: "UPDATE_EVENT",
            targetId: eventId,
            patch: { status: { to: "ARCHIVED" } },
          },
        ],
      }),
    ).rejects.toThrow(/locked/);
  });
});
