-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OpKind" ADD VALUE 'CREATE_EVENT_CAUSALITY';
ALTER TYPE "OpKind" ADD VALUE 'DELETE_EVENT_CAUSALITY';

-- AlterTable
ALTER TABLE "Provenance" ADD COLUMN     "eventCausalityId" TEXT;

-- CreateTable
CREATE TABLE "EventCausality" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "causeId" TEXT NOT NULL,
    "effectId" TEXT NOT NULL,
    "weight" INTEGER,
    "note" TEXT,
    "source" "ChangeSource" NOT NULL DEFAULT 'DM',
    "status" "CanonStatus" NOT NULL DEFAULT 'CANON',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCausality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventCausality_campaignId_status_idx" ON "EventCausality"("campaignId", "status");

-- CreateIndex
CREATE INDEX "EventCausality_causeId_idx" ON "EventCausality"("causeId");

-- CreateIndex
CREATE INDEX "EventCausality_effectId_idx" ON "EventCausality"("effectId");

-- CreateIndex
CREATE UNIQUE INDEX "EventCausality_causeId_effectId_key" ON "EventCausality"("causeId", "effectId");

-- CreateIndex
CREATE INDEX "Provenance_eventCausalityId_idx" ON "Provenance"("eventCausalityId");

-- AddForeignKey
ALTER TABLE "EventCausality" ADD CONSTRAINT "EventCausality_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCausality" ADD CONSTRAINT "EventCausality_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCausality" ADD CONSTRAINT "EventCausality_effectId_fkey" FOREIGN KEY ("effectId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provenance" ADD CONSTRAINT "Provenance_eventCausalityId_fkey" FOREIGN KEY ("eventCausalityId") REFERENCES "EventCausality"("id") ON DELETE CASCADE ON UPDATE CASCADE;
