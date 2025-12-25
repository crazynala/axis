/*
  Warnings:

  - A unique constraint covering the columns `[shortCode]` on the table `Company` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "projectCodeNextNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "shortCode" TEXT,
ADD COLUMN     "shortName" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "endCustomerContactId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Company_shortCode_key" ON "Company"("shortCode");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_endCustomerContactId_fkey" FOREIGN KEY ("endCustomerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
