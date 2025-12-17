-- Consolidate AppSetting data into Setting json entry and drop obsolete table
INSERT INTO "Setting" ("key", "json", "createdAt", "updatedAt")
SELECT 'materialCoverageTolerance',
       COALESCE("materialCoverageToleranceJson", '{}'::jsonb),
       COALESCE("createdAt", NOW()),
       NOW()
FROM "AppSetting"
ON CONFLICT ("key") DO UPDATE SET
  "json" = EXCLUDED."json",
  "updatedAt" = NOW();

DROP TABLE IF EXISTS "AppSetting";
