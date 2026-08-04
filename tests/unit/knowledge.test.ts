import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { archiveEntity, createGenericEntity } from "@/server/services/entities";
import { createSession } from "@/server/services/sessions";
import {
  grantEntityKnowledge,
  grantMembershipKnowledge,
  listKnowledgeHeldByEntity,
  listKnowledgeOfEntity,
  listSessionReveals,
  revokeKnowledge,
} from "@/server/services/knowledge";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function makeEntity(userId: string, campaignId: string, name: string) {
  return createGenericEntity(userId, campaignId, {
    type: "NPC" as Parameters<typeof createGenericEntity>[2]["type"],
    name,
    summary: "",
    description: "",
    visibility: "DM_ONLY",
    tags: [],
  });
}

beforeEach(async () => {
  await prisma.knowledgeGrant.deleteMany();
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

describe("grantEntityKnowledge", () => {
  it("reveals an entity to an actor, writes a REVEAL audit row, and projects both directions", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const secretRoom = await makeEntity(dm.id, campaign.id, "The Hidden Vault");
    const npc = await makeEntity(dm.id, campaign.id, "Mordecai");

    const result = await grantEntityKnowledge(dm.id, campaign.id, {
      targetEntityId: secretRoom.id,
      recipientEntityId: npc.id,
      notes: "Overheard the guards.",
    });
    expect(result.created).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { campaignId: campaign.id, action: "REVEAL", targetType: "KNOWLEDGE_GRANT" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.detail as { recipientId?: string }).recipientId).toBe(npc.id);

    // From the target's page: "known to" lists the recipient.
    const knownTo = await listKnowledgeOfEntity(dm.id, campaign.id, secretRoom.id);
    expect(knownTo).toHaveLength(1);
    expect(knownTo[0].entity.id).toBe(npc.id);
    expect(knownTo[0].notes).toBe("Overheard the guards.");

    // From the recipient's page: "knows about" lists the target.
    const knowsAbout = await listKnowledgeHeldByEntity(dm.id, campaign.id, npc.id);
    expect(knowsAbout).toHaveLength(1);
    expect(knowsAbout[0].entity.id).toBe(secretRoom.id);
  });

  it("is idempotent — an identical active grant is a no-op without a second audit row", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const target = await makeEntity(dm.id, campaign.id, "A");
    const recipient = await makeEntity(dm.id, campaign.id, "B");

    const first = await grantEntityKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      recipientEntityId: recipient.id,
    });
    const second = await grantEntityKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      recipientEntityId: recipient.id,
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);

    expect(await prisma.knowledgeGrant.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "REVEAL" } })).toBe(1);
  });

  it("rejects a grant with a blank entity id", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const e = await makeEntity(dm.id, campaign.id, "Real");
    await expect(
      grantEntityKnowledge(dm.id, campaign.id, { targetEntityId: e.id, recipientEntityId: "  " }),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects a self-grant", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const e = await makeEntity(dm.id, campaign.id, "Solo");
    await expect(
      grantEntityKnowledge(dm.id, campaign.id, { targetEntityId: e.id, recipientEntityId: e.id }),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects a grant whose target or recipient is not live canon", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const live = await makeEntity(dm.id, campaign.id, "Live");
    const archived = await makeEntity(dm.id, campaign.id, "Gone");
    await archiveEntity(dm.id, campaign.id, archived.id);

    await expect(
      grantEntityKnowledge(dm.id, campaign.id, {
        targetEntityId: archived.id,
        recipientEntityId: live.id,
      }),
    ).rejects.toThrow(ServiceError);
    await expect(
      grantEntityKnowledge(dm.id, campaign.id, {
        targetEntityId: live.id,
        recipientEntityId: "missing-id",
      }),
    ).rejects.toThrow(ServiceError);
  });

  it("denies a player and a non-member", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const stranger = await makeUser("stranger@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const a = await makeEntity(dm.id, campaign.id, "A");
    const b = await makeEntity(dm.id, campaign.id, "B");

    await expect(
      grantEntityKnowledge(player.id, campaign.id, { targetEntityId: a.id, recipientEntityId: b.id }),
    ).rejects.toThrow(ServiceError);
    await expect(
      grantEntityKnowledge(stranger.id, campaign.id, { targetEntityId: a.id, recipientEntityId: b.id }),
    ).rejects.toThrow(ServiceError);
    // Reads are a DM curation surface: a player/non-member sees nothing (not an
    // error), so a player-visible entity page that triggers these reads stays up.
    await grantEntityKnowledge(dm.id, campaign.id, { targetEntityId: a.id, recipientEntityId: b.id });
    expect(await listKnowledgeOfEntity(player.id, campaign.id, a.id)).toHaveLength(0);
    expect(await listKnowledgeHeldByEntity(player.id, campaign.id, b.id)).toHaveLength(0);
    expect(await listKnowledgeOfEntity(stranger.id, campaign.id, a.id)).toHaveLength(0);
  });

  it("rejects a grant to a non-canon (e.g. pending) entity", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const canon = await makeEntity(dm.id, campaign.id, "Canon");
    const pending = await makeEntity(dm.id, campaign.id, "Pending");
    await prisma.entity.update({ where: { id: pending.id }, data: { status: "PENDING" } });

    await expect(
      grantEntityKnowledge(dm.id, campaign.id, {
        targetEntityId: pending.id,
        recipientEntityId: canon.id,
      }),
    ).rejects.toThrow(ServiceError);
  });
});

