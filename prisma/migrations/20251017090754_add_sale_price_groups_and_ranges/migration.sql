-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "salePriceGroupId" INTEGER;

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

-- CreateIndex
CREATE INDEX "SalePriceRange_productId_idx" ON "SalePriceRange"("productId");

-- CreateIndex
CREATE INDEX "SalePriceRange_saleGroupId_idx" ON "SalePriceRange"("saleGroupId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_salePriceGroupId_fkey" FOREIGN KEY ("salePriceGroupId") REFERENCES "SalePriceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePriceRange" ADD CONSTRAINT "SalePriceRange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePriceRange" ADD CONSTRAINT "SalePriceRange_saleGroupId_fkey" FOREIGN KEY ("saleGroupId") REFERENCES "SalePriceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
