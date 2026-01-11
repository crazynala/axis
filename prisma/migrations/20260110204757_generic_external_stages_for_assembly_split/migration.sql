/*
  Warnings:

  - You are about to drop the column `washReceivedBreakdown` on the `AssemblySplitAllocation` table. All the data in the column will be lost.
  - You are about to drop the column `washSentBreakdown` on the `AssemblySplitAllocation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AssemblySplitAllocation" DROP COLUMN "washReceivedBreakdown",
DROP COLUMN "washSentBreakdown",
ADD COLUMN     "externalAllocations" JSONB;
