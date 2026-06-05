-- CreateEnum
CREATE TYPE "KnowledgeTargetType" AS ENUM ('ENTITY', 'ENTITY_FIELD', 'RELATIONSHIP', 'EVENT', 'FACT');

-- CreateEnum
CREATE TYPE "KnowledgeRecipientType" AS ENUM ('ENTITY', 'MEMBERSHIP');

-- CreateTable
CREATE TABLE "KnowledgeGrant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "targetType" "KnowledgeTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "field" TEXT,
    "factKey" TEXT,
    "recipientType" "KnowledgeRecipientType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "revealedById" TEXT NOT NULL,
    "revealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "KnowledgeGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeGrant_campaignId_recipientType_recipientId_idx" ON "KnowledgeGrant"("campaignId", "recipientType", "recipientId");

-- CreateIndex
CREATE INDEX "KnowledgeGrant_campaignId_targetType_targetId_idx" ON "KnowledgeGrant"("campaignId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "KnowledgeGrant" ADD CONSTRAINT "KnowledgeGrant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
