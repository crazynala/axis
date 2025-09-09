-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" INTEGER NOT NULL,
    "companyId" INTEGER,
    "consigneeCompanyId" INTEGER,
    "locationId" INTEGER,
    "date" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" INTEGER NOT NULL,
    "purchaseOrderId" INTEGER,
    "jobId" INTEGER,
    "productId" INTEGER,
    "productSkuCopy" TEXT,
    "productNameCopy" TEXT,
    "priceCost" DOUBLE PRECISION,
    "priceSell" DOUBLE PRECISION,
    "qtyShipped" DOUBLE PRECISION,
    "qtyReceived" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION,
    "quantityOrdered" DOUBLE PRECISION,
    "taxCodeId" INTEGER,
    "taxRate" DOUBLE PRECISION,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_consigneeCompanyId_fkey" FOREIGN KEY ("consigneeCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
