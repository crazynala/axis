-- AlterTable
ALTER TABLE "AssemblyActivity" ADD COLUMN     "isProjected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceActivityId" INTEGER;

-- AlterTable
ALTER TABLE "AssemblySplitAllocation" ADD COLUMN     "finishBreakdown" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "washReceivedBreakdown" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "washSentBreakdown" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_sourceActivityId_fkey" FOREIGN KEY ("sourceActivityId") REFERENCES "AssemblyActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
