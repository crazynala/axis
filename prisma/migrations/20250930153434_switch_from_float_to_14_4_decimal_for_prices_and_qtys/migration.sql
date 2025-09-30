/*
  Warnings:

  - You are about to alter the column `quantity` on the `Assembly` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `qtyFabricConsumed` on the `AssemblyActivity` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `qtyFabricConsumedPerUnit` on the `AssemblyActivity` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantity` on the `AssemblyActivity` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantity` on the `Batch` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantityPerUnit` on the `Costing` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `unitCost` on the `Costing` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `salePricePerItem` on the `Costing` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `salePricePerUnit` on the `Costing` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `billedWeight` on the `DHLReportLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `billingExchangeRate` on the `DHLReportLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `totalRevenueEUR` on the `DHLReportLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `totalRevenueLCY` on the `DHLReportLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `totalTaxEUR` on the `DHLReportLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `totalTaxLCY` on the `DHLReportLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `priceCost` on the `Expense` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `priceSell` on the `Expense` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantity` on the `Expense` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `priceCost` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `priceSell` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `taxRateCopy` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `priceCost` on the `InvoiceLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `priceSell` on the `InvoiceLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantity` on the `InvoiceLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `invoicedTotalManual` on the `InvoiceLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `taxRateCopy` on the `InvoiceLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `costPrice` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `manualSalePrice` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `costPrice` on the `ProductCostGroup` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `sellPriceManual` on the `ProductCostGroup` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `costPrice` on the `ProductCostRange` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `sellPriceManual` on the `ProductCostRange` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantity` on the `ProductLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `unitCost` on the `ProductLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `unitCostManual` on the `ProductLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantity` on the `ProductMovement` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantity` on the `ProductMovementLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `priceCost` on the `PurchaseOrderLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `priceSell` on the `PurchaseOrderLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `qtyShipped` on the `PurchaseOrderLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `qtyReceived` on the `PurchaseOrderLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantity` on the `PurchaseOrderLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantityOrdered` on the `PurchaseOrderLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `taxRate` on the `PurchaseOrderLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `quantity` on the `ShipmentLine` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.
  - You are about to alter the column `value` on the `ValueList` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(14,4)`.

*/

-- Ensure dependent materialized view does not block type changes in shadow DB
DROP MATERIALIZED VIEW IF EXISTS product_stock_snapshot CASCADE;
-- AlterTable
ALTER TABLE "Assembly" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "AssemblyActivity" ALTER COLUMN "qtyFabricConsumed" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "qtyFabricConsumedPerUnit" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "Batch" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "Costing" ALTER COLUMN "quantityPerUnit" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "salePricePerItem" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "salePricePerUnit" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "DHLReportLine" ALTER COLUMN "billedWeight" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "billingExchangeRate" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "totalRevenueEUR" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "totalRevenueLCY" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "totalTaxEUR" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "totalTaxLCY" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "priceCost" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "priceSell" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "priceCost" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "priceSell" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "taxRateCopy" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "InvoiceLine" ALTER COLUMN "priceCost" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "priceSell" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "invoicedTotalManual" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "taxRateCopy" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "manualSalePrice" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "ProductCostGroup" ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "sellPriceManual" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "ProductCostRange" ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "sellPriceManual" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "ProductLine" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "unitCostManual" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "ProductMovement" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "ProductMovementLine" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "priceCost" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "priceSell" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "qtyShipped" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "qtyReceived" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "quantityOrdered" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "ShipmentLine" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "ValueList" ALTER COLUMN "value" SET DATA TYPE DECIMAL(14,4);

