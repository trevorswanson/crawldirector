-- M5 slice 4c: configurable embedding dimensions plus an ANN index for the
-- default 1536-dimensional semantic-search path.
--
-- Store embeddings in an unconstrained pgvector column so OpenAI-compatible
-- endpoints can use non-default vector widths. The companion integer records
-- the shape used for each row, and hybrid search filters by both model and
-- dimension before comparing vectors. Existing rows were written by the former
-- vector(1536) column, so backfill their dimension from the stored vector.
ALTER TABLE "AiKey"
ADD COLUMN "embeddingDimensions" INTEGER;

ALTER TABLE "SearchDoc"
ADD COLUMN "embeddingDimensions" INTEGER;

UPDATE "SearchDoc"
SET "embeddingDimensions" = vector_dims(embedding)
WHERE embedding IS NOT NULL;

ALTER TABLE "SearchDoc"
ALTER COLUMN "embedding" TYPE vector USING embedding::vector;

-- Prisma cannot represent pgvector HNSW indexes in schema.prisma. Keep this
-- index in raw SQL and keep the query shape aligned with the expression:
--   ORDER BY embedding::vector(1536) <=> $query::vector(1536) LIMIT ...
CREATE INDEX "SearchDoc_embedding_hnsw_1536_idx"
ON "SearchDoc"
USING hnsw ((embedding::vector(1536)) vector_cosine_ops)
WHERE embedding IS NOT NULL AND "embeddingDimensions" = 1536;
