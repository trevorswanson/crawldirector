-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('CRAWLER', 'NPC', 'SPECIES', 'CLASS', 'PARTY', 'GUILD', 'FLOOR', 'NEIGHBORHOOD', 'LOCATION', 'BOSS', 'MOB_TYPE', 'FACTION', 'ORGANIZATION', 'SPONSOR', 'SHOW', 'SYSTEM_AI', 'ITEM', 'SKILL', 'SPELL', 'ACHIEVEMENT', 'TITLE', 'SYSTEM_MESSAGE', 'DEITY');

-- CreateEnum
CREATE TYPE "CanonStatus" AS ENUM ('DRAFT', 'PENDING', 'CANON', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('DM_ONLY', 'SHARED_WITH_PLAYERS', 'PLAYER_FACING');

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "CanonStatus" NOT NULL DEFAULT 'CANON',
    "visibility" "Visibility" NOT NULL DEFAULT 'DM_ONLY',
    "data" JSONB NOT NULL DEFAULT '{}',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isStub" BOOLEAN NOT NULL DEFAULT false,
    "agentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crawler" (
    "id" TEXT NOT NULL,
    "realName" TEXT,
    "crawlerNo" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "hp" INTEGER,
    "mp" INTEGER,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "fanCount" BIGINT NOT NULL DEFAULT 0,
    "killCount" INTEGER NOT NULL DEFAULT 0,
    "isAlive" BOOLEAN NOT NULL DEFAULT true,
    "currentFloor" INTEGER,

    CONSTRAINT "Crawler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Entity_campaignId_type_idx" ON "Entity"("campaignId", "type");

-- CreateIndex
CREATE INDEX "Entity_campaignId_status_idx" ON "Entity"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Entity_campaignId_name_idx" ON "Entity"("campaignId", "name");

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crawler" ADD CONSTRAINT "Crawler_id_fkey" FOREIGN KEY ("id") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
