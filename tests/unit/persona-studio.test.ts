import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { EntityType, Role, Visibility } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import type { PersonaSnapshotInput } from "@/lib/validation";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { applyAutoApprovedEntityChangeSet } from "@/server/services/review";
import {
  activatePersonaSnapshot,
  createPersonaSnapshot,
  getPersonaStudio,
  setPersonaPromptLock,
  updatePersonaSnapshot,
} from "@/server/services/persona";

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

async function makeEntity(
  dmId: string,
  campaignId: string,
  type: EntityType,
  name: string,
) {
  const result = await applyAutoApprovedEntityChangeSet(dmId, campaignId, {
    title: `Create ${name}`,
    operations: [
      {
        op: "CREATE_ENTITY",
        patch: {
          type: { to: type },
          name: { to: name },
          summary: { to: "" },
          description: { to: "" },
          visibility: { to: Visibility.DM_ONLY },
          tags: { to: [] },
        },
      },
    ],
  });
  return result.targetIds[0];
}

async function seed() {
  const owner = await makeUser("studio-owner@test.com", "Studio DM");
  const campaign = await createCampaign(owner.id, { name: "Dungeon" });
  const systemId = await makeEntity(owner.id, campaign.id, EntityType.SYSTEM_AI, "The System");
  return { dmId: owner.id, campaignId: campaign.id, systemId };
}

function input(over: Partial<PersonaSnapshotInput> = {}): PersonaSnapshotInput {
  return {
    label: "Petty God",
    dials: { sentience: 82, compliance: 18, benevolence: -35 },
    values: ["ratings", "control"],
    overtAgendas: ["Make victories spectacular."],
    secretAgendas: ["Punish Borant."],
    resources: [{ key: "spotlight", value: "broadcast overlays" }],
    knowledgeScope: "OMNISCIENT",
    voiceGuide: "Grandiose and petty.",
    constraints: "Never reveal secret agendas.",
    isActive: true,
    ...over,
  };
}

describe("persona studio service", () => {
  it("returns an empty studio when no System AI entity exists", async () => {
    const owner = await makeUser("empty@test.com");
    const campaign = await createCampaign(owner.id, { name: "Empty" });
    const studio = await getPersonaStudio(owner.id, campaign.id);
    expect(studio).toEqual({
      entities: [],
      selectedEntityId: null,
      snapshots: [],
      activeSnapshotId: null,
    });
  });

  it("creates a snapshot and surfaces it through the studio with provenance origin", async () => {
    const { dmId, campaignId, systemId } = await seed();
    const { snapshotId, changeSetId } = await createPersonaSnapshot(
      dmId,
      campaignId,
      systemId,
      input({ label: "Newly Awake" }),
    );

    const studio = await getPersonaStudio(dmId, campaignId);
    expect(studio.entities).toEqual([{ id: systemId, name: "The System" }]);
    expect(studio.selectedEntityId).toBe(systemId);
    expect(studio.activeSnapshotId).toBe(snapshotId);
    expect(studio.snapshots).toHaveLength(1);

    const view = studio.snapshots[0];
    expect(view).toMatchObject({
      id: snapshotId,
      label: "Newly Awake",
      overtAgendas: ["Make victories spectacular."],
      secretAgendas: ["Punish Borant."],
      values: ["ratings", "control"],
      resources: [{ key: "spotlight", value: "broadcast overlays" }],
      knowledgeScope: "OMNISCIENT",
      isActive: true,
      promptLocked: false,
      originChangeSetId: changeSetId,
    });
    expect(view.dials).toMatchObject({ sentience: 82, benevolence: -35 });
    expect(view.compiledPrompt).toContain("System AI persona: Newly Awake");
    expect(view.compiledPrompt).toContain("Punish Borant.");
  });

  it("rejects authoring against a non-System-AI entity", async () => {
    const { dmId, campaignId } = await seed();
    const npcId = await makeEntity(dmId, campaignId, EntityType.NPC, "Mordecai");
    await expect(
      createPersonaSnapshot(dmId, campaignId, npcId, input()),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects players from the studio", async () => {
    const { campaignId } = await seed();
    const player = await makeUser("studio-player@test.com");
    await prisma.membership.create({
      data: { userId: player.id, campaignId, role: Role.PLAYER },
    });
    await expect(getPersonaStudio(player.id, campaignId)).rejects.toThrow(/permission/i);
  });

  it("updates a snapshot, recompiling the stored prompt", async () => {
    const { dmId, campaignId, systemId } = await seed();
    const { snapshotId } = await createPersonaSnapshot(dmId, campaignId, systemId, input());

    await updatePersonaSnapshot(dmId, campaignId, snapshotId, 1, input({
      label: "In-Character Voice",
      knowledgeScope: "IN_CHARACTER",
    }));

    const updated = await prisma.personaSnapshot.findUniqueOrThrow({
      where: { id: snapshotId },
    });
    expect(updated.label).toBe("In-Character Voice");
    expect(updated.version).toBe(2);
    expect(updated.compiledPrompt).toContain("Knowledge scope: in-character");
  });

  it("toggles the compiled-prompt lock", async () => {
    const { dmId, campaignId, systemId } = await seed();
    const { snapshotId } = await createPersonaSnapshot(dmId, campaignId, systemId, input());

    await setPersonaPromptLock(dmId, campaignId, snapshotId, 1, true);
    await expect(
      prisma.personaSnapshot.findUniqueOrThrow({
        where: { id: snapshotId },
        select: { promptLocked: true },
      }),
    ).resolves.toEqual({ promptLocked: true });

    await setPersonaPromptLock(dmId, campaignId, snapshotId, 2, false);
    await expect(
      prisma.personaSnapshot.findUniqueOrThrow({
        where: { id: snapshotId },
        select: { promptLocked: true },
      }),
    ).resolves.toEqual({ promptLocked: false });
  });

  it("activates an inactive snapshot and deactivates the prior active one", async () => {
    const { dmId, campaignId, systemId } = await seed();
    const first = await createPersonaSnapshot(dmId, campaignId, systemId, input({ label: "A" }));
    const second = await createPersonaSnapshot(
      dmId,
      campaignId,
      systemId,
      input({ label: "B", isActive: false }),
    );

    await activatePersonaSnapshot(dmId, campaignId, second.snapshotId, 1);

    const studio = await getPersonaStudio(dmId, campaignId);
    expect(studio.activeSnapshotId).toBe(second.snapshotId);
    const firstRow = await prisma.personaSnapshot.findUniqueOrThrow({
      where: { id: first.snapshotId },
      select: { isActive: true },
    });
    expect(firstRow.isActive).toBe(false);
    // Newest-first ordering: B was created last.
    expect(studio.snapshots[0].id).toBe(second.snapshotId);
  });
});
