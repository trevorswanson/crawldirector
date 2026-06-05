import {
  CanonStatus,
  ChangeSource,
  OpKind,
  RelationshipType,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import {
  createRelationshipSchema,
  updateRelationshipSchema,
  type CreateRelationshipInput,
  type UpdateRelationshipInput,
} from "@/lib/validation";
import { prisma } from "@/server/db";
import {
  applyAutoApprovedRelationshipChangeSet,
  type ReviewPatch,
} from "@/server/services/review";

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

function nullIfEmpty(value: string | undefined) {
  return value && value.length > 0 ? value : null;
}

export type EntityConnection = {
  id: string;
  type: RelationshipType;
  direction: "out" | "in";
  disposition: number | null;
  sinceDay: number | null;
  untilDay: number | null;
  notes: string | null;
  secret: boolean;
  locked: boolean;
  source: ChangeSource;
  other: { id: string; name: string; type: string };
};

const otherEntitySelect = {
  id: true,
  name: true,
  type: true,
  status: true,
  visibility: true,
} as const;

const graphEndpointSelect = {
  id: true,
  name: true,
  type: true,
  status: true,
  visibility: true,
  locked: true,
} as const;

function isPlayerVisible(entity: {
  status: CanonStatus;
  visibility: Visibility;
}) {
  return (
    entity.status !== CanonStatus.ARCHIVED &&
    (entity.visibility === Visibility.SHARED_WITH_PLAYERS ||
      entity.visibility === Visibility.PLAYER_FACING)
  );
}

/**
 * Create a typed, any-to-any edge from `sourceId` to the target in `input`.
 * Routes through the review pipeline as an auto-approved DM change set so the
 * edge carries provenance (docs/03-review-pipeline.md). DM/co-DM only.
 */
export async function createRelationship(
  userId: string,
  campaignId: string,
  sourceId: string,
  input: CreateRelationshipInput,
) {
  const parsed = createRelationshipSchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  if (sourceId === parsed.targetId) {
    throw new ServiceError("A relationship needs two different entities.");
  }

  // Both endpoints must be live canon in this campaign (not draft/pending/
  // rejected/archived) — an edge never references unapproved content.
  const endpoints = await prisma.entity.findMany({
    where: {
      campaignId,
      id: { in: [sourceId, parsed.targetId] },
      status: CanonStatus.CANON,
    },
    select: { id: true },
  });
  const found = new Set(endpoints.map((entity) => entity.id));
  if (!found.has(sourceId) || !found.has(parsed.targetId)) {
    throw new ServiceError("Entity not found.");
  }

  const patch: ReviewPatch = {
    type: { to: parsed.type },
    sourceId: { to: sourceId },
    targetId: { to: parsed.targetId },
    disposition: { to: parsed.disposition ?? null },
    sinceDay: { to: parsed.sinceDay ?? null },
    untilDay: { to: parsed.untilDay ?? null },
    notes: { to: nullIfEmpty(parsed.notes) },
    secret: { to: parsed.secret },
  };

  const result = await applyAutoApprovedRelationshipChangeSet(userId, campaignId, {
    title: "Add connection",
    operations: [{ op: OpKind.CREATE_RELATIONSHIP, patch }],
  });
  return { id: result.targetIds[0] };
}

/**
 * Edit a live edge's mutable fields (type/disposition/notes/secret) through the
 * review pipeline as an auto-approved DM change set, so the edit carries
 * provenance and respects locks. Endpoints are never edited. DM/co-DM only.
 */
export async function updateRelationship(
  userId: string,
  campaignId: string,
  relationshipId: string,
  input: UpdateRelationshipInput,
) {
  const parsed = updateRelationshipSchema.parse(input);
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.relationship.findFirst({
    where: { id: relationshipId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, version: true, sourceId: true, targetId: true },
  });
  if (!existing) throw new ServiceError("Relationship not found.");

  const patch: ReviewPatch = {
    _baseVersion: { to: existing.version },
    type: { to: parsed.type },
    disposition: { to: parsed.disposition ?? null },
    sinceDay: { to: parsed.sinceDay ?? null },
    untilDay: { to: parsed.untilDay ?? null },
    notes: { to: nullIfEmpty(parsed.notes) },
    secret: { to: parsed.secret },
  };

  await applyAutoApprovedRelationshipChangeSet(userId, campaignId, {
    title: "Edit connection",
    operations: [{ op: OpKind.UPDATE_RELATIONSHIP, targetId: relationshipId, patch }],
  });
  return { id: relationshipId, sourceId: existing.sourceId, targetId: existing.targetId };
}

/**
 * Connections for an entity: both outgoing and incoming live edges, with the
 * entity on the other end. Visibility-scoped — players never see secret edges
 * or edges to entities they can't see.
 */
export async function listConnectionsForEntity(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<EntityConnection[]> {
  const membership = await getMembership(userId, campaignId);
  if (!membership) return [];
  const isPlayer = membership.role === Role.PLAYER;

  const edges = await prisma.relationship.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...(isPlayer ? { secret: false } : {}),
      OR: [{ sourceId: entityId }, { targetId: entityId }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      sourceId: true,
      targetId: true,
      disposition: true,
      sinceDay: true,
      untilDay: true,
      notes: true,
      secret: true,
      locked: true,
      source: true,
      sourceEntity: { select: otherEntitySelect },
      targetEntity: { select: otherEntitySelect },
    },
  });

  const connections: EntityConnection[] = [];
  for (const edge of edges) {
    const outgoing = edge.sourceId === entityId;
    const other = outgoing ? edge.targetEntity : edge.sourceEntity;
    // Hide edges whose other endpoint a player can't see.
    if (isPlayer && !isPlayerVisible(other)) continue;

    connections.push({
      id: edge.id,
      type: edge.type,
      direction: outgoing ? "out" : "in",
      disposition: edge.disposition,
      sinceDay: edge.sinceDay,
      untilDay: edge.untilDay,
      notes: edge.notes,
      secret: edge.secret,
      locked: edge.locked,
      source: edge.source,
      other: { id: other.id, name: other.name, type: other.type },
    });
  }
  return connections;
}

