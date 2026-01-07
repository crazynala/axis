-- CreateEnum
CREATE TYPE "SupplierInvoiceType" AS ENUM ('INVOICE', 'CREDIT_MEMO');

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER,
    "purchaseOrderId" INTEGER,
    "invoiceDate" TIMESTAMP(3),
    "supplierInvoiceNo" TEXT,
    "type" "SupplierInvoiceType",
    "totalExTax" DECIMAL(14,4),
    "taxCode" TEXT,
    "legacySerial" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoice_legacySerial_key" ON "SupplierInvoice"("legacySerial");

-- CreateIndex
CREATE INDEX "SupplierInvoice_purchaseOrderId_idx" ON "SupplierInvoice"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
