import { CanonStatus, EntityType, Role, Visibility } from "@/generated/prisma/client";
import {
  isKindDataStale,
  kindTypes,
  RESERVED_DATA_KEY,
  schemaVersionFor,
} from "@/lib/entity-kinds";
import {
  entityReferences,
  reverseReferenceFields,
  type EntityReference,
} from "@/lib/entity-references";
import { ServiceError } from "@/lib/errors";
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

export type BrokenReferenceReason = "MISSING" | "ARCHIVED" | "WRONG_TYPE";

export interface BrokenReferenceIssue extends EntityReference {
  readonly entityId: string;
  readonly entityName: string;
  readonly entityType: string;
  readonly reason: BrokenReferenceReason;
  readonly actualType?: string;
}

export interface StaleDataIssue {
  readonly entityId: string;
  readonly entityName: string;
  readonly entityType: string;
  readonly storedVersion: number;
  readonly currentVersion: number;
}

export interface CampaignIntegrityReport {
  readonly checkedEntities: number;
  readonly brokenReferences: BrokenReferenceIssue[];
  readonly staleData: StaleDataIssue[];
}

function storedDataVersion(raw: unknown): number {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 1;
  const value = (raw as Record<string, unknown>)[RESERVED_DATA_KEY];
  return typeof value === "number" ? value : 1;
}

async function requireDmMembership(userId: string, campaignId: string) {
  const membership = await getMembership(userId, campaignId);
  if (!membership) throw new ServiceError("You do not have access to this campaign.");
  if (membership.role === Role.PLAYER) {
    throw new ServiceError("Only the DM can view canon integrity.");
  }
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

/**
 * Campaign-scoped canon-integrity report (ADR 0011 Part B, slice 3b). This is
 * deliberately DM-only because it scans all live canon, including DM-only rows,
 * for broken bespoke soft references and stale `data._v` rows that should be
 * migrated before import/export and consistency tooling consume them.
 */
export async function getCampaignIntegrityReport(
  userId: string,
  campaignId: string,
): Promise<CampaignIntegrityReport> {
  await requireDmMembership(userId, campaignId);

  const entities = await prisma.entity.findMany({
    where: { campaignId, status: { not: CanonStatus.ARCHIVED } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, type: true, data: true },
  });

  const outgoing = entities.flatMap((entity) =>
    entityReferences(entity.type, entity.data).map((ref) => ({ entity, ref })),
  );
  const targetIds = [...new Set(outgoing.map(({ ref }) => ref.targetId))];
  const targets = targetIds.length
    ? await prisma.entity.findMany({
        where: { id: { in: targetIds }, campaignId },
        select: { id: true, type: true, status: true },
      })
    : [];
  const targetsById = new Map(targets.map((target) => [target.id, target]));

  const brokenReferences = outgoing.flatMap(({ entity, ref }) => {
    const target = targetsById.get(ref.targetId);
    let reason: BrokenReferenceReason | null = null;
    let actualType: string | undefined;

    if (!target) {
      reason = "MISSING";
    } else if (target.status === CanonStatus.ARCHIVED) {
      reason = "ARCHIVED";
    } else if (target.type !== ref.targetType) {
      reason = "WRONG_TYPE";
      actualType = target.type;
    }

    if (!reason) return [];
    return [
      {
        ...ref,
        entityId: entity.id,
        entityName: entity.name,
        entityType: entity.type,
        reason,
        ...(actualType ? { actualType } : {}),
      },
    ];
  });

  const versionedTypes = new Set(kindTypes());
  const staleData = entities.flatMap((entity) => {
    if (!versionedTypes.has(entity.type) || !isKindDataStale(entity.type, entity.data)) {
      return [];
    }
    return [
      {
        entityId: entity.id,
        entityName: entity.name,
        entityType: entity.type,
        storedVersion: storedDataVersion(entity.data),
        currentVersion: schemaVersionFor(entity.type),
      },
    ];
  });

  return {
    checkedEntities: entities.length,
    brokenReferences,
    staleData,
  };
}
