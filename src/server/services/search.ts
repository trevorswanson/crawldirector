import {
  CanonStatus,
  EntityType,
  Prisma,
  Role,
  Visibility,
  type ChangeSource,
} from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { SEARCH_TARGET_ENTITY } from "@/server/services/search-index";

// Search & retrieval (M5 — docs/07-search-retrieval.md).
//
// Slice 1: keyword / full-text search over the campaign-scoped SearchDoc index,
// ranked by Postgres `ts_rank`. Always campaign-scoped and filtered by the
// requester's visibility (invariant #5 — a player's query can never retrieve
// DM-only canon). The semantic (pgvector) layer and "Ask the Campaign" land in
// later M5 slices; this layer degrades gracefully with no AI key.

export type EntitySearchHit = {
  targetType: string;
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

export type SearchResult = {
  role: Role | null;
  query: string;
  hits: EntitySearchHit[];
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

/**
 * Full-text search over a campaign's canon for one user. Returns ranked entity
 * hits scoped to what the requester may see. An empty/whitespace query returns
 * no hits (the UI shows its prompt state). Non-members get an empty result.
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
  // is kept in sync with each source's visibility by the indexer.
  const visibilityClause = playerOnly
    ? Prisma.sql`AND "visibility" = ${Visibility.PLAYER_VISIBLE}::"Visibility"`
    : Prisma.empty;

  // `websearch_to_tsquery` safely parses arbitrary user input (quotes, OR, -),
  // so no query sanitising is needed. Slice 1 computes the tsvector at query
  // time; a materialized column + GIN index is a later perf slice.
  const rows = await prisma.$queryRaw<
    { targetId: string; targetType: string; rank: number }[]
  >(Prisma.sql`
    SELECT "targetId", "targetType",
      ts_rank(to_tsvector('english', "content"), websearch_to_tsquery('english', ${query})) AS rank
    FROM "SearchDoc"
    WHERE "campaignId" = ${campaignId}
      AND "targetType" = ${SEARCH_TARGET_ENTITY}
      ${visibilityClause}
      AND to_tsvector('english', "content") @@ websearch_to_tsquery('english', ${query})
    ORDER BY rank DESC, "targetId" ASC
    LIMIT ${limit}
  `);

  if (rows.length === 0) return { role: membership.role, query, hits: [] };

  // Hydrate display fields from live canon (also re-confirms the entity isn't
  // archived — defence in depth against a stale index row).
  const ids = rows.map((row) => row.targetId);
  const entities = await prisma.entity.findMany({
    where: { id: { in: ids }, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: hitEntitySelect,
  });
  const byId = new Map(entities.map((entity) => [entity.id, entity]));

  const hits = rows.flatMap((row) => {
    const entity = byId.get(row.targetId);
    if (!entity) return [];
    return [
      {
        targetType: row.targetType,
        targetId: row.targetId,
        rank: Number(row.rank),
        entity,
      },
    ];
  });

  return { role: membership.role, query, hits };
}
