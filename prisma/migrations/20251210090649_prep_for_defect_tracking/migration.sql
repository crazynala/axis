/*
  Warnings:

  - The `type` column on the `Location` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "AssemblyStage" AS ENUM ('order', 'cut', 'make', 'pack', 'qc', 'other');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('normal', 'defect', 'rework');

-- CreateEnum
CREATE TYPE "DefectDisposition" AS ENUM ('none', 'scrap', 'offSpec', 'sample');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('warehouse', 'customer_depot', 'wip', 'sample', 'scrap', 'off_spec');

-- AlterEnum
ALTER TYPE "ValueListType" ADD VALUE 'DefectReason';

-- AlterTable
ALTER TABLE "AssemblyActivity" ADD COLUMN     "defectDisposition" "DefectDisposition" DEFAULT 'none',
ADD COLUMN     "defectReasonId" INTEGER,
ADD COLUMN     "kind" "ActivityKind",
ADD COLUMN     "stage" "AssemblyStage";

-- AlterTable
ALTER TABLE "Location" DROP COLUMN "type",
ADD COLUMN     "type" "LocationType";

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_defectReasonId_fkey" FOREIGN KEY ("defectReasonId") REFERENCES "ValueList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
