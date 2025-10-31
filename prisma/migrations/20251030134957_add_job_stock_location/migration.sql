-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "stockLocationId" INTEGER;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
