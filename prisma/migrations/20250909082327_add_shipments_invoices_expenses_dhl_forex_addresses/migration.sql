-- CreateTable
CREATE TABLE "DHLReportLine" (
    "id" INTEGER NOT NULL,
    "accountName" TEXT,
    "awbNumber" TEXT,
    "billedWeight" DOUBLE PRECISION,
    "billingAccountNumber" TEXT,
    "billingExchangeRate" DOUBLE PRECISION,
    "destinationCountryCode" TEXT,
    "destinationCountryName" TEXT,
    "destinationServiceAreaCode" TEXT,
    "destinationServiceAreaName" TEXT,
    "globalProductCode" TEXT,
    "globalProductName" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceNumber" TEXT,
    "numberOfPieces" INTEGER,
    "opsConsigneeContactName" TEXT,
    "opsConsigneeName" TEXT,
    "opsConsignorContactName" TEXT,
    "opsConsignorName" TEXT,
    "originCountryCode" TEXT,
    "originCountryName" TEXT,
    "originServiceAreaCode" TEXT,
    "originServiceAreaName" TEXT,
    "relativePeriod" TEXT,
    "shipmentPickUpDate" TIMESTAMP(3),
    "shipmentReference" TEXT,
    "shipperAccountNumber" TEXT,
    "totalRevenueEUR" DOUBLE PRECISION,
    "totalRevenueLCY" DOUBLE PRECISION,
    "totalTaxEUR" DOUBLE PRECISION,
    "totalTaxLCY" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "DHLReportLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForexLine" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currencyFrom" TEXT NOT NULL DEFAULT 'USD',
    "currencyTo" TEXT NOT NULL DEFAULT 'TRY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForexLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" INTEGER NOT NULL,
    "companyId" INTEGER,
    "invoiceCode" TEXT,
    "date" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" INTEGER NOT NULL,
    "costingId" INTEGER,
    "expenseId" INTEGER,
    "invoiceId" INTEGER,
    "jobId" INTEGER,
    "productId" INTEGER,
    "purchaseOrderLineId" INTEGER,
    "shippingIdActual" INTEGER,
    "shippingIdDuty" INTEGER,
    "category" TEXT,
    "details" TEXT,
    "subCategory" TEXT,
    "priceCost" DOUBLE PRECISION,
    "priceSell" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION,
    "taxCodeId" INTEGER,
    "taxRateCost" DOUBLE PRECISION,
    "invoicedTotalManual" DOUBLE PRECISION,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" INTEGER NOT NULL,
    "jobId" INTEGER,
    "productId" INTEGER,
    "purchaseOrderId" INTEGER,
    "shippingId" INTEGER,
    "category" TEXT,
    "date" TIMESTAMP(3),
    "details" TEXT,
    "memo" TEXT,
    "priceCost" DOUBLE PRECISION,
    "priceSell" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION,
    "source" TEXT,
    "subcategory" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" INTEGER NOT NULL,
    "addressIdShip" INTEGER,
    "companyIdCarrier" INTEGER,
    "companyIdReceiver" INTEGER,
    "companyIdSender" INTEGER,
    "locationId" INTEGER,
    "contactIdReceiver" INTEGER,
    "date" TIMESTAMP(3),
    "dateReceived" TIMESTAMP(3),
    "packingSlipCode" TEXT,
    "shipmentType" TEXT,
    "status" TEXT,
    "trackingNo" TEXT,
    "type" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLine" (
    "id" INTEGER NOT NULL,
    "assemblyId" INTEGER,
    "jobId" INTEGER,
    "locationId" INTEGER,
    "productId" INTEGER,
    "shippingId" INTEGER,
    "variantSetId" INTEGER,
    "category" TEXT,
    "details" TEXT,
    "quantity" DOUBLE PRECISION,
    "qtyBreakdown" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "status" TEXT,
    "subCategory" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ShipmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" INTEGER NOT NULL,
    "companyId" INTEGER,
    "contactId" INTEGER,
    "addressCountry" TEXT,
    "addressCountyState" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "addressLine3" TEXT,
    "addressTownCity" TEXT,
    "addressZipPostCode" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForexLine_date_currencyFrom_currencyTo_key" ON "ForexLine"("date", "currencyFrom", "currencyTo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceCode_key" ON "Invoice"("invoiceCode");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_costingId_fkey" FOREIGN KEY ("costingId") REFERENCES "Costing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_shippingId_fkey" FOREIGN KEY ("shippingId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_companyIdCarrier_fkey" FOREIGN KEY ("companyIdCarrier") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_companyIdReceiver_fkey" FOREIGN KEY ("companyIdReceiver") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_companyIdSender_fkey" FOREIGN KEY ("companyIdSender") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_addressIdShip_fkey" FOREIGN KEY ("addressIdShip") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shippingId_fkey" FOREIGN KEY ("shippingId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_variantSetId_fkey" FOREIGN KEY ("variantSetId") REFERENCES "VariantSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
