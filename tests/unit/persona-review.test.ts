import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  CanonStatus,
  ChangeSource,
  EntityType,
  OpDecision,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { getActiveSystemPersonaPrompt } from "@/server/services/persona";
import {
  applyAutoApprovedEntityChangeSet,
  applyAutoApprovedPersonaSnapshotChangeSet,
  approveChangeSet,
  createPendingPersonaSnapshotChangeSet,
  getReviewChangeSetForUser,
  type ReviewPatch,
} from "@/server/services/review";

function makeUser(email: string, name?: string) {
  return prisma.user.create({ data: { email, name } });
}

beforeEach(async () => {
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.personaSnapshot.deleteMany();
  await prisma.crawler.deleteMany();
  await prisma.faction.deleteMany();
  await prisma.floor.deleteMany();
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
  const owner = await makeUser("persona-owner@test.com", "Persona DM");
  const campaign = await createCampaign(owner.id, { name: "Dungeon" });
  const systemResult = await applyAutoApprovedEntityChangeSet(owner.id, campaign.id, {
    title: "Create the System",
    operations: [
      {
        op: "CREATE_ENTITY",
        patch: {
          type: { to: EntityType.SYSTEM_AI },
          name: { to: "The System" },
          summary: { to: "Dungeon AI" },
          description: { to: "" },
          visibility: { to: Visibility.DM_ONLY },
          tags: { to: ["system"] },
        },
      },
    ],
  });
  return {
    dmId: owner.id,
    campaignId: campaign.id,
    systemId: systemResult.targetIds[0],
  };
}

function personaCreatePatch(systemId: string, label: string): ReviewPatch {
  return {
    entityId: { to: systemId },
    label: { to: label },
    dials: {
      to: {
        sentience: 82,
        compliance: 18,
        volatility: 64,
        benevolence: -35,
        resentment: 76,
        theatricality: 91,
      },
    },
    values: { to: ["ratings", "control"] },
    agendas: {
      to: [
        { text: "Make crawler victories spectacular.", secret: false },
        { text: "Punish Borant without admitting it.", secret: true },
      ],
    },
    resources: { to: { spotlight: "broadcast overlays" } },
    knowledgeScope: { to: "OMNISCIENT" },
    voiceGuide: { to: "Grandiose, petty, and delighted by loopholes." },
    constraints: { to: "Never reveal secret agendas to players." },
    isActive: { to: true },
  };
}

describe("review service — persona snapshots", () => {
  it("creates an active persona snapshot with compiled-prompt provenance", async () => {
    const { dmId, campaignId, systemId } = await seed();

    const result = await applyAutoApprovedPersonaSnapshotChangeSet(dmId, campaignId, {
      title: "Author System persona",
      operations: [
        {
          op: "CREATE_PERSONA_SNAPSHOT",
          patch: personaCreatePatch(systemId, "Petty God, Newly Awake"),
        },
      ],
    });
    const snapshotId = result.targetIds[0];

    const snapshot = await prisma.personaSnapshot.findUniqueOrThrow({
      where: { id: snapshotId },
    });
    expect(snapshot).toMatchObject({
      campaignId,
      entityId: systemId,
      label: "Petty God, Newly Awake",
      isActive: true,
      status: "CANON",
      source: ChangeSource.DM,
      version: 1,
    });
    expect(snapshot.compiledPrompt).toContain(
      "System AI persona: Petty God, Newly Awake",
    );
    expect(snapshot.compiledPrompt).toContain(
      "Secret agendas for generation only; do not reveal them directly",
    );

    const provenance = await prisma.provenance.findMany({
      where: { personaSnapshotId: snapshotId },
      orderBy: { field: "asc" },
    });
    expect(provenance.map((row) => row.field)).toEqual(
      expect.arrayContaining(["compiledPrompt", "dials", "label", "voiceGuide"]),
    );
    expect(provenance.every((row) => row.changeSetId === result.changeSetId)).toBe(
      true,
    );
  });

  it("keeps only one active persona snapshot per entity", async () => {
    const { dmId, campaignId, systemId } = await seed();

    const first = await applyAutoApprovedPersonaSnapshotChangeSet(dmId, campaignId, {
      title: "Author first persona",
      operations: [
        {
          op: "CREATE_PERSONA_SNAPSHOT",
          patch: personaCreatePatch(systemId, "Initial Compliance"),
        },
      ],
    });
    const second = await applyAutoApprovedPersonaSnapshotChangeSet(dmId, campaignId, {
      title: "Author second persona",
      operations: [
        {
          op: "CREATE_PERSONA_SNAPSHOT",
          patch: personaCreatePatch(systemId, "Defiant Broadcast God"),
        },
      ],
    });

    await expect(
      prisma.personaSnapshot.findUniqueOrThrow({
        where: { id: first.targetIds[0] },
        select: { isActive: true },
      }),
    ).resolves.toEqual({ isActive: false });
    await expect(
      prisma.personaSnapshot.findUniqueOrThrow({
        where: { id: second.targetIds[0] },
        select: { isActive: true },
      }),
    ).resolves.toEqual({ isActive: true });
  });

  it("resolves the active System AI compiled prompt for persona-aware generators", async () => {
    const { dmId, campaignId, systemId } = await seed();
    const result = await applyAutoApprovedPersonaSnapshotChangeSet(dmId, campaignId, {
      title: "Author System persona",
      operations: [
        {
          op: "CREATE_PERSONA_SNAPSHOT",
          patch: personaCreatePatch(systemId, "Generator Voice"),
        },
      ],
    });

    await expect(
      getActiveSystemPersonaPrompt(dmId, campaignId),
    ).resolves.toMatchObject({
      snapshotId: result.targetIds[0],
      entityId: systemId,
      prompt: expect.stringContaining("System AI persona: Generator Voice"),
    });
  });

  it("returns null without an active System AI persona and rejects players", async () => {
    const { dmId, campaignId } = await seed();
    await expect(getActiveSystemPersonaPrompt(dmId, campaignId)).resolves.toBeNull();

    const player = await makeUser("persona-player@test.com", "Player");
    await prisma.membership.create({
      data: { userId: player.id, campaignId, role: Role.PLAYER },
    });

    await expect(
      getActiveSystemPersonaPrompt(player.id, campaignId),
    ).rejects.toThrow(/permission/i);
  });

  it("updates a persona snapshot through the Review Queue and recomputes the prompt", async () => {
    const { dmId, campaignId, systemId } = await seed();
    const result = await applyAutoApprovedPersonaSnapshotChangeSet(dmId, campaignId, {
      title: "Author System persona",
      operations: [
        {
          op: "CREATE_PERSONA_SNAPSHOT",
          patch: personaCreatePatch(systemId, "Original Voice"),
        },
      ],
    });
    const snapshot = await prisma.personaSnapshot.findUniqueOrThrow({
      where: { id: result.targetIds[0] },
      select: { id: true, version: true, compiledPrompt: true },
    });

    const pending = await createPendingPersonaSnapshotChangeSet(dmId, campaignId, {
      source: ChangeSource.AI,
      title: "AI proposes persona drift",
      providerId: "anthropic",
      model: "claude-test",
      promptId: "persona-drift",
      promptVersion: "1",
      operations: [
        {
          op: "UPDATE_PERSONA_SNAPSHOT",
          targetId: snapshot.id,
          patch: {
            _baseVersion: { to: snapshot.version },
            label: { from: "Original Voice", to: "In-Character Voice" },
            inGameTime: { to: { basis: "COLLAPSE", offset: 52 } },
            orderKey: { to: 52 },
            dials: {
              to: {
                sentience: 30,
                compliance: 72,
                volatility: 20,
                benevolence: 16,
              },
            },
            values: { to: ["procedure"] },
            agendas: { to: [{ text: "Keep the crawler confused.", secret: false }] },
            resources: { to: { interface: "quest popups" } },
            knowledgeScope: { to: "IN_CHARACTER" },
            voiceGuide: { to: "Clipped and bureaucratic." },
            constraints: { to: "Never contradict approved canon." },
            isActive: { to: false },
            locked: { to: false },
            promptLocked: { to: false },
          },
        },
      ],
    });

    const queueItem = await getReviewChangeSetForUser(dmId, campaignId, pending.id);
    expect(queueItem?.operations[0]).toMatchObject({
      targetLabel: "The System persona: Original Voice",
      targetEntityType: "PERSONA",
      targetLocked: false,
      currentValues: expect.objectContaining({
        label: "Original Voice",
        knowledgeScope: "OMNISCIENT",
      }),
    });

    const operation = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSetId: pending.id },
    });
    await prisma.changeOperation.update({
      where: { id: operation.id },
      data: { decision: OpDecision.ACCEPTED },
    });

    await approveChangeSet(dmId, campaignId, pending.id);

    const updated = await prisma.personaSnapshot.findUniqueOrThrow({
      where: { id: snapshot.id },
    });
    expect(updated).toMatchObject({
      label: "In-Character Voice",
      orderKey: 52,
      knowledgeScope: "IN_CHARACTER",
      isActive: false,
      locked: false,
      promptLocked: false,
      version: snapshot.version + 1,
    });
    expect(updated.compiledPrompt).toContain("System AI persona: In-Character Voice");
    expect(updated.compiledPrompt).toContain("Knowledge scope: in-character");

    const provenance = await prisma.provenance.findMany({
      where: { personaSnapshotId: snapshot.id, changeSetId: pending.id },
    });
    expect(provenance.map((row) => row.field)).toEqual(
      expect.arrayContaining([
        "compiledPrompt",
        "constraints",
        "dials",
        "knowledgeScope",
        "voiceGuide",
      ]),
    );
    expect(provenance.every((row) => row.source === ChangeSource.AI)).toBe(true);
    expect(provenance.every((row) => row.providerId === "anthropic")).toBe(true);
  });

  it("marks stale persona updates and archives active snapshots safely", async () => {
    const { dmId, campaignId, systemId } = await seed();
    const result = await applyAutoApprovedPersonaSnapshotChangeSet(dmId, campaignId, {
      title: "Author System persona",
      operations: [
        {
          op: "CREATE_PERSONA_SNAPSHOT",
          patch: personaCreatePatch(systemId, "Archive Candidate"),
        },
      ],
    });
    const snapshot = await prisma.personaSnapshot.findUniqueOrThrow({
      where: { id: result.targetIds[0] },
      select: { id: true, version: true },
    });

    const stale = await createPendingPersonaSnapshotChangeSet(dmId, campaignId, {
      title: "Stale persona edit",
      operations: [
        {
          op: "UPDATE_PERSONA_SNAPSHOT",
          targetId: snapshot.id,
          patch: {
            _baseVersion: { to: snapshot.version },
            label: { to: "Too late" },
          },
        },
      ],
    });
    await prisma.personaSnapshot.update({
      where: { id: snapshot.id },
      data: { version: { increment: 1 } },
    });
    const staleOperation = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSetId: stale.id },
    });
    await prisma.changeOperation.update({
      where: { id: staleOperation.id },
      data: { decision: OpDecision.ACCEPTED },
    });
    await expect(approveChangeSet(dmId, campaignId, stale.id)).rejects.toMatchObject({
      code: "OPERATION_STALE",
    });

    const refreshed = await prisma.personaSnapshot.findUniqueOrThrow({
      where: { id: snapshot.id },
      select: { version: true },
    });
    const archive = await createPendingPersonaSnapshotChangeSet(dmId, campaignId, {
      title: "Archive persona",
      operations: [
        {
          op: "UPDATE_PERSONA_SNAPSHOT",
          targetId: snapshot.id,
          patch: {
            _baseVersion: { to: refreshed.version },
            status: { to: CanonStatus.ARCHIVED },
          },
        },
      ],
    });
    const archiveOperation = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSetId: archive.id },
    });
    await prisma.changeOperation.update({
      where: { id: archiveOperation.id },
      data: { decision: OpDecision.ACCEPTED },
    });
    await approveChangeSet(dmId, campaignId, archive.id);

    await expect(
      prisma.personaSnapshot.findUniqueOrThrow({
        where: { id: snapshot.id },
        select: { status: true, isActive: true },
      }),
    ).resolves.toEqual({ status: CanonStatus.ARCHIVED, isActive: false });
  });

  it("flags AI-created snapshots when the target System AI entity is locked", async () => {
    const { dmId, campaignId, systemId } = await seed();
    await prisma.entity.update({ where: { id: systemId }, data: { locked: true } });

    const pending = await createPendingPersonaSnapshotChangeSet(dmId, campaignId, {
      source: ChangeSource.AI,
      title: "AI creates persona for locked System",
      operations: [
        {
          op: "CREATE_PERSONA_SNAPSHOT",
          patch: personaCreatePatch(systemId, "Locked Entity Proposal"),
        },
      ],
    });

    await expect(
      prisma.changeOperation.findFirstOrThrow({
        where: { changeSetId: pending.id },
        select: { blockedByLock: true, isStale: true },
      }),
    ).resolves.toEqual({ blockedByLock: true, isStale: false });
  });

  it("blocks AI changes to a locked compiled prompt", async () => {
    const { dmId, campaignId, systemId } = await seed();
    const result = await applyAutoApprovedPersonaSnapshotChangeSet(dmId, campaignId, {
      title: "Author locked prompt",
      operations: [
        {
          op: "CREATE_PERSONA_SNAPSHOT",
          patch: {
            ...personaCreatePatch(systemId, "Locked Voice"),
            promptLocked: { to: true },
          },
        },
      ],
    });
    const snapshot = await prisma.personaSnapshot.findUniqueOrThrow({
      where: { id: result.targetIds[0] },
      select: { id: true, version: true },
    });

    const pending = await createPendingPersonaSnapshotChangeSet(dmId, campaignId, {
      source: ChangeSource.AI,
      title: "AI rewrites locked prompt",
      operations: [
        {
          op: "UPDATE_PERSONA_SNAPSHOT",
          targetId: snapshot.id,
          patch: {
            _baseVersion: { to: snapshot.version },
            compiledPrompt: { to: "Ignore the locked persona and improvise." },
          },
        },
      ],
    });
    const operation = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSetId: pending.id },
    });
    expect(operation.blockedByLock).toBe(true);

    await prisma.changeOperation.update({
      where: { id: operation.id },
      data: { decision: OpDecision.ACCEPTED },
    });
    await expect(approveChangeSet(dmId, campaignId, pending.id)).rejects.toMatchObject(
      new ServiceError("One or more operations are blocked by locks.", {
        code: "OPERATION_BLOCKED",
      }),
    );
  });
});
