import {
  CanonStatus,
  EntityType,
  Prisma,
  RelationshipType,
  Role,
  Visibility,
  type ChangeSource,
} from "@/generated/prisma/client";
import { EMBED_MODEL_DEFAULT, resolveCampaignEmbedder } from "@/server/ai";
import { prisma } from "@/server/db";
import { assertWithinSpendCap, recordAiUsage } from "@/server/services/ai-usage";
import { EMBED_DIMENSIONS, searchVectorLiteral } from "@/server/services/embeddings";
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
// Slice 3 moves ranking/filtering onto the generated `searchVector` column so
// Postgres can use the SearchDoc GIN index instead of recomputing tsvectors per
// query. Slice 4a makes search **hybrid**: when the campaign has an embedding-
// capable provider, the query is embedded once and ranking blends the full-text
// `ts_rank` with the pgvector cosine similarity of `SearchDoc.embedding`, so a
// natural-language query with no keyword overlap still retrieves the closest
// docs. Slice 4c makes the semantic candidate arm ANN-friendly by ordering a
// nearest-neighbor CTE on the raw pgvector distance expression before blending
// candidates. Semantic is purely additive — no embedder, no embeddings, or any
// embed failure falls back to the exact slice-3 full-text behaviour.
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

// Weight on the semantic (cosine-similarity) term in the hybrid blend. `ts_rank`
// values are small, so at 1.0 the cosine term (0–1 for normalized embeddings)
// leads ranking while an exact keyword hit — which also scores high on cosine —
// keeps its edge. A first-cut additive blend; RRF-style fusion + tuning are a
// follow-up (docs/07-search-retrieval.md).
const SEMANTIC_WEIGHT = 1.0;

// A doc with no keyword hit is a *semantic* candidate only when its similarity
// to the query clears this floor — so a query that matches nothing meaningful
// doesn't drag in unrelated embedded docs at near-zero similarity. Tunable.
const SEMANTIC_SIMILARITY_FLOOR = 0.2;

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

