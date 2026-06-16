import {
  CanonStatus,
  JobKind,
  JobStatus,
  Prisma,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { AI_PROVIDERS, resolveEmbeddingModel } from "@/lib/ai/providers";
import { relationshipTypeMeta } from "@/lib/relationship-types";
import { prisma } from "@/server/db";

// Search & retrieval index (M5 — docs/07-search-retrieval.md).
//
// `SearchDoc` is a denormalized, campaign-scoped mirror of canon used for
// full-text (and, in a later slice, semantic) retrieval. It is *derived* data:
// regenerable from canon at any time, never part of provenance, and never shown
// to players except through the `visibility` mirror it copies from its source
// (invariant #5 — final scoping happens at retrieval, see search.ts).
//
// Slice 1 indexed ENTITY targets; slice 2 adds RELATIONSHIP and EVENT targets
// (the schema's `targetType` already allows them). Relationship/event player
// visibility is *derived* (an edge depends on its endpoints; an event on its
// participants) so the mirror only copies the cheap `secret → DM_ONLY` signal
// and the authoritative endpoint/participant projection is re-applied at
// retrieval against live canon — see search.ts.

export const SEARCH_TARGET_ENTITY = "ENTITY";
export const SEARCH_TARGET_RELATIONSHIP = "RELATIONSHIP";
export const SEARCH_TARGET_EVENT = "EVENT";
const EMBEDDING_PROVIDER_IDS = AI_PROVIDERS
  .filter((provider) => provider.kind === "openai-compatible")
  .map((provider) => provider.id);

// The full client and a transaction client both satisfy this for our needs.
type Db = Prisma.TransactionClient;

type IndexSearchDocOptions = {
  reembedRequestedById?: string | null;
};

/** Map a `secret` flag to the visibility mirror (the coarse retrieval pre-filter). */
function visibilityForSecret(secret: boolean): Visibility {
  return secret ? Visibility.DM_ONLY : Visibility.PLAYER_VISIBLE;
}

/** Join the non-blank parts of a search document, one per line. */
function joinContent(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

// ───────────────────────────── Entities ─────────────────────────────

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
  return joinContent([entity.name, entity.summary, entity.description, ...entity.tags]);
}

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
  options: IndexSearchDocOptions = {},
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

  await upsertSearchDoc(
    db,
    SEARCH_TARGET_ENTITY,
    campaignId,
    entityId,
    buildEntityContent(entity),
    entity.visibility,
    options,
  );
}

/**
 * Upsert one SearchDoc's denormalized text + visibility mirror. When the
 * searchable `content` changes, clear the `embeddingModel` marker and, when the
 * campaign has an embedding-capable key, enqueue one campaign-level
 * `EMBED_SEARCH_DOCS` job (deduped while queued). The stale vector is
 * left in place but ignored by hybrid ranking, which requires a matching
 * `embeddingModel` (search.ts) — so an edited doc never ranks on its old
 * embedding. Embeddings are written out-of-band (embeddings.ts); this
 * in-transaction path only ever *invalidates and schedules*, never re-embeds.
 */
async function upsertSearchDoc(
  db: Db,
  targetType: string,
  campaignId: string,
  targetId: string,
  content: string,
  visibility: Visibility,
  options: IndexSearchDocOptions = {},
): Promise<void> {
  const existing = await db.searchDoc.findUnique({
    where: { targetType_targetId: { targetType, targetId } },
    select: { content: true },
  });
  const contentChanged = !existing || existing.content !== content;
  await db.searchDoc.upsert({
    where: { targetType_targetId: { targetType, targetId } },
    create: { campaignId, targetType, targetId, content, visibility },
    update: {
      campaignId,
      content,
      visibility,
      ...(contentChanged ? { embeddingModel: null } : {}),
    },
  });
  if (contentChanged && options.reembedRequestedById) {
    await enqueueSearchDocEmbeddingJob(db, campaignId, options.reembedRequestedById);
  }
}

// ─────────────────────────── Relationships ──────────────────────────

const relationshipSearchSelect = {
  id: true,
  campaignId: true,
  status: true,
  type: true,
  notes: true,
  secret: true,
  sourceEntity: { select: { name: true } },
  targetEntity: { select: { name: true } },
} satisfies Prisma.RelationshipSelect;

type RelationshipSearchSource = Prisma.RelationshipGetPayload<{
  select: typeof relationshipSearchSelect;
}>;

/**
 * Build the searchable text for a relationship. An edge has no name of its own,
 * so its document is its (human) type phrase + both endpoint names + notes —
 * making "Donut ally" or "betrayed Mordecai" find the edge. Pure; exported for
 * testing. The endpoint names are denormalized, so a later endpoint *rename*
 * leaves this stale until the next reindex (the doc-07 "stale-but-close between
 * writes" tolerance); the edge's own writes keep it fresh.
 */
export function buildRelationshipContent(relationship: {
  typePhrase: string;
  sourceName: string;
  targetName: string;
  notes: string | null;
}): string {
  return joinContent([
    relationship.typePhrase,
    relationship.sourceName,
    relationship.targetName,
    relationship.notes,
  ]);
}

function relationshipContentFrom(relationship: RelationshipSearchSource): string {
  return buildRelationshipContent({
    typePhrase: relationshipTypeMeta[relationship.type].forward,
    sourceName: relationship.sourceEntity.name,
    targetName: relationship.targetEntity.name,
    notes: relationship.notes,
  });
}

