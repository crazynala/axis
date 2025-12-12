-- AlterEnum
ALTER TYPE "ValueListType" ADD VALUE 'AssemblyType';

-- AlterTable
ALTER TABLE "Assembly" ADD COLUMN     "assemblyType" TEXT DEFAULT 'Prod';