describe("revokeKnowledge", () => {
  it("soft-revokes (preserving the row), writes a REVOKE audit row, and drops it from active lists", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const target = await makeEntity(dm.id, campaign.id, "Vault");
    const recipient = await makeEntity(dm.id, campaign.id, "Spy");

    const grant = await grantEntityKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      recipientEntityId: recipient.id,
    });

    const revoked = await revokeKnowledge(dm.id, campaign.id, grant.id);
    expect(revoked.affectedEntityIds).toEqual(
      expect.arrayContaining([target.id, recipient.id]),
    );

    // Row kept for history, but marked revoked and gone from active projections.
    const row = await prisma.knowledgeGrant.findUnique({ where: { id: grant.id } });
    expect(row?.revokedAt).not.toBeNull();
    expect(row?.revokedById).toBe(dm.id);
    expect(await listKnowledgeOfEntity(dm.id, campaign.id, target.id)).toHaveLength(0);
    expect(
      await prisma.auditLog.count({ where: { action: "REVOKE", targetId: grant.id } }),
    ).toBe(1);
  });

  it("rejects revoking a missing or already-revoked grant, and denies a player", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const target = await makeEntity(dm.id, campaign.id, "A");
    const recipient = await makeEntity(dm.id, campaign.id, "B");
    const grant = await grantEntityKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      recipientEntityId: recipient.id,
    });

    await expect(revokeKnowledge(dm.id, campaign.id, "nope")).rejects.toThrow(ServiceError);
    await expect(revokeKnowledge(player.id, campaign.id, grant.id)).rejects.toThrow(ServiceError);

    await revokeKnowledge(dm.id, campaign.id, grant.id);
    // Second revoke fails — it is no longer an active grant.
    await expect(revokeKnowledge(dm.id, campaign.id, grant.id)).rejects.toThrow(ServiceError);
  });
});

