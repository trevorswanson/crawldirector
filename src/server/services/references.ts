import { CanonStatus, EntityType, Role, Visibility } from "@/generated/prisma/client";
import {
  entityReferences,
  reverseReferenceFields,
  type EntityReference,
} from "@/lib/entity-references";
import { prisma } from "@/server/db";

/**
 * Reference-integrity service (ADR 0011 Part B). The bespoke `data.*` reference
 * fields are *soft FKs* (resolved at display time, never DB foreign keys), so a
 * deleted/archived/retyped target silently orphans its referrers. These reads
 * surface that: a per-entity validation that flags broken references (the detail
 * "broken reference" badge), and a reverse lookup that reports how many entities
 * reference a target before a destructive archive. Neither hard-blocks a write —
 * the soft-FK semantics from ADR 0009 stay; they make the breakage *visible*.
 */

async function getMembership(userId: string, campaignId: string) {
  return prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
}

function playerVisibleWhere(role: Role) {
  return role === Role.PLAYER ? { visibility: Visibility.PLAYER_VISIBLE } : {};
}

/** One outgoing reference, resolved against live canon. */
export interface ReferenceCheck extends EntityReference {
  /** The target's display name, or `null` when it can't be resolved in scope. */
  readonly resolvedName: string | null;
  /**
   * Whether the reference is broken — set but pointing at a target that is
   * missing, archived, or of the wrong type, within the requester's visibility
   * scope. A player can't see DM-only targets, so callers gate the visible badge
   * to DMs (a hidden target is not the same as a broken one — invariant #5).
   */
  readonly broken: boolean;
}

/**
 * Validate one entity's outgoing references against live canon, scoped to the
 * requester's visibility. Returns a resolved name + broken flag per set reference
 * (`[]` for a non-member, a missing/out-of-scope entity, or a type with no
 * reference fields). The detail page uses `resolvedName` for the read-view row and
 * the `broken` flag (DM-only) for the "broken reference" badge.
 */
export async function validateEntityReferences(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<ReferenceCheck[]> {
  const membership = await getMembership(userId, campaignId);
  if (!membership) return [];

  const entity = await prisma.entity.findFirst({
    where: {
      id: entityId,
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...playerVisibleWhere(membership.role),
    },
    select: { type: true, data: true },
  });
  if (!entity) return [];

  const refs = entityReferences(entity.type, entity.data);
  if (refs.length === 0) return [];

  const targets = await prisma.entity.findMany({
    where: {
      id: { in: refs.map((ref) => ref.targetId) },
      campaignId,
      status: { not: CanonStatus.ARCHIVED },
      ...playerVisibleWhere(membership.role),
    },
    select: { id: true, type: true, name: true },
  });
  const byId = new Map(targets.map((target) => [target.id, target]));

  return refs.map((ref) => {
    const target = byId.get(ref.targetId);
    const ok = !!target && target.type === ref.targetType;
    return { ...ref, resolvedName: ok ? target.name : null, broken: !ok };
  });
}

/**
 * How many live (non-archived) entities reference `entityId` via a bespoke `data.*`
 * reference field — the blast radius surfaced before an impact-aware archive.
 * DM-only (returns `0` for players / non-members); `0` when the entity's type is
 * referenced by no registry field. Archiving does not cascade — this only warns
 * the DM that the referrers' soft references will dangle.
 */
export async function countReferrers(
  userId: string,
  campaignId: string,
  entityId: string,
): Promise<number> {
  const membership = await getMembership(userId, campaignId);
  if (!membership || membership.role === Role.PLAYER) return 0;

  const entity = await prisma.entity.findFirst({
    where: { id: entityId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { type: true },
  });
  if (!entity) return 0;

  const fields = reverseReferenceFields(entity.type);
  if (fields.length === 0) return 0;

  const counts = await Promise.all(
    fields.map(({ type, field }) =>
      prisma.entity.count({
        where: {
          campaignId,
          type: type as EntityType,
          status: { not: CanonStatus.ARCHIVED },
          data: { path: [field], equals: entityId },
        },
      }),
    ),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}
