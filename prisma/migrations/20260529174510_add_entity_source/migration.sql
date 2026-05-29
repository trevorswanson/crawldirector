-- AlterTable
ALTER TABLE "Entity" ADD COLUMN     "source" "ChangeSource" NOT NULL DEFAULT 'DM';

-- CreateIndex
CREATE INDEX "Entity_campaignId_source_idx" ON "Entity"("campaignId", "source");
