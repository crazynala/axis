import type { DebugExplainPayload } from "~/modules/debug/types";
import { getProductStockSnapshots, prisma } from "~/utils/prisma.server";
import { getDebugVersion } from "~/modules/debug/debugUtils.server";
import { getMovementLabel } from "~/utils/movementLabels";

export async function buildProductDebug(
  productId: number,
  opts?: {
    limit?: number;
    includeMovements?: boolean;
    includeSnapshot?: boolean;
  }
): Promise<DebugExplainPayload | null> {
  const limitRaw = Number(opts?.limit ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200;
  const includeMovements = opts?.includeMovements !== false;
  const includeSnapshot = opts?.includeSnapshot !== false;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      supplier: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      category: { select: { id: true, label: true, code: true } },
      subCategory: { select: { id: true, label: true, code: true } },
      template: {
        select: {
          id: true,
          code: true,
          label: true,
          productType: true,
          defaultExternalStepType: true,
          requiresSupplier: true,
          requiresCustomer: true,
          defaultStockTracking: true,
          defaultBatchTracking: true,
          skuSeriesKey: true,
        },
      },
      productLines: {
        include: {
          child: {
            select: {
              id: true,
              sku: true,
              name: true,
              type: true,
              externalStepType: true,
              template: {
                select: { id: true, code: true, label: true, defaultExternalStepType: true },
              },
              category: { select: { id: true, label: true, code: true } },
              subCategory: { select: { id: true, label: true, code: true } },
            },
          },
        },
      },
    },
  });
  if (!product) return null;

  const movementRows = includeMovements
    ? await prisma.productMovement.findMany({
        where: { productId },
        include: {
          lines: {
            select: {
              id: true,
              quantity: true,
              batchId: true,
              batch: {
                select: {
                  id: true,
                  codeMill: true,
                  codeSartor: true,
                  name: true,
                  locationId: true,
                },
              },
            },
          },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: limit,
      })
    : [];

  const locationIds = new Set<number>();
  const createdByIds = new Set<number>();
  for (const mv of movementRows) {
    if (Number.isFinite(mv.locationOutId)) locationIds.add(Number(mv.locationOutId));
    if (Number.isFinite(mv.locationInId)) locationIds.add(Number(mv.locationInId));
    if (typeof mv.createdBy === "string") {
      const num = Number(mv.createdBy);
      if (Number.isFinite(num)) createdByIds.add(num);
    }
    (mv.lines || []).forEach((line) => {
      if (Number.isFinite(line.batch?.locationId))
        locationIds.add(Number(line.batch?.locationId));
    });
  }

  const locations = locationIds.size
    ? await prisma.location.findMany({
        where: { id: { in: Array.from(locationIds) } },
        select: { id: true, name: true },
      })
    : [];
  const locationById = new Map(locations.map((l) => [l.id, l]));

  const users = createdByIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(createdByIds) } },
        select: { id: true, name: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const snapshot = includeSnapshot
    ? await getProductStockSnapshots(productId)
    : null;
  const snapshotByLocation = (snapshot && "byLocation" in snapshot
    ? snapshot.byLocation
    : []) as Array<{ locationId: number | null; locationName: string; qty: number }>;
  const snapshotByBatch = (snapshot && "byBatch" in snapshot
    ? snapshot.byBatch
    : []) as Array<{
    batchId: number;
    codeMill: string;
    codeSartor: string;
    batchName: string;
    receivedAt: Date | null;
    locationId: number | null;
    locationName: string;
    qty: number;
  }>;

  const snapshotByLocationWithBatch = snapshotByLocation.map((loc) => {
    const byBatch = snapshotByBatch
      .filter((b) => (b.locationId ?? null) === (loc.locationId ?? null))
      .map((b) => ({
        batchId: b.batchId,
        batchCode: b.codeSartor || b.codeMill || b.batchName || null,
        qty: b.qty,
      }));
    return {
      locationId: loc.locationId ?? null,
      locationCode: null,
      locationName: loc.locationName || "",
      qty: loc.qty,
      byBatch,
    };
  });

  const ledger = buildLedgerSummary({
    movements: movementRows,
    locationById,
    userById,
  });

  const reconciliation = reconcileProductStock({
    snapshotByLocation: snapshotByLocationWithBatch,
    snapshotTotalQty: snapshot && "totalQty" in snapshot ? snapshot.totalQty : 0,
    movements: movementRows,
    batchTracked: Boolean(product.batchTrackingEnabled),
  });

  return {
    context: {
      module: "product",
      entity: { type: "Product", id: product.id },
      generatedAt: new Date().toISOString(),
      version: getDebugVersion(),
    },
    inputs: {
      product: {
        id: product.id,
        sku: product.sku ?? null,
        name: product.name ?? null,
        type: product.type ?? null,
        stockTrackingEnabled: product.stockTrackingEnabled ?? null,
        batchTrackingEnabled: product.batchTrackingEnabled ?? null,
      },
      debugParams: {
        limit,
        includeMovements,
        includeSnapshot,
      },
    },
    derived: {
      snapshot: {
        asOf: new Date().toISOString(),
        byLocation: snapshotByLocationWithBatch,
        totals: {
          qtyOnHand: snapshot && "totalQty" in snapshot ? snapshot.totalQty : 0,
          qtyReserved: null,
          qtyAvailable: null,
        },
      },
      ledger,
      reconciliation,
    },
    links: [{ label: `Product ${product.id}`, href: `/products/${product.id}` }],
  };
}