describe("active-grant projection", () => {
  it("excludes expired grants and grants whose counterpart entity is archived", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const target = await makeEntity(dm.id, campaign.id, "Vault");
    const liveRecipient = await makeEntity(dm.id, campaign.id, "Live Spy");
    const goneRecipient = await makeEntity(dm.id, campaign.id, "Gone Spy");

    // An expired grant — created directly so we can backdate expiry.
    await prisma.knowledgeGrant.create({
      data: {
        campaignId: campaign.id,
        targetType: "ENTITY",
        targetId: target.id,
        recipientType: "ENTITY",
        recipientId: liveRecipient.id,
        revealedById: dm.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    // A live grant to a recipient we then archive.
    await grantEntityKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      recipientEntityId: goneRecipient.id,
    });
    await archiveEntity(dm.id, campaign.id, goneRecipient.id);

    // Expired grant dropped; archived-recipient grant dropped → nothing active.
    const knownTo = await listKnowledgeOfEntity(dm.id, campaign.id, target.id);
    expect(knownTo).toHaveLength(0);
  });

  it("drops grants whose counterpart entity is no longer canon (e.g. pending)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const target = await makeEntity(dm.id, campaign.id, "Vault");
    const recipient = await makeEntity(dm.id, campaign.id, "Spy");
    await grantEntityKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      recipientEntityId: recipient.id,
    });

    expect(await listKnowledgeOfEntity(dm.id, campaign.id, target.id)).toHaveLength(1);
    await prisma.entity.update({ where: { id: recipient.id }, data: { status: "PENDING" } });
    expect(await listKnowledgeOfEntity(dm.id, campaign.id, target.id)).toHaveLength(0);
  });
});

describe("grantMembershipKnowledge", () => {
  it("reveals an entity to a player membership, writes a REVEAL audit row", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const membership = await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const secret = await makeEntity(dm.id, campaign.id, "The Hidden Vault");

    const result = await grantMembershipKnowledge(dm.id, campaign.id, {
      targetEntityId: secret.id,
      membershipId: membership.id,
      notes: "Told them at the table.",
    });
    expect(result.created).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { campaignId: campaign.id, action: "REVEAL", targetType: "KNOWLEDGE_GRANT" },
    });
    expect((audit?.detail as { recipientType?: string; recipientId?: string }).recipientType).toBe(
      "MEMBERSHIP",
    );
    expect((audit?.detail as { recipientId?: string }).recipientId).toBe(membership.id);

    const row = await prisma.knowledgeGrant.findUnique({ where: { id: result.id } });
    expect(row?.recipientType).toBe("MEMBERSHIP");
    expect(row?.recipientId).toBe(membership.id);
    expect(row?.notes).toBe("Told them at the table.");
  });

  it("is idempotent — an identical active grant is a no-op without a second audit row", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const membership = await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const target = await makeEntity(dm.id, campaign.id, "A");

    const first = await grantMembershipKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      membershipId: membership.id,
    });
    const second = await grantMembershipKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      membershipId: membership.id,
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(await prisma.knowledgeGrant.count()).toBe(1);
  });

  it("rejects a blank entity or membership id", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const membership = await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const target = await makeEntity(dm.id, campaign.id, "A");

    await expect(
      grantMembershipKnowledge(dm.id, campaign.id, { targetEntityId: "  ", membershipId: membership.id }),
    ).rejects.toThrow(ServiceError);
    await expect(
      grantMembershipKnowledge(dm.id, campaign.id, { targetEntityId: target.id, membershipId: "  " }),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects a non-canon target and a membership that isn't a player of this campaign", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const otherPlayer = await makeUser("other@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const otherCampaign = await createCampaign(dm.id, { name: "Other Crawl" });
    const membership = await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const foreignMembership = await prisma.membership.create({
      data: { userId: otherPlayer.id, campaignId: otherCampaign.id, role: Role.PLAYER },
    });
    const coDmMembership = await prisma.membership.create({
      data: { userId: otherPlayer.id, campaignId: campaign.id, role: Role.CO_DM },
    });
    const pending = await makeEntity(dm.id, campaign.id, "Pending");
    await prisma.entity.update({ where: { id: pending.id }, data: { status: "PENDING" } });
    const target = await makeEntity(dm.id, campaign.id, "Live");

    await expect(
      grantMembershipKnowledge(dm.id, campaign.id, {
        targetEntityId: pending.id,
        membershipId: membership.id,
      }),
    ).rejects.toThrow(ServiceError);
    await expect(
      grantMembershipKnowledge(dm.id, campaign.id, {
        targetEntityId: target.id,
        membershipId: foreignMembership.id,
      }),
    ).rejects.toThrow(ServiceError);
    // A CO_DM membership isn't a "player" recipient for this feature.
    await expect(
      grantMembershipKnowledge(dm.id, campaign.id, {
        targetEntityId: target.id,
        membershipId: coDmMembership.id,
      }),
    ).rejects.toThrow(ServiceError);
  });

  it("denies a player caller", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const membership = await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const target = await makeEntity(dm.id, campaign.id, "A");

    await expect(
      grantMembershipKnowledge(player.id, campaign.id, {
        targetEntityId: target.id,
        membershipId: membership.id,
      }),
    ).rejects.toThrow(ServiceError);
  });
});

