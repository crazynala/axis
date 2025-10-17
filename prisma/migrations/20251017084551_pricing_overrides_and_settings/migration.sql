-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "defaultMarginOverride" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "manualMargin" DECIMAL(14,4);

-- CreateTable
CREATE TABLE "VendorCustomerPricing" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "marginOverride" DECIMAL(14,4),
    "priceMultiplier" DECIMAL(14,4),
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
CREATE INDEX "VendorCustomerPricing_customerId_idx" ON "VendorCustomerPricing"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCustomerPricing_vendorId_customerId_key" ON "VendorCustomerPricing"("vendorId", "customerId");

-- AddForeignKey
ALTER TABLE "VendorCustomerPricing" ADD CONSTRAINT "VendorCustomerPricing_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCustomerPricing" ADD CONSTRAINT "VendorCustomerPricing_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
