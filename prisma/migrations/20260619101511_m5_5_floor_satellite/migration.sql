-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "floorNumber" INTEGER,
    "theme" TEXT,
    "startDay" INTEGER,
    "collapseDay" INTEGER,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Floor_floorNumber_idx" ON "Floor"("floorNumber");

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_id_fkey" FOREIGN KEY ("id") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