-- Recreate materialized view and indexes dropped above
CREATE MATERIALIZED VIEW product_stock_snapshot AS
WITH movement_rows AS (
  SELECT pm."productId"            AS product_id,
         lower(trim(COALESCE(pm."movementType", ''))) AS mt,
         pm."locationInId"         AS loc_in,
         pm."locationOutId"        AS loc_out,
         COALESCE(pm.quantity,0)    AS qty
  FROM "ProductMovement" pm
  WHERE pm."productId" IS NOT NULL
),
movement_contrib AS (
  -- Transfer split logic
  SELECT product_id, loc_in  AS location_id, ABS(qty)  AS qty FROM movement_rows WHERE mt = 'transfer' AND loc_in  IS NOT NULL
  UNION ALL
  SELECT product_id, loc_out AS location_id, -ABS(qty) AS qty FROM movement_rows WHERE mt = 'transfer' AND loc_out IS NOT NULL
  UNION ALL
  -- Non-transfer signed quantity applied to each present side
  SELECT product_id, loc_in  AS location_id, qty FROM movement_rows WHERE mt <> 'transfer' AND loc_in  IS NOT NULL
  UNION ALL
  SELECT product_id, loc_out AS location_id, qty FROM movement_rows WHERE mt <> 'transfer' AND loc_out IS NOT NULL
),
product_movement_totals AS (
  SELECT product_id, SUM(qty) AS mov_qty, COUNT(*) AS mov_n
  FROM (
    -- Collapse movement header representation into movement-based net qty using rules:
    -- For transfers net contribution is zero overall (handled by opposing +/- in contrib set), included for mov_n counting only.
    SELECT product_id,
           CASE WHEN mt = 'transfer' THEN 0 ELSE qty END AS qty
    FROM movement_rows
  ) t
  GROUP BY product_id
),
batch_rows AS (
  SELECT b.id AS batch_id, b."productId" AS product_id, b."locationId" AS location_id,
         COALESCE(b.quantity,0) AS batch_declared_qty,
         b."codeMill", b."codeSartor", b.name AS batch_name, b."receivedAt" AS received_at
  FROM "Batch" b
  WHERE b."productId" IS NOT NULL
),
movement_line_batch AS (
  SELECT pml."batchId" AS batch_id, pml."productId" AS product_id,
         COALESCE(pml.quantity,0) AS qty
  FROM "ProductMovementLine" pml
  WHERE pml."productId" IS NOT NULL AND pml."batchId" IS NOT NULL
),
batch_qty AS (
  SELECT br.batch_id,
         br.product_id,
         COALESCE(SUM(mlb.qty),0) AS line_qty,
         COUNT(mlb.qty) AS line_n
  FROM batch_rows br
  LEFT JOIN movement_line_batch mlb ON mlb.batch_id = br.batch_id
  GROUP BY br.batch_id, br.product_id
),
batch_effective AS (
  SELECT br.batch_id, br.product_id,
         CASE WHEN bq.line_n > 0 THEN bq.line_qty ELSE br.batch_declared_qty END AS qty,
         br.location_id, br."codeMill", br."codeSartor", br.batch_name, br.received_at
  FROM batch_rows br
  LEFT JOIN batch_qty bq ON bq.batch_id = br.batch_id
),
product_batch_totals AS (
  SELECT product_id, COALESCE(SUM(qty),0) AS batch_sum
  FROM batch_effective
  GROUP BY product_id
),
product_totals AS (
  SELECT pbt.product_id,
         CASE WHEN pmt.mov_n > 0 THEN pmt.mov_qty ELSE pbt.batch_sum END AS total_qty
  FROM product_batch_totals pbt
  LEFT JOIN product_movement_totals pmt ON pmt.product_id = pbt.product_id
)
SELECT
  pt.product_id,
  pt.total_qty,
  lc.location_id,
  COALESCE(l.name,'') AS location_name,
  COALESCE(SUM(lc.qty),0) AS location_qty,
  be.batch_id,
  COALESCE(be."codeMill", '')   AS code_mill,
  COALESCE(be."codeSartor", '') AS code_sartor,
  COALESCE(be.batch_name,'')     AS batch_name,
  be.received_at,
  be.location_id AS batch_location_id,
  COALESCE(bl.name,'') AS batch_location_name,
  COALESCE(be.qty,0) AS batch_qty
FROM product_totals pt
LEFT JOIN movement_contrib lc ON lc.product_id = pt.product_id
LEFT JOIN "Location" l ON l.id = lc.location_id
LEFT JOIN batch_effective be ON be.product_id = pt.product_id
LEFT JOIN "Location" bl ON bl.id = be.location_id
GROUP BY pt.product_id, pt.total_qty, lc.location_id, l.name, be.batch_id, be."codeMill", be."codeSartor", be.batch_name, be.received_at, be.location_id, bl.name, be.qty;

-- Indexes to accelerate lookups by product and joins on location or batch
CREATE INDEX idx_product_stock_snapshot_product ON product_stock_snapshot(product_id);
CREATE INDEX idx_product_stock_snapshot_product_location ON product_stock_snapshot(product_id, location_id);
CREATE INDEX idx_product_stock_snapshot_product_batch ON product_stock_snapshot(product_id, batch_id);
