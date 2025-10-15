-- AlterTable
ALTER TABLE "Assembly" ADD COLUMN     "assemblyGroupId" INTEGER;

-- CreateTable
CREATE TABLE "AssemblyGroup" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER,
    "name" TEXT,
    "createdBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AssemblyGroup_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_assemblyGroupId_fkey" FOREIGN KEY ("assemblyGroupId") REFERENCES "AssemblyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyGroup" ADD CONSTRAINT "AssemblyGroup_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
