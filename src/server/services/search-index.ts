import { CanonStatus, Prisma, Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";

// Search & retrieval index (M5 — docs/07-search-retrieval.md).
//
// `SearchDoc` is a denormalized, campaign-scoped mirror of canon used for
// full-text (and, in a later slice, semantic) retrieval. It is *derived* data:
// regenerable from canon at any time, never part of provenance, and never shown
// to players except through the `visibility` mirror it copies from its source
// (invariant #5 — scoping happens at retrieval, see search.ts).
//
// Slice 1 indexes ENTITY targets only; RELATIONSHIP/EVENT targets land in a
// follow-up slice (the schema's `targetType` already allows them).

export const SEARCH_TARGET_ENTITY = "ENTITY";

// The fields whose values make up an entity's searchable text. Re-read inside
// the write transaction so the index reflects the entity's *final* persisted
// state, not the incoming patch.
const entitySearchSelect = {
  campaignId: true,
  status: true,
  name: true,
  summary: true,
  description: true,
  tags: true,
  visibility: true,
} satisfies Prisma.EntitySelect;

type EntitySearchSource = Prisma.EntityGetPayload<{ select: typeof entitySearchSelect }>;

/**
 * Build the denormalized searchable text for an entity: name + summary +
 * description + tags, one per line, blanks dropped. Pure; exported for testing.
 */
export function buildEntityContent(entity: {
  name: string;
  summary: string | null;
  description: string | null;
  tags: string[];
}): string {
  return [entity.name, entity.summary, entity.description, ...entity.tags]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

// The full client and a transaction client both satisfy this for our needs.
type Db = Prisma.TransactionClient;

/**
 * Upsert (or remove) the SearchDoc for one entity. Called from the canon write
 * paths (review.ts) inside the same transaction, and from the backfill below.
 * Archived/missing entities drop out of the index — the mirror is regenerable,
 * so dropping rather than tombstoning keeps retrieval honest.
 */
export async function indexEntity(
  db: Db,
  campaignId: string,
  entityId: string,
): Promise<void> {
  const entity = (await db.entity.findUnique({
    where: { id: entityId },
    select: entitySearchSelect,
  })) as EntitySearchSource | null;

  if (
    !entity ||
    entity.campaignId !== campaignId ||
    entity.status === CanonStatus.ARCHIVED
  ) {
    await removeSearchDoc(db, SEARCH_TARGET_ENTITY, entityId);
    return;
  }

  const content = buildEntityContent(entity);
  await db.searchDoc.upsert({
    where: {
      targetType_targetId: { targetType: SEARCH_TARGET_ENTITY, targetId: entityId },
    },
    create: {
      campaignId,
      targetType: SEARCH_TARGET_ENTITY,
      targetId: entityId,
      content,
      visibility: entity.visibility,
    },
    update: { campaignId, content, visibility: entity.visibility },
  });
}

/** Drop a target's SearchDoc (no-op if absent). */
export async function removeSearchDoc(
  db: Db,
  targetType: string,
  targetId: string,
): Promise<void> {
  await db.searchDoc.deleteMany({ where: { targetType, targetId } });
}

/**
 * Rebuild every entity SearchDoc for a campaign from current canon. DM-only.
 * The index is hooked into the write paths, so this is a recovery/backfill tool
 * (e.g. after enabling search on an existing campaign) rather than a hot path.
 */
export async function reindexCampaign(
  userId: string,
  campaignId: string,
): Promise<{ indexed: number }> {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to reindex this campaign.");
  }

  const entities = await prisma.entity.findMany({
    where: { campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, name: true, summary: true, description: true, tags: true, visibility: true },
  });

  const docs = entities.map((entity) => ({
    campaignId,
    targetType: SEARCH_TARGET_ENTITY,
    targetId: entity.id,
    content: buildEntityContent(entity),
    visibility: entity.visibility,
  }));

  await prisma.$transaction([
    prisma.searchDoc.deleteMany({
      where: { campaignId, targetType: SEARCH_TARGET_ENTITY },
    }),
    ...(docs.length > 0
      ? [prisma.searchDoc.createMany({ data: docs })]
      : []),
  ]);

  return { indexed: docs.length };
}
