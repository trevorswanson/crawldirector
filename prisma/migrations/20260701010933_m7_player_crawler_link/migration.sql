-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "crawlerEntityId" TEXT;

-- CreateIndex
CREATE INDEX "Membership_crawlerEntityId_idx" ON "Membership"("crawlerEntityId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_crawlerEntityId_fkey" FOREIGN KEY ("crawlerEntityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
