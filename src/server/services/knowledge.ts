import {
  CanonStatus,
  KnowledgeRecipientType,
  KnowledgeTargetType,
  Role,
} from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";

// Knowledge / reveal grants (fog of war, M3 — docs/09-data-schema.md, roadmap
// M3). A grant records that an *actor entity* (recipient) knows about a *target*
// (here: another entity) without that target being campaign-wide player-visible.
// Reveals/revokes are deliberate, audited DM actions (AuditLog REVEAL / REVOKE) —
// not content change sets — exactly like locks. Revoke is soft (revokedAt set) so
// the reveal history is preserved; a grant is "active" when it is not revoked and
// has not expired.
//
// This M3 slice wires the foundation: ENTITY→ENTITY grants ("actor X knows about
// entity Y"), which the DM curates on the entity detail page. The schema already
// supports ENTITY_FIELD / RELATIONSHIP / EVENT / FACT targets and MEMBERSHIP
// recipients for the M7 player "known world" projection and M11 agent fog-of-war;
// those consumers wire in later. Reads here are DM-facing (the entity console).

async function getMembership(userId: string, campaignId: string) {
  return prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
}

async function assertCampaignDm(userId: string, campaignId: string) {
  const membership = await getMembership(userId, campaignId);
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to edit this campaign.");
  }
  return membership;
}

// Knowledge grants are a DM curation surface. A player (or non-member) sees none
// — the reads return [] rather than throwing, so a player-visible entity page
// (which also renders this page path) stays readable instead of erroring.
async function isCampaignDm(userId: string, campaignId: string) {
  const membership = await getMembership(userId, campaignId);
  return !!membership && membership.role !== Role.PLAYER;
}

const knownEntitySelect = {
  id: true,
  name: true,
  type: true,
} as const;

export type KnowledgeEntityRef = {
  id: string;
  name: string;
  type: string;
};

// One active grant, projected for a panel. `entity` is the *counterpart* of the
// viewed entity: the recipient (for "known to") or the target (for "knows about").
export type KnowledgeGrantView = {
  id: string;
  entity: KnowledgeEntityRef;
  notes: string | null;
  revealedAt: Date;
};

// True when a grant row is currently in force (not revoked, not expired).
function activeGrantWhere(now: Date) {
  return {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

// A reveal endpoint must be *live canon* — not a DRAFT/PENDING/REJECTED row that
// could later disappear, leaving a grant pointing at non-canon material.
async function liveCanonEntity(campaignId: string, entityId: string) {
  return prisma.entity.findFirst({
    where: { id: entityId, campaignId, status: CanonStatus.CANON },
    select: knownEntitySelect,
  });
}

// Reveal entity `targetEntityId` to actor entity `recipientEntityId`. Both must be
// live canon in the campaign; a self-grant is rejected; an identical active grant
// is a no-op (returned as-is, no duplicate audit row).
export async function grantEntityKnowledge(
  userId: string,
  campaignId: string,
  input: { targetEntityId: string; recipientEntityId: string; notes?: string | null },
) {
  await assertCampaignDm(userId, campaignId);

  const targetEntityId = input.targetEntityId.trim();
  const recipientEntityId = input.recipientEntityId.trim();
  if (!targetEntityId || !recipientEntityId) {
    throw new ServiceError("Both entities are required.");
  }
  if (targetEntityId === recipientEntityId) {
    throw new ServiceError("An entity can't be granted knowledge of itself.");
  }

  const [target, recipient] = await Promise.all([
    liveCanonEntity(campaignId, targetEntityId),
    liveCanonEntity(campaignId, recipientEntityId),
  ]);
  if (!target) throw new ServiceError("The revealed entity is not live canon in this campaign.");
  if (!recipient) throw new ServiceError("The recipient entity is not live canon in this campaign.");

  const notes = input.notes?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.knowledgeGrant.findFirst({
      where: {
        campaignId,
        targetType: KnowledgeTargetType.ENTITY,
        targetId: targetEntityId,
        recipientType: KnowledgeRecipientType.ENTITY,
        recipientId: recipientEntityId,
        ...activeGrantWhere(new Date()),
      },
      select: { id: true },
    });
    if (existing) {
      return { id: existing.id, created: false, affectedEntityIds: [targetEntityId, recipientEntityId] };
    }

    const grant = await tx.knowledgeGrant.create({
      data: {
        campaignId,
        targetType: KnowledgeTargetType.ENTITY,
        targetId: targetEntityId,
        recipientType: KnowledgeRecipientType.ENTITY,
        recipientId: recipientEntityId,
        revealedById: userId,
        notes,
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "REVEAL",
        targetType: "KNOWLEDGE_GRANT",
        targetId: grant.id,
        detail: {
          targetType: KnowledgeTargetType.ENTITY,
          targetId: targetEntityId,
          recipientType: KnowledgeRecipientType.ENTITY,
          recipientId: recipientEntityId,
          notes,
        },
      },
    });

    return { id: grant.id, created: true, affectedEntityIds: [targetEntityId, recipientEntityId] };
  });
}