describe("listSessionReveals", () => {
  it("lists both ENTITY- and MEMBERSHIP-recipient reveals tied to a session, newest first", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const membership = await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const session = await createSession(dm.id, campaign.id, { title: "Session 1" });
    const target = await makeEntity(dm.id, campaign.id, "Vault");
    const npc = await makeEntity(dm.id, campaign.id, "Spy");

    await grantEntityKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      recipientEntityId: npc.id,
      notes: "NPC overhears",
      sourceEventId: session.id,
    });
    await grantMembershipKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      membershipId: membership.id,
      notes: "Told the player",
      sourceEventId: session.id,
    });
    // Not tied to this session — must not appear.
    const otherSession = await createSession(dm.id, campaign.id, { title: "Session 2" });
    await grantEntityKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      recipientEntityId: npc.id,
      sourceEventId: otherSession.id,
    });

    const reveals = await listSessionReveals(dm.id, campaign.id, session.id);
    expect(reveals).toHaveLength(2);
    const membershipReveal = reveals.find((r) => r.recipient.kind === "MEMBERSHIP");
    expect(membershipReveal?.notes).toBe("Told the player");
    if (membershipReveal?.recipient.kind === "MEMBERSHIP") {
      expect(membershipReveal.recipient.userEmail).toBe("player@test.com");
    }
    const entityReveal = reveals.find((r) => r.recipient.kind === "ENTITY");
    expect(entityReveal?.notes).toBe("NPC overhears");
    if (entityReveal?.recipient.kind === "ENTITY") {
      expect(entityReveal.recipient.entity.id).toBe(npc.id);
    }
  });

  it("drops a reveal whose target/entity-recipient is no longer live canon or whose membership was removed, and returns [] for a player/non-member", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const stranger = await makeUser("stranger@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const membership = await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const session = await createSession(dm.id, campaign.id, { title: "Session 1" });
    const target = await makeEntity(dm.id, campaign.id, "Vault");
    const npc = await makeEntity(dm.id, campaign.id, "Spy");

    await grantEntityKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      recipientEntityId: npc.id,
      sourceEventId: session.id,
    });
    await grantMembershipKnowledge(dm.id, campaign.id, {
      targetEntityId: target.id,
      membershipId: membership.id,
      sourceEventId: session.id,
    });

    // Archive the target, archive the entity recipient, and remove the
    // player's membership — covers both the "target no longer canon" and
    // "recipient no longer canon/removed" drop paths.
    await archiveEntity(dm.id, campaign.id, target.id);
    await archiveEntity(dm.id, campaign.id, npc.id);
    await prisma.membership.delete({ where: { id: membership.id } });

    expect(await listSessionReveals(dm.id, campaign.id, session.id)).toHaveLength(0);
    expect(await listSessionReveals(player.id, campaign.id, session.id)).toEqual([]);
    expect(await listSessionReveals(stranger.id, campaign.id, session.id)).toEqual([]);
  });

  it("returns [] for a session with no reveals recorded", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    const session = await createSession(dm.id, campaign.id, { title: "Session 1" });

    expect(await listSessionReveals(dm.id, campaign.id, session.id)).toEqual([]);
  });
});
