/*
  Warnings:

  - You are about to drop the column `taxCodeId` on the `PurchaseOrderLine` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "PurchaseOrderLine" DROP CONSTRAINT "PurchaseOrderLine_taxCodeId_fkey";

-- AlterTable
ALTER TABLE "PurchaseOrderLine" DROP COLUMN "taxCodeId",
ADD COLUMN     "taxCode" TEXT;
