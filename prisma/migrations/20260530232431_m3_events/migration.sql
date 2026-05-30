-- CreateEnum
CREATE TYPE "EventParticipantRole" AS ENUM ('ACTOR', 'TARGET', 'WITNESS', 'LOCATION', 'AFFECTED');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "inGameTime" JSONB NOT NULL DEFAULT '{}',
    "orderKey" INTEGER NOT NULL DEFAULT 0,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "source" "ChangeSource" NOT NULL DEFAULT 'DM',
    "status" "CanonStatus" NOT NULL DEFAULT 'CANON',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "role" "EventParticipantRole" NOT NULL DEFAULT 'ACTOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_campaignId_status_idx" ON "Event"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Event_campaignId_orderKey_idx" ON "Event"("campaignId", "orderKey");

-- CreateIndex
CREATE INDEX "EventParticipant_eventId_idx" ON "EventParticipant"("eventId");

-- CreateIndex
CREATE INDEX "EventParticipant_entityId_idx" ON "EventParticipant"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_entityId_role_key" ON "EventParticipant"("eventId", "entityId", "role");

-- CreateIndex
CREATE INDEX "Provenance_eventId_idx" ON "Provenance"("eventId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provenance" ADD CONSTRAINT "Provenance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
