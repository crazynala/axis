/*
  Warnings:

  - You are about to drop the column `flagIsBillableDefaultOrManual` on the `Costing` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Costing" DROP COLUMN "flagIsBillableDefaultOrManual";

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "invoicedPrice" DECIMAL(14,4);
