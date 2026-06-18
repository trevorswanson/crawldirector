-- CreateTable
CREATE TABLE "Faction" (
    "id" TEXT NOT NULL,
    "standing" INTEGER,
    "strength" INTEGER,
    "allegiance" TEXT,
    "resources" TEXT,

    CONSTRAINT "Faction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Faction_standing_idx" ON "Faction"("standing");

-- CreateIndex
CREATE INDEX "Faction_strength_idx" ON "Faction"("strength");

-- AddForeignKey
ALTER TABLE "Faction" ADD CONSTRAINT "Faction_id_fkey" FOREIGN KEY ("id") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
