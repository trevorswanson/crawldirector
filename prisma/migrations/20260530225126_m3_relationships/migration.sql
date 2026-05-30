-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('MEMBER_OF', 'LEADS', 'SPONSORS', 'EMPLOYS', 'ALLIED_WITH', 'RIVAL_OF', 'AT_WAR_WITH', 'PARENT_ORG_OF', 'USED_BY', 'MANIPULATES', 'CONTROLS', 'DEFIES', 'ALLY_OF', 'ENEMY_OF', 'MENTOR_OF', 'MANAGES', 'LOVES', 'FAMILY_OF', 'OWES', 'LOCATED_ON', 'PART_OF', 'CONTAINS', 'BOSS_OF', 'SPAWNS_ON', 'HAS_CLASS', 'HAS_SPECIES', 'OWNS_ITEM', 'KNOWS_SKILL', 'EARNED_ACHIEVEMENT', 'HOLDS_TITLE', 'APPEARS_ON', 'KNOWS_ABOUT', 'BETRAYED', 'KILLED', 'SAVED');

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "disposition" INTEGER,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "source" "ChangeSource" NOT NULL DEFAULT 'DM',
    "status" "CanonStatus" NOT NULL DEFAULT 'CANON',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Relationship_campaignId_sourceId_idx" ON "Relationship"("campaignId", "sourceId");

-- CreateIndex
CREATE INDEX "Relationship_campaignId_targetId_idx" ON "Relationship"("campaignId", "targetId");

-- CreateIndex
CREATE INDEX "Relationship_campaignId_type_idx" ON "Relationship"("campaignId", "type");

-- CreateIndex
CREATE INDEX "Relationship_campaignId_status_idx" ON "Relationship"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Provenance_relationshipId_idx" ON "Provenance"("relationshipId");

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provenance" ADD CONSTRAINT "Provenance_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
