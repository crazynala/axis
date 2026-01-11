-- AlterTable
ALTER TABLE "AssemblyActivity" ADD COLUMN     "splitAllocationId" INTEGER;

-- CreateTable
CREATE TABLE "AssemblySplitGroup" (
    "id" SERIAL NOT NULL,
    "parentAssemblyId" INTEGER NOT NULL,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblySplitGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblySplitAllocation" (
    "id" SERIAL NOT NULL,
    "splitGroupId" INTEGER NOT NULL,
    "childAssemblyId" INTEGER NOT NULL,
    "allocatedBreakdown" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblySplitAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssemblySplitGroup_parentAssemblyId_idx" ON "AssemblySplitGroup"("parentAssemblyId");

-- CreateIndex
CREATE INDEX "AssemblySplitAllocation_childAssemblyId_idx" ON "AssemblySplitAllocation"("childAssemblyId");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblySplitAllocation_splitGroupId_childAssemblyId_key" ON "AssemblySplitAllocation"("splitGroupId", "childAssemblyId");

-- AddForeignKey
ALTER TABLE "AssemblySplitGroup" ADD CONSTRAINT "AssemblySplitGroup_parentAssemblyId_fkey" FOREIGN KEY ("parentAssemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblySplitAllocation" ADD CONSTRAINT "AssemblySplitAllocation_splitGroupId_fkey" FOREIGN KEY ("splitGroupId") REFERENCES "AssemblySplitGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblySplitAllocation" ADD CONSTRAINT "AssemblySplitAllocation_childAssemblyId_fkey" FOREIGN KEY ("childAssemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_splitAllocationId_fkey" FOREIGN KEY ("splitAllocationId") REFERENCES "AssemblySplitAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
