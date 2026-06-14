import {
  CanonStatus,
  EntityType,
  Prisma,
  RelationshipType,
  Role,
  Visibility,
  type ChangeSource,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import {
  SEARCH_TARGET_ENTITY,
  SEARCH_TARGET_EVENT,
  SEARCH_TARGET_RELATIONSHIP,
} from "@/server/services/search-index";

// Search & retrieval (M5 — docs/07-search-retrieval.md).
//
// Keyword / full-text search over the campaign-scoped SearchDoc index, ranked by
// Postgres `ts_rank`. Always campaign-scoped and filtered by the requester's
// visibility (invariant #5 — a player's query can never retrieve DM-only canon).
// Slice 2 broadens the index from ENTITY to RELATIONSHIP and EVENT targets.
//
// Two-layer visibility enforcement. The SQL pass filters on the SearchDoc's
// `visibility` mirror (cheap: drops DM-only entities and secret edges/events).
// But relationship/event player-visibility is *derived* — an edge needs both
// endpoints visible, an event needs ≥1 visible participant, and those can change
// without an edge/event write — so the hydration pass below re-applies the
// authoritative projection against *live* canon, exactly as graph/timeline do.
// A stale index row therefore can never leak: even if the mirror says
// PLAYER_VISIBLE, hydration drops a hit whose endpoints/participants are hidden.

export type EntitySearchHit = {
  targetType: typeof SEARCH_TARGET_ENTITY;
  targetId: string;
  rank: number;
  entity: {
    id: string;
    type: EntityType;
    name: string;
    summary: string | null;
    status: CanonStatus;
    source: ChangeSource;
    tags: string[];
    isStub: boolean;
  };
};

export type RelationshipSearchHit = {
  targetType: typeof SEARCH_TARGET_RELATIONSHIP;
  targetId: string;
  rank: number;
  relationship: {
    id: string;
    type: RelationshipType;
    notes: string | null;
    status: CanonStatus;
    source: ChangeSource;
    secret: boolean;
    sourceEntity: { id: string; name: string; type: EntityType };
    targetEntity: { id: string; name: string; type: EntityType };
  };
};

export type EventSearchHit = {
  targetType: typeof SEARCH_TARGET_EVENT;
  targetId: string;
  rank: number;
  event: {
    id: string;
    title: string;
    summary: string | null;
    status: CanonStatus;
    source: ChangeSource;
    secret: boolean;
  };
};

export type SearchHit = EntitySearchHit | RelationshipSearchHit | EventSearchHit;

export type SearchResult = {
  role: Role | null;
  query: string;
  hits: SearchHit[];
};

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;

const hitEntitySelect = {
  id: true,
  type: true,
  name: true,
  summary: true,
  status: true,
  source: true,
  tags: true,
  isStub: true,
} satisfies Prisma.EntitySelect;

const otherEndpointSelect = { id: true, name: true, type: true } satisfies Prisma.EntitySelect;

const hitRelationshipSelect = {
  id: true,
  type: true,
  notes: true,
  status: true,
  source: true,
  secret: true,
  sourceEntity: { select: otherEndpointSelect },
  targetEntity: { select: otherEndpointSelect },
} satisfies Prisma.RelationshipSelect;

const hitEventSelect = {
  id: true,
  title: true,
  summary: true,
  status: true,
  source: true,
  secret: true,
} satisfies Prisma.EventSelect;

/**
 * Full-text search over a campaign's canon for one user. Returns ranked hits
 * (entities, relationships, events) scoped to what the requester may see. An
 * empty/whitespace query returns no hits (the UI shows its prompt state).
 * Non-members get an empty result.
 */
export async function searchCanon(
  userId: string,
  campaignId: string,
  rawQuery: string,
  options: { limit?: number } = {},
): Promise<SearchResult> {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  if (!membership) return { role: null, query: "", hits: [] };

  const query = rawQuery.trim();
  if (!query) return { role: membership.role, query: "", hits: [] };

  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit ?? DEFAULT_LIMIT));
  const playerOnly = membership.role === Role.PLAYER;

  // Players see only player-visible docs; DMs/co-DMs see everything. The mirror
  // is kept in sync with each source's `secret`/visibility by the indexer.
  const visibilityClause = playerOnly
    ? Prisma.sql`AND "visibility" = ${Visibility.PLAYER_VISIBLE}::"Visibility"`
    : Prisma.empty;

  // `websearch_to_tsquery` safely parses arbitrary user input (quotes, OR, -),
  // so no query sanitising is needed. Slice 1 computes the tsvector at query
  // time; a materialized column + GIN index is a later perf slice.
  const hits: SearchHit[] = [];
  let offset = 0;
  const BATCH_SIZE = Math.max(limit, 50);

  // We over-fetch in batches because player-visibility of relationships/events
  // is derived (e.g. requires endpoints to be visible). A query might match many
  // docs that the SQL pass sees as PLAYER_VISIBLE but hydration drops.
  while (hits.length < limit) {
    const rows = await prisma.$queryRaw<
      { targetId: string; targetType: string; rank: number }[]
    >(Prisma.sql`
      SELECT "targetId", "targetType",
        ts_rank(to_tsvector('english', "content"), websearch_to_tsquery('english', ${query})) AS rank
      FROM "SearchDoc"
      WHERE "campaignId" = ${campaignId}
        ${visibilityClause}
        AND to_tsvector('english', "content") @@ websearch_to_tsquery('english', ${query})
      ORDER BY rank DESC, "targetId" ASC
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `);

    if (rows.length === 0) break;

    const idsByType = (type: string) =>
      rows.filter((row) => row.targetType === type).map((row) => row.targetId);
    const entityIds = idsByType(SEARCH_TARGET_ENTITY);
    const relationshipIds = idsByType(SEARCH_TARGET_RELATIONSHIP);
    const eventIds = idsByType(SEARCH_TARGET_EVENT);

    // Hydrate display fields from live canon. The where-clauses re-confirm the
    // requester's projection (entities: not archived; relationships: both
    // endpoints player-visible; events: ≥1 player-visible participant) so a stale
    // index row is dropped rather than leaked.
    const [entities, relationships, events] = await Promise.all([
      entityIds.length === 0
        ? []
        : prisma.entity.findMany({
            where: { id: { in: entityIds }, campaignId, status: { not: CanonStatus.ARCHIVED } },
            select: hitEntitySelect,
          }),
      relationshipIds.length === 0
        ? []
        : prisma.relationship.findMany({
            where: {
              id: { in: relationshipIds },
              campaignId,
              status: { not: CanonStatus.ARCHIVED },
              sourceEntity: {
                status: { not: CanonStatus.ARCHIVED },
                ...(playerOnly ? { visibility: Visibility.PLAYER_VISIBLE } : {}),
              },
              targetEntity: {
                status: { not: CanonStatus.ARCHIVED },
                ...(playerOnly ? { visibility: Visibility.PLAYER_VISIBLE } : {}),
              },
              ...(playerOnly ? { secret: false } : {}),
            },
            select: hitRelationshipSelect,
          }),
      eventIds.length === 0
        ? []
        : prisma.event.findMany({
            where: {
              id: { in: eventIds },
              campaignId,
              status: { not: CanonStatus.ARCHIVED },
              ...(playerOnly
                ? {
                    secret: false,
                    participants: {
                      some: {
                        entity: { status: { not: CanonStatus.ARCHIVED }, visibility: Visibility.PLAYER_VISIBLE },
                      },
                    },
                  }
                : {}),
            },
            select: hitEventSelect,
          }),
    ]);

    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const relationshipById = new Map(relationships.map((relationship) => [relationship.id, relationship]));
    const eventById = new Map(events.map((event) => [event.id, event]));

    for (const row of rows) {
      const rank = Number(row.rank);
      if (row.targetType === SEARCH_TARGET_ENTITY) {
        const entity = entityById.get(row.targetId);
        if (entity) hits.push({ targetType: SEARCH_TARGET_ENTITY, targetId: row.targetId, rank, entity });
      } else if (row.targetType === SEARCH_TARGET_RELATIONSHIP) {
        const relationship = relationshipById.get(row.targetId);
        if (relationship) hits.push({ targetType: SEARCH_TARGET_RELATIONSHIP, targetId: row.targetId, rank, relationship });
      } else if (row.targetType === SEARCH_TARGET_EVENT) {
        const event = eventById.get(row.targetId);
        if (event) hits.push({ targetType: SEARCH_TARGET_EVENT, targetId: row.targetId, rank, event });
      }

      if (hits.length >= limit) break;
    }

    offset += BATCH_SIZE;
  }

  return { role: membership.role, query, hits };
}
