-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "assemblyId" INTEGER,
ADD COLUMN     "jobId" INTEGER;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;
