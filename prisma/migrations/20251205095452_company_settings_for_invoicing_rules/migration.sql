-- CreateEnum
CREATE TYPE "InvoiceBillUpon" AS ENUM ('Ship', 'Make');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "invoiceBillUpon" "InvoiceBillUpon" DEFAULT 'Ship',
ADD COLUMN     "invoicePercentOnCut" DECIMAL(5,2),
ADD COLUMN     "invoicePercentOnOrder" DECIMAL(5,2);
