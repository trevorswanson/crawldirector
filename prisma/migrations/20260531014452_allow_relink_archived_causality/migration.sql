-- DropIndex
DROP INDEX "EventCausality_causeId_effectId_key";

-- CreateIndex
CREATE INDEX "EventCausality_causeId_effectId_idx" ON "EventCausality"("causeId", "effectId");
