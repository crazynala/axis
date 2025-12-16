-- CreateEnum
CREATE TYPE "MaterialDemandSource" AS ENUM ('BOM', 'IMPORT', 'MANUAL');

-- CreateTable
CREATE TABLE "MaterialDemand" (
    "id" SERIAL NOT NULL,
    "assemblyId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "costingId" INTEGER,
    "qtyRequired" DECIMAL(14,4),
    "uom" TEXT,
    "source" "MaterialDemandSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialDemand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyReservation" (
    "id" SERIAL NOT NULL,
    "assemblyId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "purchaseOrderLineId" INTEGER,
    "inventoryBatchId" INTEGER,
    "qtyReserved" DECIMAL(14,4) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialDemand_assemblyId_idx" ON "MaterialDemand"("assemblyId");

-- CreateIndex
CREATE INDEX "MaterialDemand_productId_idx" ON "MaterialDemand"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialDemand_assemblyId_productId_costingId_key" ON "MaterialDemand"("assemblyId", "productId", "costingId");

-- CreateIndex
CREATE INDEX "SupplyReservation_assemblyId_idx" ON "SupplyReservation"("assemblyId");

-- CreateIndex
CREATE INDEX "SupplyReservation_productId_idx" ON "SupplyReservation"("productId");

-- CreateIndex
CREATE INDEX "SupplyReservation_purchaseOrderLineId_idx" ON "SupplyReservation"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "SupplyReservation_inventoryBatchId_idx" ON "SupplyReservation"("inventoryBatchId");

-- AddForeignKey
ALTER TABLE "MaterialDemand" ADD CONSTRAINT "MaterialDemand_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDemand" ADD CONSTRAINT "MaterialDemand_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDemand" ADD CONSTRAINT "MaterialDemand_costingId_fkey" FOREIGN KEY ("costingId") REFERENCES "Costing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyReservation" ADD CONSTRAINT "SupplyReservation_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyReservation" ADD CONSTRAINT "SupplyReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyReservation" ADD CONSTRAINT "SupplyReservation_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyReservation" ADD CONSTRAINT "SupplyReservation_inventoryBatchId_fkey" FOREIGN KEY ("inventoryBatchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
