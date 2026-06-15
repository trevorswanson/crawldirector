-- Semantic search layer for M5 slice 4a (pgvector).
--
-- Enable the `vector` extension and add a nullable embedding column to the
-- SearchDoc index plus the model that produced it. The embedding is written
-- asynchronously by the embedding service (through the Job worker) via raw SQL;
-- it is nullable so the typed Prisma client never has to set it and so search
-- degrades to full-text when no embedder is configured. No ANN (HNSW/IVFFlat)
-- index this slice — campaign-scoped cosine over a sequential scan is fast at
-- the result sizes search returns, and a pgvector index type can't be
-- represented in the Prisma schema without breaking the migration-drift gate
-- (the ANN index is deferred to a later perf slice).
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "SearchDoc"
ADD COLUMN "embedding" vector(1536),
ADD COLUMN "embeddingModel" TEXT;
