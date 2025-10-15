/*
  Warnings:

  - You are about to drop the column `salePricePerUnit` on the `Costing` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Costing" DROP COLUMN "salePricePerUnit",
ADD COLUMN     "costPricePerItem" DECIMAL(14,4);
