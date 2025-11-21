-- CreateEnum
CREATE TYPE "ColorScheme" AS ENUM ('light', 'dark');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('CMT', 'Fabric', 'Finished', 'Trim', 'Service');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('vendor', 'customer', 'other');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('cut', 'make');

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
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "sku" TEXT,
    "name" TEXT,
    "description" TEXT,
    "type" "ProductType",
    "supplierId" INTEGER,
    "customerId" INTEGER,
    "costPrice" DECIMAL(14,4),
    "costCurrency" TEXT DEFAULT 'USD',
    "purchaseTaxId" INTEGER,
    "categoryId" INTEGER,
    "subCategory" TEXT,
    "pricingGroupId" INTEGER,
    "manualSalePrice" DECIMAL(14,4),
    "manualMargin" DECIMAL(14,4),
    "defaultCostQty" INTEGER NOT NULL DEFAULT 60,
    "variantSetId" INTEGER,
    "stockTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "batchTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN,
    "notes" TEXT,
    "nameUnaccented" TEXT,
    "descriptionUnaccented" TEXT,
    "notesUnaccented" TEXT,
    "costGroupId" INTEGER,
    "salePriceGroupId" INTEGER,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTag" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "isCarrier" BOOLEAN,
    "isCustomer" BOOLEAN,
    "isSupplier" BOOLEAN,
    "isInactive" BOOLEAN,
    "defaultMarginOverride" DECIMAL(14,4),
    "priceMultiplier" DECIMAL(14,4),
    "stockLocationId" INTEGER,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "nameUnaccented" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantSet" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "variants" TEXT[],
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "VariantSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPricingGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "supplierId" INTEGER,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierPricingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValueList" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "label" TEXT,
    "value" DECIMAL(14,4),
    "type" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ValueList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assembly" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "status" TEXT,
    "quantity" DECIMAL(14,4),
    "qtyOrderedBreakdown" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "notes" TEXT,
    "statusWhiteboard" TEXT,
    "jobId" INTEGER,
    "assemblyGroupId" INTEGER,
    "productId" INTEGER,
    "variantSetId" INTEGER,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "nameUnaccented" TEXT,
    "notesUnaccented" TEXT,

    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Costing" (
    "id" SERIAL NOT NULL,
    "assemblyId" INTEGER,
    "productId" INTEGER,
    "quantityPerUnit" DECIMAL(14,4),
    "unitCost" DECIMAL(14,4),
    "notes" TEXT,
    "activityUsed" TEXT,
    "costPricePerItem" DECIMAL(14,4),
    "salePricePerItem" DECIMAL(14,4),
    "salePriceGroupId" INTEGER,
    "manualSalePrice" DECIMAL(14,4),
    "manualMargin" DECIMAL(14,4),
    "flagAssembly" BOOLEAN,
    "flagDefinedInProduct" BOOLEAN,
    "flagIsBillableDefaultOrManual" BOOLEAN,
    "flagIsBillableManual" BOOLEAN,
    "flagIsInvoiceableManual" BOOLEAN,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Costing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductLine" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER,
    "childId" INTEGER,
    "quantity" DECIMAL(14,4),
    "unitCost" DECIMAL(14,4),
    "unitCostManual" DECIMAL(14,4),
    "activityUsed" TEXT,
    "flagAssemblyOmit" BOOLEAN,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ProductLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "type" TEXT,
    "is_active" BOOLEAN,
    "notes" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "locationId" INTEGER,
    "jobId" INTEGER,
    "assemblyId" INTEGER,
    "codeMill" TEXT,
    "codeSartor" TEXT,
    "name" TEXT,
    "source" TEXT,
    "quantity" DECIMAL(14,4),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMovement" (
    "id" SERIAL NOT NULL,
    "movementType" TEXT,
    "date" TIMESTAMP(3),
    "locationId" INTEGER,
    "assemblyActivityId" INTEGER,
    "assemblyId" INTEGER,
    "assemblyGroupId" INTEGER,
    "costingId" INTEGER,
    "expenseId" INTEGER,
    "jobId" INTEGER,
    "locationInId" INTEGER,
    "locationOutId" INTEGER,
    "shippingType" TEXT,
    "groupKey" TEXT,
    "productId" INTEGER,
    "quantity" DECIMAL(14,4),
    "purchaseOrderLineId" INTEGER,
    "shippingLineId" INTEGER,
    "notes" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ProductMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMovementLine" (
    "id" SERIAL NOT NULL,
    "movementId" INTEGER,
    "productId" INTEGER,
    "batchId" INTEGER,
    "costingId" INTEGER,
    "productMovementId" INTEGER,
    "purchaseOrderLineId" INTEGER,
    "quantity" DECIMAL(14,4),
    "notes" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ProductMovementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" SERIAL NOT NULL,
    "projectCode" TEXT,
    "name" TEXT,
    "description" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT,
    "jobType" TEXT,
    "isActive" BOOLEAN,
    "notes" TEXT,
    "statusWhiteboard" TEXT,
    "endCustomerName" TEXT,
    "companyId" INTEGER,
    "stockLocationId" INTEGER,
    "customerOrderDate" TIMESTAMP(3),
    "customerOrderDateManual" TIMESTAMP(3),
    "cutSubmissionDate" TIMESTAMP(3),
    "dropDeadDate" TIMESTAMP(3),
    "finishDate" TIMESTAMP(3),
    "finishDateManual" TIMESTAMP(3),
    "firstInvoiceDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "customerPoNum" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "nameUnaccented" TEXT,
    "descriptionUnaccented" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyGroup" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER,
    "name" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AssemblyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyActivity" (
    "id" SERIAL NOT NULL,
    "assemblyId" INTEGER,
    "jobId" INTEGER,
    "name" TEXT,
    "description" TEXT,
    "activityType" TEXT,
    "activityDate" TIMESTAMP(3),
    "groupKey" TEXT,
    "notes" TEXT,
    "productId" INTEGER,
    "locationInId" INTEGER,
    "locationOutId" INTEGER,
    "quantity" DECIMAL(14,4),
    "qtyFabricConsumed" DECIMAL(14,4),
    "qtyFabricConsumedPerUnit" DECIMAL(14,4),
    "qtyBreakdown" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AssemblyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "recordsPerPage" INTEGER NOT NULL DEFAULT 25,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "colorScheme" "ColorScheme" NOT NULL DEFAULT 'light',
    "desktopNavOpened" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "otp" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DHLReportLine" (
    "id" INTEGER NOT NULL,
    "accountName" TEXT,
    "awbNumber" TEXT,
    "billedWeight" DECIMAL(14,4),
    "billingAccountNumber" TEXT,
    "billingExchangeRate" DECIMAL(14,4),
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
    "totalRevenueEUR" DECIMAL(14,4),
    "totalRevenueLCY" DECIMAL(14,4),
    "totalTaxEUR" DECIMAL(14,4),
    "totalTaxLCY" DECIMAL(14,4),
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
    "productSkuCopy" TEXT,
    "productNameCopy" TEXT,
    "priceCost" DECIMAL(14,4),
    "priceSell" DECIMAL(14,4),
    "taxCodeId" INTEGER,
    "taxRateCopy" DECIMAL(14,4),
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
    "priceCost" DECIMAL(14,4),
    "priceSell" DECIMAL(14,4),
    "quantity" DECIMAL(14,4),
    "taxCodeId" INTEGER,
    "taxRateCopy" DECIMAL(14,4),
    "invoicedTotalManual" DECIMAL(14,4),
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
    "priceCost" DECIMAL(14,4),
    "priceSell" DECIMAL(14,4),
    "quantity" DECIMAL(14,4),
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
    "memo" TEXT,
    "shippingMethod" TEXT,
    "addressName" TEXT,
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

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLine" (
    "id" INTEGER NOT NULL,
    "assemblyId" INTEGER,
    "jobId" INTEGER,
    "locationId" INTEGER,
    "productId" INTEGER,
    "shipmentId" INTEGER,
    "variantSetId" INTEGER,
    "category" TEXT,
    "details" TEXT,
    "quantity" DECIMAL(14,4),
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
    "name" TEXT,
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

