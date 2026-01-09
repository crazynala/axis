import type { DebugExplainPayload } from "~/modules/debug/types";
import { getDebugVersion } from "~/modules/debug/debugUtils.server";
import { getMovementLabel } from "~/utils/movementLabels";
import { getProductStockSnapshots, prisma } from "~/utils/prisma.server";

type ProductStockDebugParams = {
  limit?: number;
  cursor?: string | null;
  includeSnapshot?: boolean;
  includeLedger?: boolean;
  includeReconciliation?: boolean;
};

type MovementRow = {
  id: number;
  movementType: string | null;
  createdAt: Date | null;
  createdBy: string | null;
  locationOutId: number | null;
  locationInId: number | null;
  quantity: any;
  assemblyActivityId: number | null;
  assemblyId: number | null;
  jobId: number | null;
  purchaseOrderLineId: number | null;
  shippingLineId: number | null;
  expenseId: number | null;
  costingId: number | null;
  lines: Array<{
    id: number;
    batchId: number | null;
    quantity: any;
    batch: {
      id: number;
      codeMill: string | null;
      codeSartor: string | null;
      name: string | null;
    } | null;
  }>;
};

export async function buildProductStockDebug(
  productId: number,
  params?: ProductStockDebugParams
): Promise<DebugExplainPayload | null> {
  const startedAt = Date.now();
  const limitRaw = Number(params?.limit ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 200;
  const includeSnapshot = params?.includeSnapshot !== false;
  const includeLedger = params?.includeLedger !== false;
  const includeReconciliation = params?.includeReconciliation !== false;
  const cursorRaw = params?.cursor ?? null;
  const cursorId =
    cursorRaw && Number.isFinite(Number(cursorRaw)) ? Number(cursorRaw) : null;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      sku: true,
      name: true,
      type: true,
      stockTrackingEnabled: true,
      batchTrackingEnabled: true,
    },
  });
  if (!product) return null;

  const movementRows: MovementRow[] = includeLedger
    ? await prisma.productMovement.findMany({
        where: {
          productId,
          ...(cursorId ? { id: { lt: cursorId } } : null),
        },
        include: {
          lines: {
            select: {
              id: true,
              batchId: true,
              quantity: true,
              batch: {
                select: {
                  id: true,
                  codeMill: true,
                  codeSartor: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      })
    : [];

  const nextCursor =
    movementRows.length && movementRows.length >= limit
      ? String(movementRows[movementRows.length - 1].id)
      : null;

  const movementStats = includeLedger
    ? await loadMovementStats(productId)
    : { totalMovements: 0, renderedMovements: 0, types: {} };

  movementStats.renderedMovements = movementRows.length;

  const [snapshot, reconciliation] = await Promise.all([
    includeSnapshot ? buildSnapshotPayload(productId) : null,
    includeReconciliation
      ? buildReconciliationPayload(productId, Boolean(product.batchTrackingEnabled))
      : null,
  ]);

  const locations = await resolveLocationsForMovements(movementRows);
  const users = await resolveUsersForMovements(movementRows);

  const ledgerPayload = includeLedger
    ? {
        movementStats,
        movements: movementRows.map((mv) =>
          formatMovementRow({
            movement: mv,
            locations,
            users,
          })
        ),
        paging: { nextCursor },
      }
    : {
        movementStats,
        movements: [],
        paging: { nextCursor: null },
      };

  const payload: DebugExplainPayload = {
    context: {
      module: "productStockDebug",
      entity: { type: "Product", id: product.id },
      generatedAt: new Date().toISOString(),
      version: getDebugVersion(),
    },
    inputs: {
      product: {
        id: product.id,
        sku: product.sku ?? "",
        name: product.name ?? "",
        type: product.type ?? "",
        stockTrackingEnabled: Boolean(product.stockTrackingEnabled),
        batchTrackingEnabled: Boolean(product.batchTrackingEnabled),
      },
      params: {
        limit,
        cursor: cursorRaw,
        includeSnapshot,
        includeLedger,
        includeReconciliation,
      },
    },
    derived: {
      snapshot,
      ledger: ledgerPayload,
      reconciliation,
    },
    links: [{ label: `Product ${product.id}`, href: `/products/${product.id}` }],
  };

  if (process.env.NODE_ENV !== "production") {
    const durationMs = Date.now() - startedAt;
    console.debug("[debug.productStock]", {
      productId,
      durationMs,
      movements: movementRows.length,
      includeSnapshot,
      includeLedger,
      includeReconciliation,
    });
  }

  return payload;
}

async function loadMovementStats(productId: number) {
  const rows = await prisma.$queryRaw<
    Array<{ mt: string | null; count: number }>
  >`
    SELECT lower(trim(COALESCE("movementType", 'unknown'))) AS mt, COUNT(*)::int AS count
    FROM "ProductMovement"
    WHERE "productId" = ${productId}
    GROUP BY lower(trim(COALESCE("movementType", 'unknown')))
  `;
  const total = rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
  const types: Record<string, number> = {};
  rows.forEach((r) => {
    types[String(r.mt || "unknown")] = Number(r.count || 0);
  });
  return { totalMovements: total, renderedMovements: 0, types };
}

async function resolveLocationsForMovements(movements: MovementRow[]) {
  const ids = new Set<number>();
  movements.forEach((mv) => {
    if (Number.isFinite(mv.locationOutId)) ids.add(Number(mv.locationOutId));
    if (Number.isFinite(mv.locationInId)) ids.add(Number(mv.locationInId));
  });
  if (!ids.size) return new Map<number, { id: number; name: string | null }>();
  const locations = await prisma.location.findMany({
    where: { id: { in: Array.from(ids) } },
    select: { id: true, name: true },
  });
  return new Map(locations.map((l) => [l.id, l]));
}

async function resolveUsersForMovements(movements: MovementRow[]) {
  const ids = new Set<number>();
  movements.forEach((mv) => {
    const raw = mv.createdBy ?? null;
    if (raw == null) return;
    const n = Number(raw);
    if (Number.isFinite(n)) ids.add(n);
  });
  if (!ids.size) return new Map<number, { id: number; name: string | null }>();
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(ids) } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

function resolveMovementReason(movement: MovementRow) {
  if (movement.assemblyActivityId) return { type: "assemblyActivity", id: movement.assemblyActivityId };
  if (movement.assemblyId) return { type: "assembly", id: movement.assemblyId };
  if (movement.jobId) return { type: "job", id: movement.jobId };
  if (movement.purchaseOrderLineId) return { type: "purchaseOrderLine", id: movement.purchaseOrderLineId };
  if (movement.shippingLineId) return { type: "shippingLine", id: movement.shippingLineId };
  if (movement.expenseId) return { type: "expense", id: movement.expenseId };
  if (movement.costingId) return { type: "costing", id: movement.costingId };
  return { type: null, id: null };
}

function formatMovementRow(opts: {
  movement: MovementRow;
  locations: Map<number, { id: number; name: string | null }>;
  users: Map<number, { id: number; name: string | null }>;
}) {
  const { movement, locations, users } = opts;
  const createdByRaw = movement.createdBy ?? null;
  const createdById =
    createdByRaw != null && Number.isFinite(Number(createdByRaw))
      ? Number(createdByRaw)
      : null;
  const user = createdById != null ? users.get(createdById) : null;
  const locOut = movement.locationOutId != null ? locations.get(movement.locationOutId) : null;
  const locIn = movement.locationInId != null ? locations.get(movement.locationInId) : null;
  return {
    movementId: movement.id,
    movementTypeRaw: movement.movementType ?? "",
    movementTypeLabel: getMovementLabel(movement.movementType ?? ""),
    createdAt: movement.createdAt ? movement.createdAt.toISOString() : null,
    createdBy: {
      id: createdById,
      name: user?.name ?? (createdByRaw != null ? String(createdByRaw) : null),
    },
    reason: resolveMovementReason(movement),
    locationOut: {
      id: movement.locationOutId ?? null,
      code: null,
      name: locOut?.name ?? null,
    },
    locationIn: {
      id: movement.locationInId ?? null,
      code: null,
      name: locIn?.name ?? null,
    },
    qtyHeader: movement.quantity != null ? Number(movement.quantity) : null,
    lines: (movement.lines || []).map((line) => ({
      lineId: line.id,
      batch: {
        id: line.batch?.id ?? line.batchId ?? null,
        code: line.batch?.codeSartor || line.batch?.codeMill || line.batch?.name || null,
        name: line.batch?.name ?? null,
      },
      qty: line.quantity != null ? Number(line.quantity) : 0,
      uom: null,
    })),
  };
}

async function buildSnapshotPayload(productId: number) {
  const snapshot = await getProductStockSnapshots(productId);
  if (!snapshot || Array.isArray(snapshot)) {
    return {
      source: "product_stock_snapshot",
      filters: { notes: "No rows found for product." },
      byLocation: [],
      totals: { qtyOnHand: 0, qtyOnHandComputedFromByLocation: 0 },
    };
  }
  const byLocation = (snapshot.byLocation || []).map((loc) => ({
    locationId: loc.locationId ?? null,
    locationCode: null,
    locationName: loc.locationName || "",
    qty: loc.qty,
    byBatch: (snapshot.byBatch || [])
      .filter((b) => (b.locationId ?? null) === (loc.locationId ?? null))
      .map((b) => ({
        batchId: b.batchId ?? null,
        batchCode: b.codeSartor || b.codeMill || b.batchName || null,
        qty: b.qty,
      })),
  }));
  const qtyOnHandComputed = byLocation.reduce((sum, loc) => sum + (Number(loc.qty) || 0), 0);
  const qtyOnHand = snapshot.totalQty ?? 0;
  const mismatch =
    Math.round((Number(qtyOnHand) - Number(qtyOnHandComputed)) * 10000) / 10000;
  const notes =
    mismatch !== 0
      ? `Totals mismatch: totalQty=${qtyOnHand} vs sum(byLocation)=${Math.round(
          qtyOnHandComputed * 10000
        ) / 10000}`
      : "No filters applied.";
  return {
    source: "product_stock_snapshot",
    filters: { notes },
    byLocation,
    totals: {
      qtyOnHand,
      qtyOnHandComputedFromByLocation: Math.round(qtyOnHandComputed * 10000) / 10000,
    },
  };
}

async function buildReconciliationPayload(productId: number, batchTracked: boolean) {
  const { byLocation, byLocationBatch } = await aggregateLedgerForProduct(productId);
  const snapshot = await getProductStockSnapshots(productId);
  const snapshotRows = snapshot && !Array.isArray(snapshot) ? snapshot : null;
  const notes: string[] = [];

  const { compareByLocation, compareByLocationBatch, snapshotMissing } =
    compareLedgerToSnapshot({
      expectedByLocation: byLocation,
      expectedByLocationBatch: byLocationBatch,
      snapshotByLocation: snapshotRows?.byLocation ?? [],
      snapshotByLocationBatch: snapshotRows?.byBatch ?? [],
    });
  if (snapshotMissing) {
    notes.push("No snapshot rows found; reconciliation against ledger only.");
  }

  if (batchTracked) {
    const missingLines = await countMovementsWithoutLines(productId);
    if (missingLines > 0) {
      notes.push(
        `${missingLines} movements have no lines while batch tracking is enabled.`
      );
    }
  }

  const missingTransfers = await countInvalidTransferMoves(productId);
  if (missingTransfers > 0) {
    notes.push(
      `${missingTransfers} transfer-like movements missing locationInId or locationOutId.`
    );
  }

  return {
    basis: "all_movements",
    expectedFromLedger: {
      byLocation,
      byLocationBatch,
    },
    compareToSnapshot: {
      byLocation: compareByLocation,
      byLocationBatch: compareByLocationBatch,
    },
    notes,
  };
}

export function compareLedgerToSnapshot(opts: {
  expectedByLocation: Array<{
    locationId: number | null;
    locationCode: string | null;
    expectedQty: number;
  }>;
  expectedByLocationBatch: Array<{
    locationId: number | null;
    locationCode: string | null;
    batchId: number | null;
    batchCode: string | null;
    expectedQty: number;
  }>;
  snapshotByLocation: Array<{
    locationId: number | null;
    locationName?: string | null;
    qty: number;
  }>;
  snapshotByLocationBatch: Array<{
    locationId: number | null;
    batchId: number | null;
    qty: number;
  }>;
}) {
  const snapshotByLocation = new Map<number | null, number>();
  const snapshotByLocationBatch = new Map<string, number>();
  if (opts.snapshotByLocation.length || opts.snapshotByLocationBatch.length) {
    (opts.snapshotByLocation || []).forEach((row) => {
      snapshotByLocation.set(row.locationId ?? null, Number(row.qty || 0));
    });
    (opts.snapshotByLocationBatch || []).forEach((row) => {
      const key = `${row.locationId ?? "null"}::${row.batchId ?? "null"}`;
      snapshotByLocationBatch.set(key, Number(row.qty || 0));
    });
  }

  const compareByLocation = opts.expectedByLocation.map((row) => {
    const snapshotQty = snapshotByLocation.get(row.locationId ?? null) ?? 0;
    return {
      locationId: row.locationId ?? null,
      locationCode: null,
      expectedFromLedger: row.expectedQty,
      snapshotQty,
      delta: Math.round((snapshotQty - row.expectedQty) * 10000) / 10000,
    };
  });

  const compareByLocationBatch = opts.expectedByLocationBatch.map((row) => {
    const key = `${row.locationId ?? "null"}::${row.batchId ?? "null"}`;
    const snapshotQty = snapshotByLocationBatch.get(key) ?? 0;
    return {
      locationId: row.locationId ?? null,
      locationCode: null,
      batchId: row.batchId ?? null,
      batchCode: row.batchCode ?? null,
      expectedFromLedger: row.expectedQty,
      snapshotQty,
      delta: Math.round((snapshotQty - row.expectedQty) * 10000) / 10000,
    };
  });

  return {
    compareByLocation,
    compareByLocationBatch,
    snapshotMissing: !(opts.snapshotByLocation.length || opts.snapshotByLocationBatch.length),
  };
}

async function aggregateLedgerForProduct(productId: number) {
  const rows = await prisma.$queryRaw<
    Array<{ location_id: number | null; batch_id: number | null; qty: number | null }>
  >`
    WITH movement_rows AS (
      SELECT pm.id,
             lower(trim(COALESCE(pm."movementType", ''))) AS mt,
             pm."locationInId" AS loc_in,
             pm."locationOutId" AS loc_out,
             COALESCE(pm.quantity,0) AS qty
      FROM "ProductMovement" pm
      WHERE pm."productId" = ${productId}
    ),
    line_rows AS (
      SELECT pml."movementId" AS movement_id,
             pml."batchId" AS batch_id,
             COALESCE(pml.quantity,0) AS qty
      FROM "ProductMovementLine" pml
      JOIN "ProductMovement" pm ON pm.id = pml."movementId"
      WHERE pm."productId" = ${productId}
    ),
    movements_with_lines AS (
      SELECT DISTINCT movement_id FROM line_rows
    ),
    line_contrib AS (
      SELECT mr.mt, mr.loc_in, mr.loc_out, lr.batch_id, lr.qty
      FROM line_rows lr
      JOIN movement_rows mr ON mr.id = lr.movement_id
    ),
    line_contrib_expanded AS (
      SELECT batch_id, loc_in AS location_id, ABS(qty) AS qty
      FROM line_contrib
      WHERE (mt = 'transfer' OR mt LIKE 'defect_%') AND loc_in IS NOT NULL
      UNION ALL
      SELECT batch_id, loc_out AS location_id, -ABS(qty) AS qty
      FROM line_contrib
      WHERE (mt = 'transfer' OR mt LIKE 'defect_%') AND loc_out IS NOT NULL
      UNION ALL
      SELECT batch_id, loc_in AS location_id, qty
      FROM line_contrib
      WHERE mt <> 'transfer' AND mt NOT LIKE 'defect_%' AND loc_in IS NOT NULL
      UNION ALL
      SELECT batch_id, loc_out AS location_id, qty
      FROM line_contrib
      WHERE mt <> 'transfer' AND mt NOT LIKE 'defect_%' AND loc_out IS NOT NULL
    ),
    header_only AS (
      SELECT mr.mt, mr.loc_in, mr.loc_out, mr.qty
      FROM movement_rows mr
      LEFT JOIN movements_with_lines mwl ON mwl.movement_id = mr.id
      WHERE mwl.movement_id IS NULL
    ),
    header_contrib_expanded AS (
      SELECT NULL::int AS batch_id, loc_in AS location_id, ABS(qty) AS qty
      FROM header_only
      WHERE (mt = 'transfer' OR mt LIKE 'defect_%') AND loc_in IS NOT NULL
      UNION ALL
      SELECT NULL::int AS batch_id, loc_out AS location_id, -ABS(qty) AS qty
      FROM header_only
      WHERE (mt = 'transfer' OR mt LIKE 'defect_%') AND loc_out IS NOT NULL
      UNION ALL
      SELECT NULL::int AS batch_id, loc_in AS location_id, qty
      FROM header_only
      WHERE mt <> 'transfer' AND mt NOT LIKE 'defect_%' AND loc_in IS NOT NULL
      UNION ALL
      SELECT NULL::int AS batch_id, loc_out AS location_id, qty
      FROM header_only
      WHERE mt <> 'transfer' AND mt NOT LIKE 'defect_%' AND loc_out IS NOT NULL
    ),
    combined AS (
      SELECT * FROM line_contrib_expanded
      UNION ALL
      SELECT * FROM header_contrib_expanded
    )
    SELECT location_id, batch_id, COALESCE(SUM(qty),0) AS qty
    FROM combined
    GROUP BY location_id, batch_id
  `;

  const batchIds = Array.from(
    new Set(rows.map((r) => r.batch_id).filter((id): id is number => Number.isFinite(id)))
  );
  const batches = batchIds.length
    ? await prisma.batch.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, codeMill: true, codeSartor: true, name: true },
      })
    : [];
  const batchById = new Map(batches.map((b) => [b.id, b]));

  const byLocation = new Map<number | null, number>();
  rows.forEach((row) => {
    const locId = row.location_id ?? null;
    const current = byLocation.get(locId) ?? 0;
    byLocation.set(locId, current + Number(row.qty || 0));
  });

  const byLocationBatch = rows.map((row) => {
    const batch = row.batch_id != null ? batchById.get(row.batch_id) : null;
    return {
      locationId: row.location_id ?? null,
      locationCode: null,
      batchId: row.batch_id ?? null,
      batchCode: batch?.codeSartor || batch?.codeMill || batch?.name || null,
      expectedQty: Math.round(Number(row.qty || 0) * 10000) / 10000,
    };
  });

  return {
    byLocation: Array.from(byLocation.entries()).map(([locationId, qty]) => ({
      locationId,
      locationCode: null,
      expectedQty: Math.round(qty * 10000) / 10000,
    })),
    byLocationBatch,
  };
}

async function countMovementsWithoutLines(productId: number) {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "ProductMovement" pm
    LEFT JOIN "ProductMovementLine" pml ON pml."movementId" = pm.id
    WHERE pm."productId" = ${productId}
    GROUP BY pm.id
    HAVING COUNT(pml.id) = 0
  `;
  return rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
}

async function countInvalidTransferMoves(productId: number) {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "ProductMovement" pm
    WHERE pm."productId" = ${productId}
      AND (lower(trim(COALESCE(pm."movementType", ''))) = 'transfer'
           OR lower(trim(COALESCE(pm."movementType", ''))) LIKE 'defect_%')
      AND (pm."locationInId" IS NULL OR pm."locationOutId" IS NULL)
  `;
  return rows.reduce((sum, r) => sum + Number(r.count || 0), 0);
}

export async function reconcileProductStockForTest(productId: number) {
  return buildReconciliationPayload(productId, false);
}
