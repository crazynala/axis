-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('RECORDED', 'SENT_OUT', 'RECEIVED_IN', 'ADJUSTMENT', 'NOTE');

-- CreateEnum
CREATE TYPE "ExternalStepType" AS ENUM ('EMBROIDERY', 'WASH', 'DYE');

-- AlterTable
ALTER TABLE "AssemblyActivity" ADD COLUMN     "action" "ActivityAction",
ADD COLUMN     "externalStepType" "ExternalStepType",
ADD COLUMN     "vendorCompanyId" INTEGER;

-- AlterTable
ALTER TABLE "Costing" ADD COLUMN     "externalStepType" "ExternalStepType",
ADD COLUMN     "leadTimeDays" INTEGER;

-- CreateIndex
CREATE INDEX "AssemblyActivity_assemblyId_stage_activityDate_idx" ON "AssemblyActivity"("assemblyId", "stage", "activityDate");

-- CreateIndex
CREATE INDEX "AssemblyActivity_assemblyId_externalStepType_action_activit_idx" ON "AssemblyActivity"("assemblyId", "externalStepType", "action", "activityDate");

-- CreateIndex
CREATE INDEX "AssemblyActivity_vendorCompanyId_activityDate_idx" ON "AssemblyActivity"("vendorCompanyId", "activityDate");

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_vendorCompanyId_fkey" FOREIGN KEY ("vendorCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
