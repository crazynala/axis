ALTER TABLE "SupplyReservation" ADD COLUMN "settledAt" TIMESTAMP(3);

CREATE TABLE "OperationLog" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" INTEGER,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "OperationLog_action_idx" ON "OperationLog"("action");
CREATE INDEX "OperationLog_entityType_entityId_idx" ON "OperationLog"("entityType", "entityId");

ALTER TABLE "OperationLog"
  ADD CONSTRAINT "OperationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
