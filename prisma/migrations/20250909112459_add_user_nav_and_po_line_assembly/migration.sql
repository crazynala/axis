-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "assemblyId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "desktopNavOpened" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;
