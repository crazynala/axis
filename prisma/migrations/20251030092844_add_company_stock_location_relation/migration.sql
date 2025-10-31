-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "stockLocationId" INTEGER;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
