-- AlterTable
ALTER TABLE "Assembly" ADD COLUMN     "primaryCostingId" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "primaryProductLineId" INTEGER;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_primaryProductLineId_fkey" FOREIGN KEY ("primaryProductLineId") REFERENCES "ProductLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_primaryCostingId_fkey" FOREIGN KEY ("primaryCostingId") REFERENCES "Costing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