export type GraphNode = {
  id: string;
  name: string;
  type: string;
  locked: boolean;
};

export type GraphEdge = {
  id: string;
  type: RelationshipType;
  sourceId: string;
  targetId: string;
  disposition: number | null;
  secret: boolean;
  locked: boolean;
};

export type CampaignRelationshipGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/**
 * Campaign-wide relationship graph: every live edge and the entities it
 * connects, for the relationship-graph view (docs/11-roadmap.md M3). Only
 * entities that take part in at least one visible edge are returned — the graph
 * is a connectivity view, not the full entity list (the World Browser is that).
 *
 * Visibility-scoped: players never see secret edges, edges to an endpoint they
 * can't see, or edges to an archived endpoint (archiving an entity leaves its
 * edges in place, so those are dropped for everyone). Returns null for
 * non-members.
 */
export async function getCampaignRelationshipGraph(
  userId: string,
  campaignId: string,
): Promise<CampaignRelationshipGraph | null> {
  const membership = await getMembership(userId, campaignId);
  if (!membership) return null;
  const isPlayer = membership.role === Role.PLAYER;

  const edges = await prisma.relationship.findMany({
    where: {
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...(isPlayer ? { secret: false } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      sourceId: true,
      targetId: true,
      disposition: true,
      secret: true,
      locked: true,
      sourceEntity: { select: graphEndpointSelect },
      targetEntity: { select: graphEndpointSelect },
    },
  });

  const nodes = new Map<string, GraphNode>();
  const graphEdges: GraphEdge[] = [];
  for (const edge of edges) {
    const { sourceEntity, targetEntity } = edge;
    if (
      sourceEntity.status === CanonStatus.ARCHIVED ||
      targetEntity.status === CanonStatus.ARCHIVED
    ) {
      continue;
    }
    if (
      isPlayer &&
      (!isPlayerVisible(sourceEntity) || !isPlayerVisible(targetEntity))
    ) {
      continue;
    }

    for (const node of [sourceEntity, targetEntity]) {
      if (!nodes.has(node.id)) {
        nodes.set(node.id, {
          id: node.id,
          name: node.name,
          type: node.type,
          locked: node.locked,
        });
      }
    }
    graphEdges.push({
      id: edge.id,
      type: edge.type,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      disposition: edge.disposition,
      secret: edge.secret,
      locked: edge.locked,
    });
  }

  return { nodes: [...nodes.values()], edges: graphEdges };
}

/**
 * Place or release a canon lock on a relationship edge. Locking is a deliberate
 * DM action, not a proposal; it is audited and does not bump the edge version.
 */
export async function setRelationshipLock(
  userId: string,
  campaignId: string,
  relationshipId: string,
  locked: boolean,
) {
  await assertCampaignDm(userId, campaignId);

  return prisma.$transaction(async (tx) => {
    const relationship = await tx.relationship.findFirst({
      where: {
        id: relationshipId,
        campaignId,
        status: { not: CanonStatus.ARCHIVED },
      },
      select: { id: true, locked: true, sourceId: true, targetId: true },
    });
    if (!relationship) throw new ServiceError("Relationship not found.");

    if (relationship.locked === locked) {
      return relationship;
    }

    const updated = await tx.relationship.update({
      where: { id: relationshipId },
      data: { locked },
      select: { id: true, locked: true, sourceId: true, targetId: true },
    });

    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: locked ? "LOCK" : "UNLOCK",
        targetType: "RELATIONSHIP",
        targetId: relationshipId,
        detail: {
          locked: updated.locked,
          previousLocked: relationship.locked,
        },
      },
    });

    return updated;
  });
}

/**
 * Soft-archive an edge (retains history) through the review pipeline. DM-only.
 */
export async function archiveRelationship(
  userId: string,
  campaignId: string,
  relationshipId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.relationship.findFirst({
    where: { id: relationshipId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, status: true, version: true },
  });
  if (!existing) throw new ServiceError("Relationship not found.");

  await applyAutoApprovedRelationshipChangeSet(userId, campaignId, {
    title: "Remove connection",
    operations: [
      {
        op: OpKind.DELETE_RELATIONSHIP,
        targetId: relationshipId,
        patch: {
          _baseVersion: { to: existing.version },
          status: { from: existing.status, to: CanonStatus.ARCHIVED },
        },
      },
    ],
  });
  return { id: relationshipId };
}

export async function restoreRelationship(
  userId: string,
  campaignId: string,
  relationshipId: string,
) {
  await assertCampaignDm(userId, campaignId);

  const existing = await prisma.relationship.findFirst({
    where: { id: relationshipId, campaignId, status: CanonStatus.ARCHIVED },
    select: { id: true, status: true, version: true },
  });
  if (!existing) throw new ServiceError("Archived relationship not found.");

  await applyAutoApprovedRelationshipChangeSet(userId, campaignId, {
    title: "Restore connection",
    operations: [
      {
        op: OpKind.UPDATE_RELATIONSHIP,
        targetId: relationshipId,
        patch: {
          _baseVersion: { to: existing.version },
          status: { from: existing.status, to: CanonStatus.CANON },
        },
      },
    ],
  });
  return { id: relationshipId };
}
