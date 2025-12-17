-- Create AssemblyGroupEvent table
CREATE TABLE "AssemblyGroupEvent" (
  "id" SERIAL PRIMARY KEY,
  "assemblyGroupId" INTEGER NOT NULL,
  "jobId" INTEGER,
  "type" TEXT NOT NULL,
  "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Foreign keys
ALTER TABLE "AssemblyGroupEvent"
  ADD CONSTRAINT "AssemblyGroupEvent_assemblyGroupId_fkey"
  FOREIGN KEY ("assemblyGroupId") REFERENCES "AssemblyGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssemblyGroupEvent"
  ADD CONSTRAINT "AssemblyGroupEvent_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Add assemblyGroupEventId to AssemblyActivity
ALTER TABLE "AssemblyActivity"
  ADD COLUMN "assemblyGroupEventId" INTEGER;

ALTER TABLE "AssemblyActivity"
  ADD CONSTRAINT "AssemblyActivity_assemblyGroupEventId_fkey"
  FOREIGN KEY ("assemblyGroupEventId") REFERENCES "AssemblyGroupEvent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AssemblyActivity_assemblyGroupEventId_idx"
  ON "AssemblyActivity"("assemblyGroupEventId");

-- Add assemblyGroupEventId to ProductMovement
ALTER TABLE "ProductMovement"
  ADD COLUMN "assemblyGroupEventId" INTEGER;

ALTER TABLE "ProductMovement"
  ADD CONSTRAINT "ProductMovement_assemblyGroupEventId_fkey"
  FOREIGN KEY ("assemblyGroupEventId") REFERENCES "AssemblyGroupEvent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProductMovement_assemblyGroupEventId_idx"
  ON "ProductMovement"("assemblyGroupEventId");

-- Index for AssemblyGroupEvent queries
CREATE INDEX "AssemblyGroupEvent_assemblyGroupId_eventDate_idx"
  ON "AssemblyGroupEvent"("assemblyGroupId", "eventDate");
