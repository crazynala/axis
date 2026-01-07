-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "etaConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "etaConfirmedByUserId" INTEGER;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_etaConfirmedByUserId_fkey" FOREIGN KEY ("etaConfirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
