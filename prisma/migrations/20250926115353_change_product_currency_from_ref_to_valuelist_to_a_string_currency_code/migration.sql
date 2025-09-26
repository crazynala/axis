/*
  Warnings:

  - You are about to drop the column `currencyId` on the `Product` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_currencyId_fkey";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "currencyId",
ADD COLUMN     "costCurrency" TEXT DEFAULT 'USD';
