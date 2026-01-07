-- Add manual price fields for PurchaseOrderLine and backfill from legacy fields
ALTER TABLE "PurchaseOrderLine"
ADD COLUMN "manualCost" DECIMAL(14, 4),
ADD COLUMN "manualSell" DECIMAL(14, 4);

UPDATE "PurchaseOrderLine"
SET "manualCost" = "priceCost"
WHERE "manualCost" IS NULL
  AND "priceCost" IS NOT NULL;

UPDATE "PurchaseOrderLine"
SET "manualSell" = "priceSell"
WHERE "manualSell" IS NULL
  AND "priceSell" IS NOT NULL;