function resolveMovementReason(movement: any): { type: string | null; id: number | null } {
  if (movement.assemblyActivityId) return { type: "assemblyActivity", id: movement.assemblyActivityId };
  if (movement.assemblyId) return { type: "assembly", id: movement.assemblyId };
  if (movement.jobId) return { type: "job", id: movement.jobId };
  if (movement.purchaseOrderLineId) return { type: "purchaseOrderLine", id: movement.purchaseOrderLineId };
  if (movement.shippingLineId) return { type: "shippingLine", id: movement.shippingLineId };
  if (movement.expenseId) return { type: "expense", id: movement.expenseId };
  if (movement.costingId) return { type: "costing", id: movement.costingId };
  return { type: null, id: null };
}

function buildLedgerSummary(opts: {
  movements: any[];
  locationById: Map<number, { id: number; name: string | null }>;
  userById: Map<number, { id: number; name: string | null }>;
}) {
  const { movements, locationById, userById } = opts;
  const movementPayload = (movements || []).map((movement) => {
    const createdByRaw = movement.createdBy ?? null;
    const createdById = createdByRaw != null && Number.isFinite(Number(createdByRaw)) ? Number(createdByRaw) : null;
    const user = createdById != null ? userById.get(createdById) : null;
    const createdBy = {
      id: createdById ?? null,
      name: user?.name ?? (createdByRaw != null ? String(createdByRaw) : null),
    };
    const locOut = movement.locationOutId != null ? locationById.get(movement.locationOutId) : null;
    const locIn = movement.locationInId != null ? locationById.get(movement.locationInId) : null;
    return {
      movementId: movement.id,
      movementTypeRaw: movement.movementType ?? null,
      movementTypeLabel: getMovementLabel(movement.movementType ?? null),
      createdAt: movement.createdAt ? new Date(movement.createdAt).toISOString() : null,
      createdBy,
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
      lines: (movement.lines || []).map((line: any) => ({
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
  });

  const stats = buildMovementStats(movementPayload);
  return {
    movements: movementPayload,
    movementStats: stats,
  };
}

function buildMovementStats(movements: Array<{ movementTypeRaw?: string | null; createdAt?: string | null }>) {
  const types: Record<string, number> = {};
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  movements.forEach((mv) => {
    const raw = (mv.movementTypeRaw || "").toString().toLowerCase() || "unknown";
    types[raw] = (types[raw] ?? 0) + 1;
    if (mv.createdAt) {
      if (!firstAt || mv.createdAt < firstAt) firstAt = mv.createdAt;
      if (!lastAt || mv.createdAt > lastAt) lastAt = mv.createdAt;
    }
  });
  return {
    count: movements.length,
    firstAt,
    lastAt,
    types,
  };
}

export function reconcileProductStock(opts: {
  snapshotByLocation: Array<{
    locationId: number | null;
    locationCode: string | null;
    locationName: string;
    qty: number;
  }>;
  snapshotTotalQty: number;
  movements: any[];
  batchTracked: boolean;
}) {
  const { snapshotByLocation, snapshotTotalQty, movements, batchTracked } = opts;
  const expectedByLoc = new Map<number | null, number>();
  const notes: string[] = [];
  const hasMovements = Array.isArray(movements) && movements.length > 0;
  const transferLike = (mtRaw: any) => {
    const mt = (mtRaw || "").toString().toLowerCase();
    return mt === "transfer" || mt === "retain" || mt.startsWith("defect_");
  };

  if (batchTracked) {
    movements.forEach((mv) => {
      const lines = mv.lines || [];
      if (!lines.length) {
        notes.push(
          `Movement ${mv.id} has no lines despite batch tracking; header qty may be misleading.`
        );
      }
      lines.forEach((line: any) => {
        const locId = line.batch?.locationId ?? null;
        const qty = Number(line.quantity ?? 0) || 0;
        expectedByLoc.set(locId, (expectedByLoc.get(locId) ?? 0) + qty);
      });
    });
  } else {
    movements.forEach((mv) => {
      const qty = Number(mv.quantity ?? 0) || 0;
      const absQty = Math.abs(qty);
      if (transferLike(mv.movementType)) {
        if (mv.locationOutId != null) {
          expectedByLoc.set(
            mv.locationOutId,
            (expectedByLoc.get(mv.locationOutId) ?? 0) - absQty
          );
        } else {
          notes.push(`Transfer-like movement ${mv.id} missing locationOutId.`);
        }
        if (mv.locationInId != null) {
          expectedByLoc.set(
            mv.locationInId,
            (expectedByLoc.get(mv.locationInId) ?? 0) + absQty
          );
        } else {
          notes.push(`Transfer-like movement ${mv.id} missing locationInId.`);
        }
      } else {
        if (mv.locationOutId != null) {
          expectedByLoc.set(
            mv.locationOutId,
            (expectedByLoc.get(mv.locationOutId) ?? 0) + qty
          );
        }
        if (mv.locationInId != null) {
          expectedByLoc.set(
            mv.locationInId,
            (expectedByLoc.get(mv.locationInId) ?? 0) + qty
          );
        }
      }
    });
  }

  if (!hasMovements) {
    notes.push("No ProductMovement rows found; snapshot may be batch-declared.");
  }

  const snapshotLocMap = new Map<number | null, number>();
  snapshotByLocation.forEach((loc) => {
    snapshotLocMap.set(loc.locationId ?? null, Number(loc.qty ?? 0) || 0);
  });

  const allLocIds = new Set<number | null>([
    ...Array.from(expectedByLoc.keys()),
    ...Array.from(snapshotLocMap.keys()),
  ]);

  const explain = Array.from(allLocIds).map((locId) => {
    const expected = Math.round((expectedByLoc.get(locId) ?? 0) * 10000) / 10000;
    const snapshotQty = Math.round((snapshotLocMap.get(locId) ?? 0) * 10000) / 10000;
    const delta = Math.round((snapshotQty - expected) * 10000) / 10000;
    const locInfo =
      snapshotByLocation.find((l) => (l.locationId ?? null) === (locId ?? null)) ||
      null;
    return {
      locationId: locId ?? null,
      locationCode: locInfo?.locationCode ?? null,
      expectedFromLedger: expected,
      snapshotQty,
      delta,
    };
  });

  const totalSnapshot = Number(snapshotTotalQty ?? 0) || 0;
  const totalExpected = Array.from(expectedByLoc.values()).reduce((t, n) => t + n, 0);
  if (Math.abs(totalSnapshot - totalExpected) > 0.0001) {
    notes.push(
      `Total mismatch: snapshot=${totalSnapshot} vs ledger=${Math.round(totalExpected * 10000) / 10000}`
    );
  }

  return { explain, notes };
}
