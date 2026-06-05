ALTER TABLE "Relationship" ADD COLUMN "sinceDay" INTEGER;
ALTER TABLE "Relationship" ADD COLUMN "untilDay" INTEGER;

CREATE INDEX "Relationship_campaignId_type_sinceDay_untilDay_idx" ON "Relationship"("campaignId", "type", "sinceDay", "untilDay");
