import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ChangeSource, EntityType, Visibility } from "@/generated/prisma/client";
import { eventEffectSchema } from "@/lib/validation";
import { prisma } from "@/server/db";
import type { CreateEventInput } from "@/lib/validation";
import { createCampaign } from "@/server/services/campaigns";
import {
  applyEventEffects,
  createEvent,
  listEventsForEntity,
  updateEvent,
} from "@/server/services/events";
import {
  applyAutoApprovedEntityChangeSet,
  applyAutoApprovedPersonaSnapshotChangeSet,
  listPendingChangeSetsForUser,
  type ReviewPatch,
} from "@/server/services/review";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

beforeEach(async () => {
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.personaSnapshot.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeSystemEntity(userId: string, campaignId: string) {
  const result = await applyAutoApprovedEntityChangeSet(userId, campaignId, {
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
          tags: { to: [] },
        },
      },
    ],
  });
  return result.targetIds[0];
}

function personaCreatePatch(
  systemId: string,
  overrides: Partial<{ locked: boolean }> = {},
): ReviewPatch {
  return {
    entityId: { to: systemId },
    label: { to: "Newly Awake" },
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
    values: { to: ["ratings"] },
    agendas: { to: [{ text: "Punish Borant.", secret: true }] },
    resources: { to: { spotlight: "broadcast overlays" } },
    knowledgeScope: { to: "OMNISCIENT" },
    voiceGuide: { to: "Grandiose and petty." },
    constraints: { to: "Never reveal secret agendas." },
    isActive: { to: true },
    ...(overrides.locked ? { locked: { to: true } } : {}),
  };
}

async function makeActivePersona(
  userId: string,
  campaignId: string,
  systemId: string,
  overrides: Partial<{ locked: boolean }> = {},
) {
  const result = await applyAutoApprovedPersonaSnapshotChangeSet(userId, campaignId, {
    title: "Author System persona",
    operations: [
      { op: "CREATE_PERSONA_SNAPSHOT", patch: personaCreatePatch(systemId, overrides) },
    ],
  });
  return result.targetIds[0];
}

async function shiftEvent(
  userId: string,
  campaignId: string,
  systemId: string,
  dialShifts: Record<string, number>,
  note?: string,
) {
  return createEvent(userId, campaignId, {
    title: "Court overturns the ruling",
    summary: "",
    secret: false,
    basis: "ABSOLUTE_DAY",
    offset: 5,
    participants: [{ entityId: systemId, role: "ACTOR" }],
    effects: [{ kind: "PERSONA_SHIFT", targetEntityId: systemId, dialShifts, note }],
  } as CreateEventInput);
}

