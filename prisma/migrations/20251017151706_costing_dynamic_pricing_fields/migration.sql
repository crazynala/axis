-- AlterTable
ALTER TABLE "Costing" ADD COLUMN     "manualMargin" DECIMAL(14,4),
ADD COLUMN     "manualSalePrice" DECIMAL(14,4),
ADD COLUMN     "salePriceGroupId" INTEGER;

-- AddForeignKey
ALTER TABLE "Costing" ADD CONSTRAINT "Costing_salePriceGroupId_fkey" FOREIGN KEY ("salePriceGroupId") REFERENCES "SalePriceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
