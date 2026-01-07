-- Add invoice tracking status to PurchaseOrder
CREATE TYPE "PurchaseOrderInvoiceTrackingStatus" AS ENUM ('UNKNOWN', 'NO_INVOICE_EXPECTED');

ALTER TABLE "PurchaseOrder"
ADD COLUMN "invoiceTrackingStatus" "PurchaseOrderInvoiceTrackingStatus" NOT NULL DEFAULT 'UNKNOWN';
