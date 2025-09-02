-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('CMT', 'Fabric', 'Finished', 'Trim', 'Service');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('vendor', 'customer', 'other');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('cut', 'make');

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT,
    "description" TEXT,
    "type" "ProductType",
    "supplierId" INTEGER,
    "customerId" INTEGER,
    "costPrice" DOUBLE PRECISION,
    "currencyId" INTEGER,
    "purchaseTaxId" INTEGER,
    "categoryId" INTEGER,
    "subCategory" TEXT,
    "pricingGroupId" INTEGER,
    "manualSalePrice" DOUBLE PRECISION,
    "autoSalePrice" DOUBLE PRECISION,
    "variantSetId" INTEGER,
    "stockTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "batchTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN,
    "notes" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "type" "CompanyType",
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantSet" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "variants" TEXT[],

    CONSTRAINT "VariantSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPricingGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "supplierId" INTEGER,

    CONSTRAINT "SupplierPricingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValueList" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "label" TEXT,
    "value" DOUBLE PRECISION,
    "type" TEXT,

    CONSTRAINT "ValueList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assembly" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "jobId" INTEGER,

    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "jobId" INTEGER,
    "status" TEXT,
    "is_active" BOOLEAN,
    "notes" TEXT,
    "assemblyId" INTEGER,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Costing" (
    "id" SERIAL NOT NULL,
    "assemblyId" INTEGER,
    "componentId" INTEGER,
    "usageType" "UsageType",
    "componentType" "ProductType",
    "quantityPerUnit" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "notes" TEXT,
    "variantId" INTEGER,

    CONSTRAINT "Costing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductLine" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER,
    "childId" INTEGER,
    "quantity" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,

    CONSTRAINT "ProductLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "notes" TEXT,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "locationId" INTEGER,
    "assemblyId" INTEGER,
    "batchCode" TEXT,
    "quantity" DOUBLE PRECISION,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "variantId" INTEGER,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMovement" (
    "id" SERIAL NOT NULL,
    "movementType" TEXT,
    "date" TIMESTAMP(3),
    "locationId" INTEGER,
    "notes" TEXT,

    CONSTRAINT "ProductMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMovementLine" (
    "id" SERIAL NOT NULL,
    "movementId" INTEGER,
    "productId" INTEGER,
    "batchId" INTEGER,
    "quantity" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "ProductMovementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" TEXT,
    "is_active" BOOLEAN,
    "notes" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AssemblyToProduct" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "_AssemblyToProduct_AB_unique" ON "_AssemblyToProduct"("A", "B");

-- CreateIndex
CREATE INDEX "_AssemblyToProduct_B_index" ON "_AssemblyToProduct"("B");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_purchaseTaxId_fkey" FOREIGN KEY ("purchaseTaxId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_pricingGroupId_fkey" FOREIGN KEY ("pricingGroupId") REFERENCES "SupplierPricingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_variantSetId_fkey" FOREIGN KEY ("variantSetId") REFERENCES "VariantSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPricingGroup" ADD CONSTRAINT "SupplierPricingGroup_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Costing" ADD CONSTRAINT "Costing_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Costing" ADD CONSTRAINT "Costing_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Costing" ADD CONSTRAINT "Costing_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLine" ADD CONSTRAINT "ProductLine_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLine" ADD CONSTRAINT "ProductLine_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMovement" ADD CONSTRAINT "ProductMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMovementLine" ADD CONSTRAINT "ProductMovementLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "ProductMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMovementLine" ADD CONSTRAINT "ProductMovementLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMovementLine" ADD CONSTRAINT "ProductMovementLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssemblyToProduct" ADD CONSTRAINT "_AssemblyToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssemblyToProduct" ADD CONSTRAINT "_AssemblyToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
