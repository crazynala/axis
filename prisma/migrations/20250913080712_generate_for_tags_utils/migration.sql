-- CreateEnum
CREATE TYPE "TagScope" AS ENUM ('GLOBAL', 'USER');

-- CreateTable
CREATE TABLE "JobTag" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "JobTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyTag" (
    "id" SERIAL NOT NULL,
    "assemblyId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "AssemblyTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostingTag" (
    "id" SERIAL NOT NULL,
    "costingId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "CostingTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentTag" (
    "id" SERIAL NOT NULL,
    "shipmentId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "ShipmentTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderTag" (
    "id" SERIAL NOT NULL,
    "purchaseOrderId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "PurchaseOrderTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagDefinition" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "TagScope" NOT NULL,
    "ownerId" INTEGER,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TagDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTag" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobTag_tagId_idx" ON "JobTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "JobTag_jobId_tagId_key" ON "JobTag"("jobId", "tagId");

-- CreateIndex
CREATE INDEX "AssemblyTag_tagId_idx" ON "AssemblyTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyTag_assemblyId_tagId_key" ON "AssemblyTag"("assemblyId", "tagId");

-- CreateIndex
CREATE INDEX "CostingTag_tagId_idx" ON "CostingTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CostingTag_costingId_tagId_key" ON "CostingTag"("costingId", "tagId");

-- CreateIndex
CREATE INDEX "ShipmentTag_tagId_idx" ON "ShipmentTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentTag_shipmentId_tagId_key" ON "ShipmentTag"("shipmentId", "tagId");

-- CreateIndex
CREATE INDEX "PurchaseOrderTag_tagId_idx" ON "PurchaseOrderTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderTag_purchaseOrderId_tagId_key" ON "PurchaseOrderTag"("purchaseOrderId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "TagDefinition_name_scope_ownerId_key" ON "TagDefinition"("name", "scope", "ownerId");

-- CreateIndex
CREATE INDEX "ProductTag_tagId_idx" ON "ProductTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTag_productId_tagId_key" ON "ProductTag"("productId", "tagId");

-- AddForeignKey
ALTER TABLE "JobTag" ADD CONSTRAINT "JobTag_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTag" ADD CONSTRAINT "JobTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TagDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyTag" ADD CONSTRAINT "AssemblyTag_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyTag" ADD CONSTRAINT "AssemblyTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TagDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostingTag" ADD CONSTRAINT "CostingTag_costingId_fkey" FOREIGN KEY ("costingId") REFERENCES "Costing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostingTag" ADD CONSTRAINT "CostingTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TagDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentTag" ADD CONSTRAINT "ShipmentTag_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentTag" ADD CONSTRAINT "ShipmentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TagDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderTag" ADD CONSTRAINT "PurchaseOrderTag_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderTag" ADD CONSTRAINT "PurchaseOrderTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TagDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagDefinition" ADD CONSTRAINT "TagDefinition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TagDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
