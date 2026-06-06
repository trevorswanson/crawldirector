-- CreateTable
CREATE TABLE "AiKey" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiKey_campaignId_idx" ON "AiKey"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AiKey_campaignId_providerId_key" ON "AiKey"("campaignId", "providerId");

-- AddForeignKey
ALTER TABLE "AiKey" ADD CONSTRAINT "AiKey_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiKey" ADD CONSTRAINT "AiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
