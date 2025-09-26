/*
  Warnings:

  - You are about to drop the column `autoSalePrice` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Product" DROP COLUMN "autoSalePrice",
ADD COLUMN     "defaultCostQty" INTEGER NOT NULL DEFAULT 60;
