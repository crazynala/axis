/*
  Warnings:

  - You are about to drop the column `is_active` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `end_date` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `Variant` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[projectCode]` on the table `Job` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Assembly" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "quantity" DOUBLE PRECISION,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AssemblyActivity" ADD COLUMN     "activityDate" TIMESTAMP(3),
ADD COLUMN     "activityType" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "locationInId" INTEGER,
ADD COLUMN     "locationOutId" INTEGER,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "productId" INTEGER,
ADD COLUMN     "qtyFabricConsumed" DOUBLE PRECISION,
ADD COLUMN     "qtyFabricConsumedPerUnit" DOUBLE PRECISION,
ADD COLUMN     "quantity" DOUBLE PRECISION,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "is_active",
ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isActive" BOOLEAN,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Costing" ADD COLUMN     "activityUsed" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "flagAssembly" BOOLEAN,
ADD COLUMN     "flagDefinedInProduct" BOOLEAN,
ADD COLUMN     "flagIsBillableDefaultOrManual" BOOLEAN,
ADD COLUMN     "flagIsBillableManual" BOOLEAN,
ADD COLUMN     "flagIsInvoiceableManual" BOOLEAN,
ADD COLUMN     "flagStockTracked" BOOLEAN,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "salePricePerItem" DOUBLE PRECISION,
ADD COLUMN     "salePricePerUnit" DOUBLE PRECISION,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "end_date",
DROP COLUMN "is_active",
DROP COLUMN "start_date",
ADD COLUMN     "companyId" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "customerOrderDate" TIMESTAMP(3),
ADD COLUMN     "customerOrderDateManual" TIMESTAMP(3),
ADD COLUMN     "cutSubmissionDate" TIMESTAMP(3),
ADD COLUMN     "dropDeadDate" TIMESTAMP(3),
ADD COLUMN     "endCustomerName" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "finishDate" TIMESTAMP(3),
ADD COLUMN     "finishDateManual" TIMESTAMP(3),
ADD COLUMN     "firstInvoiceDate" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN,
ADD COLUMN     "jobType" TEXT,
ADD COLUMN     "locationInId" INTEGER,
ADD COLUMN     "locationOutId" INTEGER,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "projectCode" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "targetDate" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "is_active" BOOLEAN,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "type" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "is_active",
ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isActive" BOOLEAN,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductLine" ADD COLUMN     "activityUsed" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "flagAssemblyOmit" BOOLEAN,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "unitCostManual" DOUBLE PRECISION,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductMovement" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductMovementLine" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SavedView" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "modifiedBy" TEXT;

-- AlterTable
ALTER TABLE "SupplierPricingGroup" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ValueList" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Variant" DROP COLUMN "is_active",
ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isActive" BOOLEAN,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VariantSet" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "modifiedBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Job_projectCode_key" ON "Job"("projectCode");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_locationInId_fkey" FOREIGN KEY ("locationInId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_locationOutId_fkey" FOREIGN KEY ("locationOutId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_locationInId_fkey" FOREIGN KEY ("locationInId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_locationOutId_fkey" FOREIGN KEY ("locationOutId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
