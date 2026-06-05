-- ADR 0004 — event time model, slice 1: intra-floor `rank`.
-- `orderKey` (the floor) is the coarse macro-clock; `rank` is a fractional index
-- (a lexicographically-sortable string, see src/lib/rank.ts) giving a stable,
-- DM-controllable order *within* a floor. Both are derived/mechanical, never a
-- reviewable field. The timeline sorts by (orderKey, rank).

-- Additive column; existing rows are spaced below by the backfill. The
-- fractional index relies on *bytewise* ordering (its alphabet spans digits and
-- both letter cases), so the column is pinned to the "C" collation — the
-- database's default text collation would otherwise mis-sort an upper-case head
-- (e.g. a "below a0" prepend) relative to lower-case ranks. Prisma doesn't model
-- collation, so this stays invisible to the schema/drift check.
ALTER TABLE "Event" ADD COLUMN "rank" TEXT COLLATE "C" NOT NULL DEFAULT 'a0';

-- Backfill: per (campaign, floor) group, assign distinct, ascending ranks in the
-- current (orderKey, createdAt) order so nothing reorders on day one but every
-- event gets its own rank (so a later drag has neighbours to slot between).
-- Ranks "a0".."az" are the 62 single-digit integer keys the fractional indexer
-- emits on append; an unusual >62-event floor overflows into a fraction so the
-- order still holds. (DCC has ~18 floors; this is ample headroom.)
DO $$
DECLARE
  rec RECORD;
  digits TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  new_rank TEXT;
BEGIN
  FOR rec IN
    SELECT id,
           row_number() OVER (
             PARTITION BY "campaignId", "orderKey"
             ORDER BY "orderKey", "createdAt", id
           ) AS rn
    FROM "Event"
  LOOP
    IF rec.rn <= 62 THEN
      new_rank := 'a' || substr(digits, rec.rn::int, 1);
    ELSE
      new_rank := 'az' || substr(digits, ((rec.rn - 62) % 61)::int + 2, 1);
    END IF;
    UPDATE "Event" SET "rank" = new_rank WHERE id = rec.id;
  END LOOP;
END $$;

-- Replace the coarse (campaignId, orderKey) index with the composite the
-- timeline now sorts on.
DROP INDEX "Event_campaignId_orderKey_idx";
CREATE INDEX "Event_campaignId_orderKey_rank_idx" ON "Event"("campaignId", "orderKey", "rank");
