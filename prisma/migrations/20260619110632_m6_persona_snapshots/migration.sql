-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OpKind" ADD VALUE 'CREATE_PERSONA_SNAPSHOT';
ALTER TYPE "OpKind" ADD VALUE 'UPDATE_PERSONA_SNAPSHOT';

-- CreateTable
CREATE TABLE "PersonaSnapshot" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT,
    "inGameTime" JSONB NOT NULL DEFAULT '{}',
    "orderKey" DOUBLE PRECISION,
    "dials" JSONB NOT NULL DEFAULT '{}',
    "values" JSONB NOT NULL DEFAULT '[]',
    "agendas" JSONB NOT NULL DEFAULT '[]',
    "resources" JSONB NOT NULL DEFAULT '{}',
    "knowledgeScope" TEXT NOT NULL DEFAULT 'OMNISCIENT',
    "voiceGuide" TEXT,
    "constraints" TEXT,
    "compiledPrompt" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "source" "ChangeSource" NOT NULL DEFAULT 'DM',
    "status" "CanonStatus" NOT NULL DEFAULT 'CANON',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "promptLocked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonaSnapshot_campaignId_entityId_orderKey_idx" ON "PersonaSnapshot"("campaignId", "entityId", "orderKey");

-- CreateIndex
CREATE INDEX "PersonaSnapshot_campaignId_entityId_isActive_idx" ON "PersonaSnapshot"("campaignId", "entityId", "isActive");

-- CreateIndex
CREATE INDEX "PersonaSnapshot_campaignId_status_idx" ON "PersonaSnapshot"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Provenance_personaSnapshotId_idx" ON "Provenance"("personaSnapshotId");

-- AddForeignKey
ALTER TABLE "PersonaSnapshot" ADD CONSTRAINT "PersonaSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaSnapshot" ADD CONSTRAINT "PersonaSnapshot_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provenance" ADD CONSTRAINT "Provenance_personaSnapshotId_fkey" FOREIGN KEY ("personaSnapshotId") REFERENCES "PersonaSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
