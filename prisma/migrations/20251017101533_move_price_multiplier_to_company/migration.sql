/*
  Warnings:

  - You are about to drop the column `priceMultiplier` on the `VendorCustomerPricing` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "priceMultiplier" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "VendorCustomerPricing" DROP COLUMN "priceMultiplier";
