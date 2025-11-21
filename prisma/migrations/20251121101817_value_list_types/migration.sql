/*
  Warnings:

  - Added the required column `type` to the `ValueList` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ValueListType" AS ENUM ('Tax', 'Category', 'ProductType', 'JobType', 'Currency', 'ShippingMethod');

-- AlterTable
ALTER TABLE "ValueList" ADD COLUMN     "parentId" INTEGER,
DROP COLUMN "type",
ADD COLUMN     "type" "ValueListType" NOT NULL;

-- AddForeignKey
ALTER TABLE "ValueList" ADD CONSTRAINT "ValueList_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
