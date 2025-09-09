/*
  Warnings:

  - You are about to drop the column `endTime` on the `AssemblyActivity` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `AssemblyActivity` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `AssemblyActivity` table. All the data in the column will be lost.
  - You are about to drop the column `variantId` on the `Batch` table. All the data in the column will be lost.
  - You are about to drop the column `componentId` on the `Costing` table. All the data in the column will be lost.
  - You are about to drop the column `componentType` on the `Costing` table. All the data in the column will be lost.
  - You are about to drop the column `usageType` on the `Costing` table. All the data in the column will be lost.
  - You are about to drop the column `variantId` on the `Costing` table. All the data in the column will be lost.
  - You are about to drop the `Variant` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_variantId_fkey";

-- DropForeignKey
ALTER TABLE "Costing" DROP CONSTRAINT "Costing_componentId_fkey";

-- DropForeignKey
ALTER TABLE "Costing" DROP CONSTRAINT "Costing_variantId_fkey";

-- DropForeignKey
ALTER TABLE "Variant" DROP CONSTRAINT "Variant_assemblyId_fkey";

-- DropForeignKey
ALTER TABLE "Variant" DROP CONSTRAINT "Variant_jobId_fkey";

-- DropForeignKey
ALTER TABLE "Variant" DROP CONSTRAINT "Variant_productId_fkey";

-- AlterTable
ALTER TABLE "AssemblyActivity" DROP COLUMN "endTime",
DROP COLUMN "startTime",
DROP COLUMN "status";

-- AlterTable
ALTER TABLE "Batch" DROP COLUMN "variantId";

-- AlterTable
ALTER TABLE "Costing" DROP COLUMN "componentId",
DROP COLUMN "componentType",
DROP COLUMN "usageType",
DROP COLUMN "variantId",
ADD COLUMN     "productId" INTEGER;

-- DropTable
DROP TABLE "Variant";

-- AddForeignKey
ALTER TABLE "Costing" ADD CONSTRAINT "Costing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
