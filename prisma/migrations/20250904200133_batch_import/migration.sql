/*
  Warnings:

  - You are about to drop the column `batchCode` on the `Batch` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Batch" DROP COLUMN "batchCode",
ADD COLUMN     "codeMill" TEXT,
ADD COLUMN     "codeSartor" TEXT;
