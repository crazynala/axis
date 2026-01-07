-- Increase precision for PO line pricing fields
ALTER TABLE "PurchaseOrderLine"
  ALTER COLUMN "priceCost" TYPE DECIMAL(18, 8),
  ALTER COLUMN "priceSell" TYPE DECIMAL(18, 8),
  ALTER COLUMN "manualCost" TYPE DECIMAL(18, 8),
  ALTER COLUMN "manualSell" TYPE DECIMAL(18, 8);
