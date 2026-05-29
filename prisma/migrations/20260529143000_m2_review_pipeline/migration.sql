-- CreateEnum
CREATE TYPE "ChangeSource" AS ENUM ('DM', 'AI', 'PLAYER_SUGGESTION', 'IMPORT');

-- CreateEnum
CREATE TYPE "ChangeSetStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PARTIALLY_APPLIED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "OpKind" AS ENUM ('CREATE_ENTITY', 'UPDATE_ENTITY', 'DELETE_ENTITY', 'CREATE_RELATIONSHIP', 'UPDATE_RELATIONSHIP', 'DELETE_RELATIONSHIP', 'CREATE_EVENT', 'UPDATE_EVENT', 'APPLY_EVENT_EFFECTS');

-- CreateEnum
CREATE TYPE "OpDecision" AS ENUM ('PENDING', 'ACCEPTED', 'EDITED', 'REJECTED');

-- CreateTable
CREATE TABLE "ChangeSet" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "source" "ChangeSource" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "ChangeSetStatus" NOT NULL DEFAULT 'PENDING',
    "actorUserId" TEXT,
    "providerId" TEXT,
    "model" TEXT,
    "promptId" TEXT,
    "promptVersion" TEXT,
    "runId" TEXT,
    "baseVersions" JSONB NOT NULL DEFAULT '{}',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOperation" (
    "id" TEXT NOT NULL,
    "changeSetId" TEXT NOT NULL,
    "op" "OpKind" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "patch" JSONB NOT NULL,
    "editedPatch" JSONB,
    "decision" "OpDecision" NOT NULL DEFAULT 'PENDING',
    "blockedByLock" BOOLEAN NOT NULL DEFAULT false,
    "isStale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChangeOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provenance" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "entityId" TEXT,
    "relationshipId" TEXT,
    "eventId" TEXT,
    "personaSnapshotId" TEXT,
    "changeSetId" TEXT NOT NULL,
    "source" "ChangeSource" NOT NULL,
    "field" TEXT,
    "actorUserId" TEXT,
    "providerId" TEXT,
    "model" TEXT,
    "promptId" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeSet_campaignId_status_idx" ON "ChangeSet"("campaignId", "status");

-- CreateIndex
CREATE INDEX "ChangeSet_actorUserId_idx" ON "ChangeSet"("actorUserId");

-- CreateIndex
CREATE INDEX "ChangeOperation_changeSetId_idx" ON "ChangeOperation"("changeSetId");

-- CreateIndex
CREATE INDEX "ChangeOperation_targetType_targetId_idx" ON "ChangeOperation"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Provenance_entityId_idx" ON "Provenance"("entityId");

-- CreateIndex
CREATE INDEX "Provenance_changeSetId_idx" ON "Provenance"("changeSetId");

-- CreateIndex
CREATE INDEX "AuditLog_campaignId_createdAt_idx" ON "AuditLog"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOperation" ADD CONSTRAINT "ChangeOperation_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provenance" ADD CONSTRAINT "Provenance_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provenance" ADD CONSTRAINT "Provenance_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provenance" ADD CONSTRAINT "Provenance_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provenance" ADD CONSTRAINT "Provenance_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
