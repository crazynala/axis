-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'SPLIT';

-- AlterTable
ALTER TABLE "AssemblyActivity" ADD COLUMN     "metaJson" JSONB;
