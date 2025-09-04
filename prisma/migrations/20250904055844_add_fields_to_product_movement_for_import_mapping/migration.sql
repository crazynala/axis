-- AlterTable
ALTER TABLE "ProductMovement" ADD COLUMN     "assemblyActivityId" INTEGER,
ADD COLUMN     "assemblyId" INTEGER,
ADD COLUMN     "costingId" INTEGER,
ADD COLUMN     "expenseId" INTEGER,
ADD COLUMN     "jobId" INTEGER,
ADD COLUMN     "locationInId" INTEGER,
ADD COLUMN     "locationOutId" INTEGER,
ADD COLUMN     "productId" INTEGER,
ADD COLUMN     "purchaseOrderLineId" INTEGER,
ADD COLUMN     "quantity" DOUBLE PRECISION,
ADD COLUMN     "shippingLineId" INTEGER,
ADD COLUMN     "shippingType" TEXT;
