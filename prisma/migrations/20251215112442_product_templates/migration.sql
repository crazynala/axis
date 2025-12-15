/*
  Warnings:

  - You are about to drop the column `subCategory` on the `Product` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `Company` will be added. If there are existing duplicate values, this will fail.
  - Made the column `label` on table `ValueList` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'Packaging';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "subCategory",
ADD COLUMN     "externalStepType" "ExternalStepType",
ADD COLUMN     "subCategoryId" INTEGER,
ADD COLUMN     "templateId" INTEGER;

-- AlterTable
ALTER TABLE "ValueList" ALTER COLUMN "label" SET NOT NULL;

-- CreateTable
CREATE TABLE "ProductTemplate" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "defaultCategoryId" INTEGER,
    "defaultSubCategoryId" INTEGER,
    "defaultExternalStepType" "ExternalStepType",
    "requiresSupplier" BOOLEAN NOT NULL DEFAULT false,
    "requiresCustomer" BOOLEAN NOT NULL DEFAULT false,
    "defaultStockTracking" BOOLEAN NOT NULL DEFAULT false,
    "defaultBatchTracking" BOOLEAN NOT NULL DEFAULT false,
    "skuSeriesKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuSeriesCounter" (
    "id" SERIAL NOT NULL,
    "seriesKey" TEXT NOT NULL,
    "nextNum" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SkuSeriesCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductTemplate_code_key" ON "ProductTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SkuSeriesCounter_seriesKey_key" ON "SkuSeriesCounter"("seriesKey");

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProductTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplate" ADD CONSTRAINT "ProductTemplate_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplate" ADD CONSTRAINT "ProductTemplate_defaultSubCategoryId_fkey" FOREIGN KEY ("defaultSubCategoryId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
