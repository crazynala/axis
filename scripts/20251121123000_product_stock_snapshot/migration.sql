-- Materialized view for consolidated product stock snapshot
-- Provides: total quantity, per-location breakdown, per-batch breakdown
-- Strategy:
--   1. Base movement rows (excluding NULL productId) with normalized movement type.
--   2. Location contributions (transfer split into +/- ABS(qty); others signed).
--   3. Product total (movement-based). If a product has zero movement rows, we fall back to batch quantity sum.
--   4. Batch quantities aggregated from movement lines; fallback to Batch.quantity when no lines.
-- NOTE: Batch + location fallback logic for batches without movement lines uses LEFT JOIN to Batch table.
-- For now we refresh manually (or could add trigger later). Indexes added to speed typical lookups.

DROP MATERIALIZED VIEW IF EXISTS product_stock_snapshot CASCADE;

CREATE MATERIALIZED VIEW product_stock_snapshot AS
WITH movement_rows AS (
  SELECT pm.id                      AS movement_id,
         pm."productId"            AS product_id,
         lower(trim(COALESCE(pm."movementType", ''))) AS mt,
         pm."locationInId"         AS loc_in,
         pm."locationOutId"        AS loc_out,
         COALESCE(pm.quantity,0)    AS qty
  FROM "ProductMovement" pm
  WHERE pm."productId" IS NOT NULL
),
movement_contrib AS (
  -- Transfer-like split logic (explicit transfers + defect disposition moves)
  SELECT product_id, loc_in  AS location_id, ABS(qty)  AS qty
  FROM movement_rows
  WHERE (mt = 'transfer' OR mt = 'retain' OR mt LIKE 'defect_%') AND loc_in IS NOT NULL
  UNION ALL
  SELECT product_id, loc_out AS location_id, -ABS(qty) AS qty
  FROM movement_rows
  WHERE (mt = 'transfer' OR mt = 'retain' OR mt LIKE 'defect_%') AND loc_out IS NOT NULL
  UNION ALL
  -- Non-transfer signed quantity applied to each present side
  SELECT product_id, loc_in  AS location_id, qty
  FROM movement_rows
  WHERE mt <> 'transfer' AND mt <> 'retain' AND mt NOT LIKE 'defect_%' AND loc_in IS NOT NULL
  UNION ALL
  SELECT product_id, loc_out AS location_id, qty
  FROM movement_rows
  WHERE mt <> 'transfer' AND mt <> 'retain' AND mt NOT LIKE 'defect_%' AND loc_out IS NOT NULL
),
location_totals AS (
  SELECT product_id, location_id, COALESCE(SUM(qty),0) AS location_qty
  FROM movement_contrib
  GROUP BY product_id, location_id
),
product_movement_totals AS (
  SELECT product_id, SUM(qty) AS mov_qty, COUNT(*) AS mov_n
  FROM (
    -- Collapse movement header representation into movement-based net qty using rules:
    -- For transfers net contribution is zero overall (handled by opposing +/- in contrib set), included for mov_n counting only.
    SELECT product_id,
           CASE WHEN mt = 'transfer' OR mt = 'retain' OR mt LIKE 'defect_%' THEN 0 ELSE qty END AS qty
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
  SELECT pml."batchId" AS batch_id,
         pml."productId" AS product_id,
         COALESCE(pml.quantity,0) AS qty,
         mr.mt,
         mr.loc_in,
         mr.loc_out
  FROM "ProductMovementLine" pml
  JOIN movement_rows mr ON mr.movement_id = pml."movementId"
  WHERE pml."productId" IS NOT NULL AND pml."batchId" IS NOT NULL
),
batch_line_counts AS (
  SELECT batch_id, COUNT(*) AS line_n
  FROM movement_line_batch
  GROUP BY batch_id
),
batch_line_contrib AS (
  -- Transfer-like lines use the line sign to choose in vs out
  SELECT batch_id, product_id, loc_in AS location_id, ABS(qty) AS qty
  FROM movement_line_batch
  WHERE (mt = 'transfer' OR mt = 'retain' OR mt LIKE 'defect_%')
    AND loc_in IS NOT NULL
    AND qty >= 0
  UNION ALL
  SELECT batch_id, product_id, loc_out AS location_id, -ABS(qty) AS qty
  FROM movement_line_batch
  WHERE (mt = 'transfer' OR mt = 'retain' OR mt LIKE 'defect_%')
    AND loc_out IS NOT NULL
    AND qty < 0
  UNION ALL
  SELECT batch_id, product_id, loc_in AS location_id, qty
  FROM movement_line_batch
  WHERE mt <> 'transfer' AND mt <> 'retain' AND mt NOT LIKE 'defect_%' AND loc_in IS NOT NULL
  UNION ALL
  SELECT batch_id, product_id, loc_out AS location_id, qty
  FROM movement_line_batch
  WHERE mt <> 'transfer' AND mt <> 'retain' AND mt NOT LIKE 'defect_%' AND loc_out IS NOT NULL
),
batch_line_totals AS (
  SELECT batch_id, product_id, location_id, COALESCE(SUM(qty),0) AS qty
  FROM batch_line_contrib
  GROUP BY batch_id, product_id, location_id
),
batch_effective AS (
  SELECT bl.batch_id,
         bl.product_id,
         bl.location_id,
         bl.qty,
         br."codeMill", br."codeSartor", br.batch_name, br.received_at
  FROM batch_line_totals bl
  JOIN batch_rows br ON br.batch_id = bl.batch_id
  UNION ALL
  SELECT br.batch_id,
         br.product_id,
         br.location_id,
         br.batch_declared_qty AS qty,
         br."codeMill", br."codeSartor", br.batch_name, br.received_at
  FROM batch_rows br
  LEFT JOIN batch_line_counts blc ON blc.batch_id = br.batch_id
  WHERE COALESCE(blc.line_n,0) = 0
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
  lt.location_id,
  COALESCE(l.name,'') AS location_name,
  COALESCE(lt.location_qty,0) AS location_qty,
  be.batch_id,
  COALESCE(be."codeMill", '')   AS code_mill,
  COALESCE(be."codeSartor", '') AS code_sartor,
  COALESCE(be.batch_name,'')     AS batch_name,
  be.received_at,
  be.location_id AS batch_location_id,
  COALESCE(bl.name,'') AS batch_location_name,
  COALESCE(be.qty,0) AS batch_qty
FROM product_totals pt
LEFT JOIN location_totals lt ON lt.product_id = pt.product_id
LEFT JOIN "Location" l ON l.id = lt.location_id
LEFT JOIN batch_effective be ON be.product_id = pt.product_id
LEFT JOIN "Location" bl ON bl.id = be.location_id
GROUP BY pt.product_id, pt.total_qty, lt.location_id, l.name, lt.location_qty, be.batch_id, be."codeMill", be."codeSartor", be.batch_name, be.received_at, be.location_id, bl.name, be.qty;

-- Indexes to accelerate lookups by product and joins on location or batch
CREATE INDEX IF NOT EXISTS idx_product_stock_snapshot_product ON product_stock_snapshot(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_snapshot_product_location ON product_stock_snapshot(product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_snapshot_product_batch ON product_stock_snapshot(product_id, batch_id);
