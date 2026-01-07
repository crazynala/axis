-- AlterTable
ALTER TABLE "ShipmentLine" ADD COLUMN     "purchaseOrderLineId" INTEGER;

-- CreateIndex
CREATE INDEX "ShipmentLine_purchaseOrderLineId_idx" ON "ShipmentLine"("purchaseOrderLineId");

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
