-- Drop legacy activityType column from AssemblyActivity
ALTER TABLE "AssemblyActivity" DROP COLUMN IF EXISTS "activityType";