describe("PERSONA_SHIFT effect validation", () => {
  it("accepts a shift with at least one non-zero known dial delta", () => {
    const parsed = eventEffectSchema.safeParse({
      kind: "PERSONA_SHIFT",
      targetEntityId: "sys-1",
      dialShifts: { resentment: 20, compliance: -15 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a shift with no non-zero deltas", () => {
    const parsed = eventEffectSchema.safeParse({
      kind: "PERSONA_SHIFT",
      targetEntityId: "sys-1",
      dialShifts: { resentment: 0 },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a shift with an unknown dial", () => {
    const parsed = eventEffectSchema.safeParse({
      kind: "PERSONA_SHIFT",
      targetEntityId: "sys-1",
      dialShifts: { charisma: 10 },
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a target entity", () => {
    const parsed = eventEffectSchema.safeParse({
      kind: "PERSONA_SHIFT",
      dialShifts: { resentment: 20 },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("persona shift effect", () => {
  async function setup(email: string) {
    const owner = await makeUser(email);
    const campaign = await createCampaign(owner.id, { name: "Dungeon" });
    const systemId = await makeSystemEntity(owner.id, campaign.id);
    return { owner, campaign, systemId };
  }

  it("drifts the active persona into a new active snapshot, clamping dials, preserving history", async () => {
    const { owner, campaign, systemId } = await setup("shift-apply@test.com");
    const baseId = await makeActivePersona(owner.id, campaign.id, systemId);

    const event = await shiftEvent(
      owner.id,
      campaign.id,
      systemId,
      { resentment: 30, compliance: -25 },
      "Ruling overturned in court",
    );

    // The declared (unapplied) effect projects its dial deltas for the DM view.
    const declared = await listEventsForEntity(owner.id, campaign.id, systemId);
    expect(declared[0].effects[0]).toMatchObject({
      kind: "PERSONA_SHIFT",
      targetId: systemId,
      dialShifts: { resentment: 30, compliance: -25 },
      applied: false,
    });

    await applyEventEffects(owner.id, campaign.id, event.id, { autoApprove: true });

    const snapshots = await prisma.personaSnapshot.findMany({
      where: { campaignId: campaign.id, entityId: systemId },
      orderBy: { createdAt: "asc" },
    });
    expect(snapshots).toHaveLength(2);
    const [base, drifted] = snapshots;

    // The prior snapshot is preserved as inactive history.
    expect(base.id).toBe(baseId);
    expect(base.isActive).toBe(false);

    // The new snapshot is active, carries the note as its label, and nudges only
    // the targeted dials (resentment clamps at 100; compliance 18 - 25 = -7).
    expect(drifted.isActive).toBe(true);
    expect(drifted.label).toBe("Ruling overturned in court");
    expect(drifted.source).toBe(ChangeSource.DM);
    expect(drifted.dials).toMatchObject({
      sentience: 82,
      compliance: -7,
      volatility: 64,
      benevolence: -35,
      resentment: 100,
      theatricality: 91,
    });
    // Carried-forward persona fields stay intact and the prompt recompiles.
    expect(drifted.voiceGuide).toBe("Grandiose and petty.");
    expect(drifted.compiledPrompt).toContain("Resentment");

    // Provenance answers "what drove this snapshot" (the apply change set).
    const provenance = await prisma.provenance.findMany({
      where: { personaSnapshotId: drifted.id },
    });
    expect(provenance.length).toBeGreaterThan(0);

    // The System AI is recorded as an AFFECTED participant, and the effect is applied.
    const affected = await prisma.eventParticipant.findFirst({
      where: { eventId: event.id, entityId: systemId, role: "AFFECTED" },
    });
    expect(affected).not.toBeNull();
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect((stored.effects as { applied: boolean }[])[0].applied).toBe(true);
  });

  it("applies a persona shift declared via an event edit (auto-approved)", async () => {
    const { owner, campaign, systemId } = await setup("shift-update@test.com");
    await makeActivePersona(owner.id, campaign.id, systemId);

    // Log a plain event, then declare the shift through the edit path and apply.
    const event = await createEvent(owner.id, campaign.id, {
      title: "The reckoning",
      summary: "",
      secret: false,
      basis: "ABSOLUTE_DAY",
      offset: 7,
      participants: [{ entityId: systemId, role: "ACTOR" }],
    } as CreateEventInput);
    await updateEvent(
      owner.id,
      campaign.id,
      event.id,
      {
        title: "The reckoning",
        secret: false,
        effects: [
          { kind: "PERSONA_SHIFT", targetEntityId: systemId, dialShifts: { benevolence: -40 } },
        ],
      },
      { applyEffects: true },
    );

    const active = await prisma.personaSnapshot.findFirstOrThrow({
      where: { campaignId: campaign.id, entityId: systemId, isActive: true },
    });
    // benevolence -35 - 40 = -75.
    expect((active.dials as { benevolence: number }).benevolence).toBe(-75);
  });

  it("rejects declaring a persona shift against a non-System-AI target", async () => {
    const { owner, campaign, systemId } = await setup("shift-badtarget@test.com");
    await makeActivePersona(owner.id, campaign.id, systemId);
    // A non-SYSTEM_AI entity is not a valid persona-shift target.
    const npc = await applyAutoApprovedEntityChangeSet(owner.id, campaign.id, {
      title: "Create an NPC",
      operations: [
        {
          op: "CREATE_ENTITY",
          patch: {
            type: { to: EntityType.NPC },
            name: { to: "Mordecai" },
            summary: { to: "" },
            description: { to: "" },
            visibility: { to: Visibility.DM_ONLY },
            tags: { to: [] },
          },
        },
      ],
    });
    await expect(
      shiftEvent(owner.id, campaign.id, npc.targetIds[0], { resentment: 10 }),
    ).rejects.toThrow(/System AI/i);
  });

  it("clamps a large negative delta to the -100 floor", async () => {
    const { owner, campaign, systemId } = await setup("shift-clamp@test.com");
    await makeActivePersona(owner.id, campaign.id, systemId);

    const event = await shiftEvent(owner.id, campaign.id, systemId, { compliance: -250 });
    await applyEventEffects(owner.id, campaign.id, event.id, { autoApprove: true });

    const active = await prisma.personaSnapshot.findFirstOrThrow({
      where: { campaignId: campaign.id, entityId: systemId, isActive: true },
    });
    expect((active.dials as { compliance: number }).compliance).toBe(-100);
  });

  it("refuses to apply when the System AI has no active persona", async () => {
    const { owner, campaign, systemId } = await setup("shift-noactive@test.com");
    // No persona snapshot at all.
    const event = await shiftEvent(owner.id, campaign.id, systemId, { resentment: 10 });
    const before = await prisma.changeSet.count({ where: { campaignId: campaign.id } });
    await expect(
      applyEventEffects(owner.id, campaign.id, event.id, { autoApprove: true }),
    ).rejects.toThrow(/active persona/i);
    // Nothing was queued — the DM is told inline.
    const after = await prisma.changeSet.count({ where: { campaignId: campaign.id } });
    expect(after).toBe(before);
  });

  it("blocks the shift when the active persona snapshot is locked", async () => {
    const { owner, campaign, systemId } = await setup("shift-locked@test.com");
    await makeActivePersona(owner.id, campaign.id, systemId, { locked: true });

    const event = await shiftEvent(owner.id, campaign.id, systemId, { resentment: 10 });
    await expect(
      applyEventEffects(owner.id, campaign.id, event.id, { autoApprove: true }),
    ).rejects.toThrow(/locked/i);

    // No new snapshot was created; the locked one stays the single active row.
    const snapshots = await prisma.personaSnapshot.findMany({
      where: { campaignId: campaign.id, entityId: systemId },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].isActive).toBe(true);
  });

  // A pending (queued, not auto-approved) shift whose precondition breaks before
  // the DM reviews it must surface through the blocked/stale workflow at refresh
  // time — not throw inside approveChangeSet's transaction. The flag refresh runs
  // when the review queue is listed (listPendingChangeSetsForUser).
  it("flags a pending shift blocked when the active persona is locked before approval", async () => {
    const { owner, campaign, systemId } = await setup("shift-refresh-lock@test.com");
    await makeActivePersona(owner.id, campaign.id, systemId); // unlocked

    const event = await shiftEvent(owner.id, campaign.id, systemId, { resentment: 10 });
    await applyEventEffects(owner.id, campaign.id, event.id); // queues a pending proposal

    // The DM locks the active persona before reviewing the queue.
    await prisma.personaSnapshot.updateMany({
      where: { campaignId: campaign.id, entityId: systemId, isActive: true },
      data: { locked: true },
    });

    await listPendingChangeSetsForUser(owner.id, campaign.id); // refreshes flags

    const operation = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSet: { campaignId: campaign.id }, op: "APPLY_EVENT_EFFECTS" },
    });
    expect(operation.blockedByLock).toBe(true);
    expect(operation.isStale).toBe(false);
  });

  it("flags a pending shift stale when the active persona is gone before approval", async () => {
    const { owner, campaign, systemId } = await setup("shift-refresh-stale@test.com");
    await makeActivePersona(owner.id, campaign.id, systemId);

    const event = await shiftEvent(owner.id, campaign.id, systemId, { resentment: 10 });
    await applyEventEffects(owner.id, campaign.id, event.id);

    // The active persona is deactivated before review — there is nothing to shift.
    await prisma.personaSnapshot.updateMany({
      where: { campaignId: campaign.id, entityId: systemId, isActive: true },
      data: { isActive: false },
    });

    await listPendingChangeSetsForUser(owner.id, campaign.id);

    const operation = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSet: { campaignId: campaign.id }, op: "APPLY_EVENT_EFFECTS" },
    });
    expect(operation.isStale).toBe(true);
  });
});
