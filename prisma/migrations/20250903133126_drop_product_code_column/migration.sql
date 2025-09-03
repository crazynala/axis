/*
  Warnings:

  - You are about to drop the column `code` on the `Product` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Product_code_key";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "code";
