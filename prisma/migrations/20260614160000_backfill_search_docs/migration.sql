-- Backfill the M5 search index for canon that predates the SearchDoc table.
--
-- The create-table migration (20260614143421_m5_search_doc) leaves the index
-- empty; the write-path hooks (review.ts) only index *future* entity writes. On
-- a database that already holds canon, every pre-existing non-archived entity
-- would stay unsearchable until it was next edited. This one-time data migration
-- seeds a SearchDoc for each, mirroring the indexer's behaviour:
--   * content = name + summary + description + tags, one per line, blanks dropped
--     (matches buildEntityContent in src/server/services/search-index.ts)
--   * visibility mirrors the source entity (for scoped retrieval — invariant #5)
--   * archived entities are skipped (they never appear in search)
-- Idempotent via ON CONFLICT, so it's a no-op where rows already exist (e.g. a
-- fresh DB whose seeds ran through the indexed write paths).
INSERT INTO "SearchDoc" ("id", "campaignId", "targetType", "targetId", "content", "visibility", "updatedAt")
SELECT
    gen_random_uuid()::text,
    e."campaignId",
    'ENTITY',
    e."id",
    COALESCE(c.content, ''),
    e."visibility",
    now()
FROM "Entity" e
LEFT JOIN LATERAL (
    SELECT string_agg(val, E'\n') AS content
    FROM unnest(ARRAY[e."name", e."summary", e."description"] || e."tags") AS u(val)
    WHERE val IS NOT NULL AND btrim(val) <> ''
) c ON true
WHERE e."status" <> 'ARCHIVED'
ON CONFLICT ("targetType", "targetId") DO NOTHING;
