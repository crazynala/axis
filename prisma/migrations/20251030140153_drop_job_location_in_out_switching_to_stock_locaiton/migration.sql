/*
  Warnings:

  - You are about to drop the column `locationInId` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `locationOutId` on the `Job` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_locationInId_fkey";

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_locationOutId_fkey";

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "locationInId",
DROP COLUMN "locationOutId";
