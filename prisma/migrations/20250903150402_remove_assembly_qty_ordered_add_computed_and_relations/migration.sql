-- AlterTable
ALTER TABLE "Assembly" ADD COLUMN     "qtyOrderedBreakdown" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "variantSetId" INTEGER;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_variantSetId_fkey" FOREIGN KEY ("variantSetId") REFERENCES "VariantSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
