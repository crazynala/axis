-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "costGroupId" INTEGER;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_costGroupId_fkey" FOREIGN KEY ("costGroupId") REFERENCES "ProductCostGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
