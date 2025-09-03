-- AlterTable
ALTER TABLE "AssemblyActivity" ADD COLUMN     "qtyBreakdown" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