// Soft-revoke an active grant (preserves reveal history). Returns the affected
// entity ids so the caller can revalidate both endpoints' pages.
export async function revokeKnowledge(userId: string, campaignId: string, grantId: string) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const grant = await tx.knowledgeGrant.findFirst({
      where: { id: grantId, campaignId, revokedAt: null },
      select: { id: true, targetType: true, targetId: true, recipientType: true, recipientId: true },
    });
    if (!grant) throw new ServiceError("Knowledge grant not found.");

    await tx.knowledgeGrant.update({
      where: { id: grantId },
      data: { revokedAt: new Date(), revokedById: userId },
    });

    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "REVOKE",
        targetType: "KNOWLEDGE_GRANT",
        targetId: grantId,
        detail: {
          targetType: grant.targetType,
          targetId: grant.targetId,
          recipientType: grant.recipientType,
          recipientId: grant.recipientId,
        },
      },
    });

    const affectedEntityIds: string[] = [];
    if (grant.targetType === KnowledgeTargetType.ENTITY) affectedEntityIds.push(grant.targetId);
    if (grant.recipientType === KnowledgeRecipientType.ENTITY) affectedEntityIds.push(grant.recipientId);
    return { id: grantId, affectedEntityIds };
  });
}

// Resolve a set of grants' counterpart entities (by `pick`) to live-canon refs,
// dropping grants whose counterpart entity is archived/missing, newest first.
async function projectGrants(
  campaignId: string,
  grants: { id: string; targetId: string; recipientId: string; notes: string | null; revealedAt: Date }[],
  pick: "target" | "recipient",
): Promise<KnowledgeGrantView[]> {
  const ids = grants.map((g) => (pick === "target" ? g.targetId : g.recipientId));
  if (ids.length === 0) return [];
  const entities = await prisma.entity.findMany({
    where: { id: { in: ids }, campaignId, status: CanonStatus.CANON },
    select: knownEntitySelect,
  });
  const byId = new Map(entities.map((e) => [e.id, e] as const));

  const views: KnowledgeGrantView[] = [];
  for (const grant of grants) {
    const entityId = pick === "target" ? grant.targetId : grant.recipientId;
    const entity = byId.get(entityId);
    if (!entity) continue;
    views.push({ id: grant.id, entity, notes: grant.notes, revealedAt: grant.revealedAt });
  }
  return views;
}

// "Known to": active ENTITY→ENTITY grants where the viewed entity is the *target*
// — i.e. the actor entities that have been told about it. DM-facing read.
export async function listKnowledgeOfEntity(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<KnowledgeGrantView[]> {
  if (!(await isCampaignDm(userId, campaignId))) return [];
  const grants = await prisma.knowledgeGrant.findMany({
    where: {
      campaignId,
      targetType: KnowledgeTargetType.ENTITY,
      targetId: entityId,
      recipientType: KnowledgeRecipientType.ENTITY,
      ...activeGrantWhere(new Date()),
    },
    orderBy: { revealedAt: "desc" },
    select: { id: true, targetId: true, recipientId: true, notes: true, revealedAt: true },
  });
  return projectGrants(campaignId, grants, "recipient");
}

// "Knows about": active ENTITY→ENTITY grants where the viewed entity is the
// *recipient* — i.e. the canon entities it has been told about. DM-facing read.
export async function listKnowledgeHeldByEntity(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<KnowledgeGrantView[]> {
  if (!(await isCampaignDm(userId, campaignId))) return [];
  const grants = await prisma.knowledgeGrant.findMany({
    where: {
      campaignId,
      targetType: KnowledgeTargetType.ENTITY,
      recipientType: KnowledgeRecipientType.ENTITY,
      recipientId: entityId,
      ...activeGrantWhere(new Date()),
    },
    orderBy: { revealedAt: "desc" },
    select: { id: true, targetId: true, recipientId: true, notes: true, revealedAt: true },
  });
  return projectGrants(campaignId, grants, "target");
}