export function buildSearchDocSearchSql({
  campaignId,
  query,
  playerOnly,
  limit,
  offset,
  queryVector,
  embedModel,
  embedDimensions,
  targetTypes,
}: {
  campaignId: string;
  query: string;
  playerOnly: boolean;
  limit: number;
  offset: number;
  // When set, search is hybrid: candidates also include same-model embedded rows
  // and ranking adds the cosine-similarity term. Absent → slice-3 full-text only.
  queryVector?: number[] | null;
  embedModel?: string;
  embedDimensions?: number;
  // When set, restrict the candidate scan to these `targetType`s. Lets a caller
  // (e.g. retrieval context-building) ask for one type without non-matching types
  // consuming the LIMIT window. Absent → all target types (the default).
  targetTypes?: string[];
}) {
  const visibilityClause = playerOnly
    ? Prisma.sql`AND "visibility" = ${Visibility.PLAYER_VISIBLE}::"Visibility"`
    : Prisma.empty;
  const targetTypeClause =
    targetTypes && targetTypes.length
      ? Prisma.sql`AND "targetType" IN (${Prisma.join(targetTypes)})`
      : Prisma.empty;

  if (queryVector && queryVector.length > 0) {
    const literal = searchVectorLiteral(queryVector);
    const model = embedModel ?? EMBED_MODEL_DEFAULT;
    const dimensions = embedDimensions ?? EMBED_DIMENSIONS;
    const semanticCandidateLimit = limit + offset;
    const distanceExpr =
      dimensions === EMBED_DIMENSIONS
        ? Prisma.sql`embedding::vector(1536) <=> ${literal}::vector(1536)`
        : Prisma.sql`embedding <=> ${literal}::vector`;

    // The semantic arm orders by the raw distance operator with LIMIT, which is
    // the shape pgvector can accelerate with HNSW. Only after candidate
    // selection do we convert distance to similarity and blend it with full-text
    // rank. Compare only rows embedded with the same model and vector dimension.
    return Prisma.sql`
      WITH full_text_candidates AS MATERIALIZED (
        SELECT "targetId", "targetType",
          ts_rank("searchVector", websearch_to_tsquery('english', ${query})) AS text_rank,
          0::double precision AS similarity
        FROM "SearchDoc"
        WHERE "campaignId" = ${campaignId}
          ${visibilityClause}
          ${targetTypeClause}
          AND "searchVector" @@ websearch_to_tsquery('english', ${query})
        ORDER BY text_rank DESC, "targetId" ASC
        LIMIT ${semanticCandidateLimit}
      ),
      semantic_candidates AS MATERIALIZED (
        SELECT "targetId", "targetType",
          0::double precision AS text_rank,
          1 - distance AS similarity
        FROM (
          SELECT "targetId", "targetType", ${distanceExpr} AS distance
          FROM "SearchDoc"
          WHERE "campaignId" = ${campaignId}
            ${visibilityClause}
            ${targetTypeClause}
            AND embedding IS NOT NULL
            AND "embeddingModel" = ${model}
            AND "embeddingDimensions" = ${dimensions}
          ORDER BY ${distanceExpr}
          LIMIT ${semanticCandidateLimit}
        ) nearest
        WHERE 1 - distance > ${SEMANTIC_SIMILARITY_FLOOR}
      )
      SELECT "targetId", "targetType",
        max(text_rank) + ${SEMANTIC_WEIGHT} * max(similarity) AS rank
      FROM (
        SELECT * FROM full_text_candidates
        UNION ALL
        SELECT * FROM semantic_candidates
      ) candidates
      GROUP BY "targetId", "targetType"
      ORDER BY rank DESC, "targetId" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return Prisma.sql`
    SELECT "targetId", "targetType",
      ts_rank("searchVector", websearch_to_tsquery('english', ${query})) AS rank
    FROM "SearchDoc"
    WHERE "campaignId" = ${campaignId}
      ${visibilityClause}
      ${targetTypeClause}
      AND "searchVector" @@ websearch_to_tsquery('english', ${query})
    ORDER BY rank DESC, "targetId" ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

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
  options: { limit?: number; targetTypes?: string[] } = {},
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

  // Embed the query once for hybrid ranking. Semantic is additive: no embedder,
  // a wrong-dimension result, or any provider failure leaves `queryVector` null
  // and search falls back to the exact full-text path. Embedding the query is
  // independent of visibility — the SQL/hydration projection below is unchanged,
  // so a player can never retrieve more than the full-text path would surface.
  //
  // This runs for any member (including players), so it spends the DM's BYO key
  // on the request path: honor the spend cap here too (cap reached → throw →
  // degrade to full-text), and record the query-embed cost so the Settings usage
  // trail stays complete.
  let queryVector: number[] | null = null;
  let queryModel = EMBED_MODEL_DEFAULT;
  let queryDimensions = EMBED_DIMENSIONS;
  try {
    const embedder = await resolveCampaignEmbedder(campaignId);
    if (embedder) {
      await assertWithinSpendCap(campaignId);
      const result = await embedder.embed([query]);
      const vector = result.vectors[0];
      const expectedDimensions = embedder.embeddingDimensions ?? EMBED_DIMENSIONS;
      if (vector && vector.length === expectedDimensions) {
        queryVector = vector;
        queryModel = result.model;
        queryDimensions = expectedDimensions;
        // Best-effort: never fail search over a usage-tracking write.
        try {
          await recordAiUsage({
            campaignId,
            userId,
            providerId: embedder.id,
            model: result.model,
            generatorId: "search-query-embed",
            usage: result.usage,
          });
        } catch {
          // usage tracking is non-critical
        }
      }
    }
  } catch {
    queryVector = null;
  }

  // `websearch_to_tsquery` safely parses arbitrary user input (quotes, OR, -),
  // so no query sanitising is needed. `searchVector` is generated from content
  // and GIN-indexed by the M5 slice 3 migration.
  const hits: SearchHit[] = [];
  let offset = 0;
  const BATCH_SIZE = Math.max(limit, 50);

  // We over-fetch in batches because player-visibility of relationships/events
  // is derived (e.g. requires endpoints to be visible). A query might match many
  // docs that the SQL pass sees as PLAYER_VISIBLE but hydration drops.
  while (hits.length < limit) {
    const rows = await prisma.$queryRaw<
      { targetId: string; targetType: string; rank: number }[]
    >(
      buildSearchDocSearchSql({
        campaignId,
        query,
        playerOnly,
        limit: BATCH_SIZE,
        offset,
        queryVector,
        embedModel: queryModel,
        embedDimensions: queryDimensions,
        targetTypes: options.targetTypes,
      }),
    );

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
