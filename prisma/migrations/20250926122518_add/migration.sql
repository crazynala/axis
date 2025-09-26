-- CreateTable
CREATE TABLE "ProductCostGroup" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER,
    "currency" TEXT,
    "name" TEXT,
    "costPrice" DOUBLE PRECISION,
    "sellPriceManual" DOUBLE PRECISION,
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
    "costPrice" DOUBLE PRECISION,
    "sellPriceManual" DOUBLE PRECISION,
    "rangeFrom" INTEGER,
    "rangeTo" INTEGER,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ProductCostRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCostGroup_supplierId_idx" ON "ProductCostGroup"("supplierId");

-- CreateIndex
CREATE INDEX "ProductCostRange_productId_idx" ON "ProductCostRange"("productId");

-- CreateIndex
CREATE INDEX "ProductCostRange_costGroupId_idx" ON "ProductCostRange"("costGroupId");

-- AddForeignKey
ALTER TABLE "ProductCostGroup" ADD CONSTRAINT "ProductCostGroup_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostRange" ADD CONSTRAINT "ProductCostRange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCostRange" ADD CONSTRAINT "ProductCostRange_costGroupId_fkey" FOREIGN KEY ("costGroupId") REFERENCES "ProductCostGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
