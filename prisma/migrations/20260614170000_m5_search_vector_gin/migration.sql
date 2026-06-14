-- Materialize full-text search for M5 slice 3.
--
-- Slice 1/2 computed to_tsvector('english', content) at query time. That is
-- correct but cannot use a GIN index efficiently. This generated column keeps
-- SearchDoc write paths simple: app code still writes only `content`, while
-- Postgres stores the derived tsvector and maintains the index.
ALTER TABLE "SearchDoc"
ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (to_tsvector('english'::regconfig, "content")) STORED;

CREATE INDEX "SearchDoc_searchVector_idx"
ON "SearchDoc"
USING GIN ("searchVector");