/**
 * Upsert (or remove) the SearchDoc for one relationship. Called from the edge
 * write paths (review.ts) in the same transaction. Archived/missing edges drop
 * out. `visibility` mirrors only the edge's own `secret` flag; endpoint
 * visibility is enforced at retrieval (search.ts), since it can change without
 * an edge write.
 */
export async function indexRelationship(
  db: Db,
  campaignId: string,
  relationshipId: string,
  options: IndexSearchDocOptions = {},
): Promise<void> {
  const relationship = await db.relationship.findUnique({
    where: { id: relationshipId },
    select: relationshipSearchSelect,
  });

  if (
    !relationship ||
    relationship.campaignId !== campaignId ||
    relationship.status === CanonStatus.ARCHIVED
  ) {
    await removeSearchDoc(db, SEARCH_TARGET_RELATIONSHIP, relationshipId);
    return;
  }

  await upsertSearchDoc(
    db,
    SEARCH_TARGET_RELATIONSHIP,
    campaignId,
    relationshipId,
    relationshipContentFrom(relationship),
    visibilityForSecret(relationship.secret),
    options,
  );
}

// ─────────────────────────────── Events ─────────────────────────────

const eventSearchSelect = {
  id: true,
  campaignId: true,
  status: true,
  title: true,
  summary: true,
  description: true,
  secret: true,
} satisfies Prisma.EventSelect;

/**
 * Build the searchable text for an event: title + summary + description, one
 * per line, blanks dropped. Pure; exported for testing.
 */
export function buildEventContent(event: {
  title: string;
  summary: string | null;
  description: string | null;
}): string {
  return joinContent([event.title, event.summary, event.description]);
}

/**
 * Upsert (or remove) the SearchDoc for one event. Called from the event write
 * paths (review.ts) in the same transaction. Archived/missing events drop out.
 * `visibility` mirrors only the event's own `secret` flag; the participant
 * projection is enforced at retrieval (search.ts).
 */
export async function indexEvent(
  db: Db,
  campaignId: string,
  eventId: string,
  options: IndexSearchDocOptions = {},
): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: eventSearchSelect,
  });

  if (
    !event ||
    event.campaignId !== campaignId ||
    event.status === CanonStatus.ARCHIVED
  ) {
    await removeSearchDoc(db, SEARCH_TARGET_EVENT, eventId);
    return;
  }

  await upsertSearchDoc(
    db,
    SEARCH_TARGET_EVENT,
    campaignId,
    eventId,
    buildEventContent(event),
    visibilityForSecret(event.secret),
    options,
  );
}

// ─────────────────────────── Shared helpers ─────────────────────────

/** Drop a target's SearchDoc (no-op if absent). */
export async function removeSearchDoc(
  db: Db,
  targetType: string,
  targetId: string,
): Promise<void> {
  await db.searchDoc.deleteMany({ where: { targetType, targetId } });
}

async function enqueueSearchDocEmbeddingJob(
  db: Db,
  campaignId: string,
  createdById: string,
): Promise<void> {
  if (!(await campaignHasEmbeddingConfig(db, campaignId))) return;

  const existing = await db.job.findFirst({
    where: {
      campaignId,
      kind: JobKind.EMBED_SEARCH_DOCS,
      status: JobStatus.QUEUED,
    },
    select: { id: true },
  });
  if (existing) return;

  await db.job.create({
    data: {
      campaignId,
      createdById,
      kind: JobKind.EMBED_SEARCH_DOCS,
      status: JobStatus.QUEUED,
      payload: {},
    },
  });
}

async function campaignHasEmbeddingConfig(db: Db, campaignId: string): Promise<boolean> {
  const keys = await db.aiKey.findMany({
    where: { campaignId, providerId: { in: EMBEDDING_PROVIDER_IDS } },
    select: { providerId: true, embeddingModel: true },
  });
  return keys.some((key) => resolveEmbeddingModel(key.providerId, key.embeddingModel) !== null);
}

/**
 * Rebuild every SearchDoc for a campaign from current canon — entities,
 * relationships, and events. DM-only. The index is hooked into the write paths,
 * so this is a recovery/backfill tool (e.g. after enabling search on an existing
 * campaign, or to refresh denormalized endpoint names) rather than a hot path.
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

  const live = { campaignId, status: { not: CanonStatus.ARCHIVED } } as const;
  const [entities, relationships, events] = await Promise.all([
    prisma.entity.findMany({
      where: live,
      select: { id: true, name: true, summary: true, description: true, tags: true, visibility: true },
    }),
    prisma.relationship.findMany({ where: live, select: relationshipSearchSelect }),
    prisma.event.findMany({ where: live, select: eventSearchSelect }),
  ]);

  const docs: Prisma.SearchDocCreateManyInput[] = [
    ...entities.map((entity) => ({
      campaignId,
      targetType: SEARCH_TARGET_ENTITY,
      targetId: entity.id,
      content: buildEntityContent(entity),
      visibility: entity.visibility,
    })),
    ...relationships.map((relationship) => ({
      campaignId,
      targetType: SEARCH_TARGET_RELATIONSHIP,
      targetId: relationship.id,
      content: relationshipContentFrom(relationship),
      visibility: visibilityForSecret(relationship.secret),
    })),
    ...events.map((event) => ({
      campaignId,
      targetType: SEARCH_TARGET_EVENT,
      targetId: event.id,
      content: buildEventContent(event),
      visibility: visibilityForSecret(event.secret),
    })),
  ];

  await prisma.$transaction([
    prisma.searchDoc.deleteMany({ where: { campaignId } }),
    ...(docs.length > 0 ? [prisma.searchDoc.createMany({ data: docs })] : []),
  ]);

  return { indexed: docs.length };
}
