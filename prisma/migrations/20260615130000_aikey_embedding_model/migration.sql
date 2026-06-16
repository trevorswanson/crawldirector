-- Bring-your-own embedding model for semantic search (M5 — docs/07-search-
-- retrieval.md). An OpenAI-compatible provider can now name the embedding model
-- it serves (e.g. Mistral's codestral-embed), resolved per key at embed time.
-- Nullable: existing keys fall back to the provider default (OpenAI) or skip
-- semantic search (custom endpoint). The SearchDoc.embedding vector(1536) column
-- is unchanged, so any chosen model must still return 1536-dimensional vectors.
ALTER TABLE "AiKey" ADD COLUMN "embeddingModel" TEXT;
