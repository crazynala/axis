-- AlterTable
ALTER TABLE "PurchaseOrderLine"
    ADD COLUMN "etaDate" TIMESTAMP(3),
    ADD COLUMN "etaDateConfirmed" BOOLEAN DEFAULT false;
