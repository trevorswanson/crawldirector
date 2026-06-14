-- CreateTable
CREATE TABLE "SearchDoc" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'DM_ONLY',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchDoc_campaignId_targetType_idx" ON "SearchDoc"("campaignId", "targetType");

-- CreateIndex
CREATE UNIQUE INDEX "SearchDoc_targetType_targetId_key" ON "SearchDoc"("targetType", "targetId");
