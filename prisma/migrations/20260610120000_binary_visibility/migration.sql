-- Collapse the three-state Visibility enum to a clean binary model.
-- SHARED_WITH_PLAYERS and PLAYER_FACING were always treated identically by every
-- visibility projection (player-visible), so both fold into PLAYER_VISIBLE.
-- Subset/partial access is now modeled exclusively via KnowledgeGrant (fog of war).

-- Postgres can't drop in-use enum values in place, so swap the type:
ALTER TYPE "Visibility" RENAME TO "Visibility_old";

CREATE TYPE "Visibility" AS ENUM ('DM_ONLY', 'PLAYER_VISIBLE');

ALTER TABLE "Entity" ALTER COLUMN "visibility" DROP DEFAULT;

ALTER TABLE "Entity"
  ALTER COLUMN "visibility" TYPE "Visibility"
  USING (
    CASE "visibility"::text
      WHEN 'DM_ONLY' THEN 'DM_ONLY'
      ELSE 'PLAYER_VISIBLE'
    END
  )::"Visibility";

ALTER TABLE "Entity" ALTER COLUMN "visibility" SET DEFAULT 'DM_ONLY';

DROP TYPE "Visibility_old";
