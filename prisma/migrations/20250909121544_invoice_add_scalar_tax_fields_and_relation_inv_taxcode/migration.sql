-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "priceCost" DOUBLE PRECISION,
ADD COLUMN     "priceSell" DOUBLE PRECISION,
ADD COLUMN     "productNameCopy" TEXT,
ADD COLUMN     "productSkuCopy" TEXT,
ADD COLUMN     "taxCodeId" INTEGER,
ADD COLUMN     "taxRateCopy" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
