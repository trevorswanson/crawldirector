-- AlterTable
ALTER TABLE "ChangeSet" ADD COLUMN     "personaPromptVersion" INTEGER,
ADD COLUMN     "personaSnapshotId" TEXT;

-- AddForeignKey
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_personaSnapshotId_fkey" FOREIGN KEY ("personaSnapshotId") REFERENCES "PersonaSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
