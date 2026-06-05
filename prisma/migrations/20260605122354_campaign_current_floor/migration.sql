-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "currentFloorId" TEXT;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_currentFloorId_fkey" FOREIGN KEY ("currentFloorId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
