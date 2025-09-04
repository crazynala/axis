-- AlterTable
ALTER TABLE "ProductMovementLine" ADD COLUMN     "costingId" INTEGER,
ADD COLUMN     "productBatchId" INTEGER,
ADD COLUMN     "productMovementId" INTEGER,
ADD COLUMN     "purchaseOrderLineId" INTEGER;
