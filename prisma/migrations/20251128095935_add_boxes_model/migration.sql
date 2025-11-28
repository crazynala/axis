-- CreateEnum
CREATE TYPE "BoxState" AS ENUM ('open', 'sealed', 'shipped');

-- CreateTable
CREATE TABLE "Box" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "warehouseNumber" INTEGER,
    "shipmentNumber" INTEGER,
    "locationId" INTEGER,
    "shipmentId" INTEGER,
    "companyId" INTEGER,
    "state" "BoxState" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoxLine" (
    "id" SERIAL NOT NULL,
    "boxId" INTEGER NOT NULL,
    "productId" INTEGER,
    "batchId" INTEGER,
    "jobId" INTEGER,
    "assemblyId" INTEGER,
    "shipmentLineId" INTEGER,
    "quantity" DECIMAL(14,4),
    "qtyBreakdown" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "notes" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "BoxLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Box_code_key" ON "Box"("code");

-- CreateIndex
CREATE INDEX "Box_locationId_idx" ON "Box"("locationId");

-- CreateIndex
CREATE INDEX "Box_shipmentId_idx" ON "Box"("shipmentId");

-- CreateIndex
CREATE INDEX "Box_companyId_idx" ON "Box"("companyId");

-- CreateIndex
CREATE INDEX "Box_warehouseNumber_idx" ON "Box"("warehouseNumber");

-- CreateIndex
CREATE INDEX "Box_shipmentNumber_shipmentId_idx" ON "Box"("shipmentNumber", "shipmentId");

-- CreateIndex
CREATE INDEX "Box_state_companyId_locationId_idx" ON "Box"("state", "companyId", "locationId");

-- CreateIndex
CREATE INDEX "BoxLine_boxId_idx" ON "BoxLine"("boxId");

-- CreateIndex
CREATE INDEX "BoxLine_productId_idx" ON "BoxLine"("productId");

-- CreateIndex
CREATE INDEX "BoxLine_batchId_idx" ON "BoxLine"("batchId");

-- CreateIndex
CREATE INDEX "BoxLine_jobId_idx" ON "BoxLine"("jobId");

-- CreateIndex
CREATE INDEX "BoxLine_assemblyId_idx" ON "BoxLine"("assemblyId");

-- CreateIndex
CREATE INDEX "BoxLine_shipmentLineId_idx" ON "BoxLine"("shipmentLineId");

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxLine" ADD CONSTRAINT "BoxLine_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxLine" ADD CONSTRAINT "BoxLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxLine" ADD CONSTRAINT "BoxLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxLine" ADD CONSTRAINT "BoxLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxLine" ADD CONSTRAINT "BoxLine_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxLine" ADD CONSTRAINT "BoxLine_shipmentLineId_fkey" FOREIGN KEY ("shipmentLineId") REFERENCES "ShipmentLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