-- CreateTable
CREATE TABLE "Contact" (
    "id" INTEGER NOT NULL,
    "addressId" INTEGER,
    "companyId" INTEGER,
    "email" TEXT,
    "department" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "title" TEXT,
    "phoneDirect" TEXT,
    "phoneHome" TEXT,
    "phoneMobile" TEXT,
    "position" TEXT,
    "recordType" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" INTEGER NOT NULL,
    "companyId" INTEGER,
    "consigneeCompanyId" INTEGER,
    "locationId" INTEGER,
    "date" TIMESTAMP(3),
    "memo" TEXT,
    "status" TEXT,
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
    "assemblyId" INTEGER,
    "productId" INTEGER,
    "productSkuCopy" TEXT,
    "productNameCopy" TEXT,
    "priceCost" DECIMAL(14,4),
    "priceSell" DECIMAL(14,4),
    "qtyShipped" DECIMAL(14,4),
    "qtyReceived" DECIMAL(14,4),
    "quantity" DECIMAL(14,4),
    "quantityOrdered" DECIMAL(14,4),
    "taxCode" TEXT,
    "taxRate" DECIMAL(14,4),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCostGroup" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER,
    "currency" TEXT,
    "name" TEXT,
    "costPrice" DECIMAL(14,4),
    "sellPriceManual" DECIMAL(14,4),
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ProductCostGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCostRange" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "costGroupId" INTEGER,
    "costPrice" DECIMAL(14,4),
    "sellPriceManual" DECIMAL(14,4),
    "rangeFrom" INTEGER,
    "rangeTo" INTEGER,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ProductCostRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalePriceGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "currency" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "SalePriceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalePriceRange" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "saleGroupId" INTEGER,
    "price" DECIMAL(14,4),
    "rangeFrom" INTEGER,
    "rangeTo" INTEGER,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "SalePriceRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCustomerPricing" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "marginOverride" DECIMAL(14,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorCustomerPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "number" DECIMAL(14,4),
    "json" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
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
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "ProductTag_tagId_idx" ON "ProductTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTag_productId_tagId_key" ON "ProductTag"("productId", "tagId");

-- CreateIndex
CREATE INDEX "idx_product_movement_product_id" ON "ProductMovement"("productId");

-- CreateIndex
CREATE INDEX "idx_product_movement_product_date_id" ON "ProductMovement"("productId", "date", "id");

-- CreateIndex
CREATE INDEX "idx_product_movement_line_product_id" ON "ProductMovementLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ForexLine_date_currencyFrom_currencyTo_key" ON "ForexLine"("date", "currencyFrom", "currencyTo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceCode_key" ON "Invoice"("invoiceCode");

-- CreateIndex
CREATE INDEX "ProductCostGroup_supplierId_idx" ON "ProductCostGroup"("supplierId");

-- CreateIndex
CREATE INDEX "ProductCostRange_productId_idx" ON "ProductCostRange"("productId");

-- CreateIndex
CREATE INDEX "ProductCostRange_costGroupId_idx" ON "ProductCostRange"("costGroupId");

-- CreateIndex
CREATE INDEX "SalePriceRange_productId_idx" ON "SalePriceRange"("productId");

-- CreateIndex
CREATE INDEX "SalePriceRange_saleGroupId_idx" ON "SalePriceRange"("saleGroupId");

-- CreateIndex
CREATE INDEX "VendorCustomerPricing_customerId_idx" ON "VendorCustomerPricing"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCustomerPricing_vendorId_customerId_key" ON "VendorCustomerPricing"("vendorId", "customerId");

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
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_purchaseTaxId_fkey" FOREIGN KEY ("purchaseTaxId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_pricingGroupId_fkey" FOREIGN KEY ("pricingGroupId") REFERENCES "SupplierPricingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_costGroupId_fkey" FOREIGN KEY ("costGroupId") REFERENCES "ProductCostGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_salePriceGroupId_fkey" FOREIGN KEY ("salePriceGroupId") REFERENCES "SalePriceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_variantSetId_fkey" FOREIGN KEY ("variantSetId") REFERENCES "VariantSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TagDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPricingGroup" ADD CONSTRAINT "SupplierPricingGroup_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_assemblyGroupId_fkey" FOREIGN KEY ("assemblyGroupId") REFERENCES "AssemblyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_variantSetId_fkey" FOREIGN KEY ("variantSetId") REFERENCES "VariantSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Costing" ADD CONSTRAINT "Costing_salePriceGroupId_fkey" FOREIGN KEY ("salePriceGroupId") REFERENCES "SalePriceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Costing" ADD CONSTRAINT "Costing_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Costing" ADD CONSTRAINT "Costing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLine" ADD CONSTRAINT "ProductLine_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLine" ADD CONSTRAINT "ProductLine_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMovement" ADD CONSTRAINT "ProductMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMovementLine" ADD CONSTRAINT "ProductMovementLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "ProductMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMovementLine" ADD CONSTRAINT "ProductMovementLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMovementLine" ADD CONSTRAINT "ProductMovementLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyGroup" ADD CONSTRAINT "AssemblyGroup_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_locationInId_fkey" FOREIGN KEY ("locationInId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_locationOutId_fkey" FOREIGN KEY ("locationOutId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_variantSetId_fkey" FOREIGN KEY ("variantSetId") REFERENCES "VariantSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostGroup" ADD CONSTRAINT "ProductCostGroup_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostRange" ADD CONSTRAINT "ProductCostRange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostRange" ADD CONSTRAINT "ProductCostRange_costGroupId_fkey" FOREIGN KEY ("costGroupId") REFERENCES "ProductCostGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePriceRange" ADD CONSTRAINT "SalePriceRange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePriceRange" ADD CONSTRAINT "SalePriceRange_saleGroupId_fkey" FOREIGN KEY ("saleGroupId") REFERENCES "SalePriceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCustomerPricing" ADD CONSTRAINT "VendorCustomerPricing_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCustomerPricing" ADD CONSTRAINT "VendorCustomerPricing_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
