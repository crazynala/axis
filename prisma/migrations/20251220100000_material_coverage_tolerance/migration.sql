-- AlterTable
ALTER TABLE "Assembly" ADD COLUMN     "materialCoverageTolerancePct" DECIMAL(8, 6),
ADD COLUMN     "materialCoverageToleranceAbs" DECIMAL(14, 4);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" SERIAL PRIMARY KEY,
    "materialCoverageToleranceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default tolerance values
INSERT INTO "AppSetting" ("materialCoverageToleranceJson")
VALUES (
  '{
    "default": { "pct": 0.01, "abs": 0 },
    "FABRIC": { "pct": 0.03, "abs": 5 },
    "TRIM": { "pct": 0.02, "abs": 10 },
    "PACKAGING": { "pct": 0.02, "abs": 25 }
  }'
);
