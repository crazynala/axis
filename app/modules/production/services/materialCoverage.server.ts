import type { MaterialDemandSource, ProductType } from "@prisma/client";
import { prisma } from "~/utils/prisma.server";
import type { AssemblyRollup } from "~/modules/production/services/rollups.server";
import {
  buildDerivedDemandRows,
  type AssemblyDemandInput,
  type MaterialDemandRow,
} from "~/modules/materials/services/materialDemand.server";
import {
  computeToleranceQty,
  loadCoverageToleranceDefaults,
  resolveCoverageTolerance,
  type CoverageToleranceDefaults,
  type CoverageToleranceResult,
  type CoverageToleranceSource,
} from "~/modules/materials/services/coverageTolerance.server";

type AssemblyLite = AssemblyDemandInput & {
  job?: { targetDate?: Date | string | null; dropDeadDate?: Date | string | null };
  materialCoverageTolerancePct?: number | string | null;
  materialCoverageToleranceAbs?: number | string | null;
};

export type MaterialReservationRow = {
  id: number;
  assemblyId: number;
  productId: number;
  productName: string | null;
  qtyReserved: number;
  type: "PO" | "BATCH";
  purchaseOrderId: number | null;
  purchaseOrderLineId: number | null;
  inventoryBatchId: number | null;
  etaDate: string | null;
  qtyOrdered: number | null;
  qtyExpected: number | null;
  qtyReceived: number | null;
  outstandingQty: number | null;
  reservedTotal: number | null;
  remainingExpected: number | null;
  unreceivedExpected: number | null;
  overReserved: number | null;
  status: "OK" | "BLOCKED";
  dueSoon: boolean;
  reason: string | null;
  note: string | null;
  settledAt: string | null;
};

export type MaterialCoverageItem = {
  productId: number;
  productName: string | null;
  productType: ProductType | string | null;
  qtyRequired: number | null;
  qtyReservedToPo: number;
  qtyReservedToBatch: number;
  qtyUncovered: number;
  qtyUncoveredAfterTolerance: number;
  locStock: number;
  totalStock: number;
  coveredByOnHand: number;
  coveredByReservations: number;
  coveredByExpected: number;
  coveredByReceived: number;
  reservations: MaterialReservationRow[];
  blockingPoLineIds: number[];
  earliestEta: string | null;
  tolerance: CoverageToleranceResult & { qty: number };
  status: MaterialCoverageStatus;
  calc?: MaterialDemandRow["calc"] | null;
};

export type MaterialHoldReason = {
  productId: number;
  qtyUncovered: number;
  effectiveQty?: number;
  toleranceQty?: number;
  status?: MaterialCoverageStatus;
  reservedPoLineIds: number[];
  suggestedPoLineIds: number[];
  earliestEta: string | null;
  message: string;
};

export type MaterialCoverageStatus =
  | "OK"
  | "DUE_SOON"
  | "POTENTIAL_UNDERCUT"
  | "PO_HOLD";

const DUE_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type AssemblyMaterialCoverage = {
  assemblyId: number;
  held: boolean;
  reasons: MaterialHoldReason[];
  materials: MaterialCoverageItem[];
};

export async function loadMaterialCoverage({
  assemblies,
  rollups,
  stockByProduct,
  toleranceDefaults,
  today = new Date(),
}: {
  assemblies: AssemblyLite[];
  rollups?: Map<number, AssemblyRollup>;
  stockByProduct?: Map<number, any>;
  toleranceDefaults?: CoverageToleranceDefaults;
  today?: Date;
}): Promise<Map<number, AssemblyMaterialCoverage>> {
  const result = new Map<number, AssemblyMaterialCoverage>();
  if (!assemblies.length) return result;
  const defaults =
    toleranceDefaults ?? (await loadCoverageToleranceDefaults());

  const assemblyIds = assemblies.map((a) => a.id);
  const neededDateByAssembly = new Map<number, Date | null>();
  assemblies.forEach((assembly) => {
    neededDateByAssembly.set(
      assembly.id,
      normalizeDate(assembly.job?.targetDate ?? assembly.job?.dropDeadDate)
    );
  });

  const demandRows = await prisma.materialDemand.findMany({
    where: { assemblyId: { in: assemblyIds } },
    include: { product: { select: { id: true, name: true, type: true } } },
  });
  const reservations = await prisma.supplyReservation.findMany({
    where: { assemblyId: { in: assemblyIds } },
    include: {
      product: { select: { id: true, name: true, type: true } },
      purchaseOrderLine: {
        select: {
          id: true,
          purchaseOrderId: true,
          etaDate: true,
          quantityOrdered: true,
          quantity: true,
          qtyReceived: true,
        },
      },
      inventoryBatch: { select: { id: true, quantity: true } },
    },
  });

  const demandsByAssembly = new Map<number, MaterialDemandRow[]>();
  demandRows.forEach((row) => {
    const list = demandsByAssembly.get(row.assemblyId) || [];
    list.push({
      id: row.id,
      assemblyId: row.assemblyId,
      productId: row.productId,
      productName: row.product?.name ?? null,
      productType: (row.product?.type as ProductType | string | null) ?? null,
      costingId: row.costingId ?? null,
      qtyRequired: toNumber(row.qtyRequired),
      uom: row.uom ?? null,
      source: row.source ?? null,
    });
    demandsByAssembly.set(row.assemblyId, list);
  });

  const reservationsByAssembly = new Map<number, typeof reservations>();
  const reservedTotalsByLine = new Map<number, number>();
  reservations.forEach((res) => {
    const list = reservationsByAssembly.get(res.assemblyId) || [];
    list.push(res);
    reservationsByAssembly.set(res.assemblyId, list);
  });
  const poLineIds = Array.from(
    new Set(
      reservations
        .map((res) => res.purchaseOrderLineId)
        .filter((id): id is number => Boolean(id))
    )
  );
  if (poLineIds.length) {
    const totals = await prisma.supplyReservation.groupBy({
      by: ["purchaseOrderLineId"],
      where: { purchaseOrderLineId: { in: poLineIds }, settledAt: null },
      _sum: { qtyReserved: true },
    });
    totals.forEach((row) => {
      if (!row.purchaseOrderLineId) return;
      reservedTotalsByLine.set(
        row.purchaseOrderLineId,
        Number(row._sum.qtyReserved ?? 0) || 0
      );
    });
  }

  const fallbackDemands = deriveDemandFromCostings(
    assemblies.filter((a) => !demandsByAssembly.has(a.id)),
    rollups
  );
  fallbackDemands.forEach((rows, assemblyId) => {
    demandsByAssembly.set(assemblyId, rows);
  });

  const todayStart = startOfDay(today);

  assemblies.forEach((assembly) => {
    const demands = demandsByAssembly.get(assembly.id) || [];
    const resRows = reservationsByAssembly.get(assembly.id) || [];
    const neededDate = neededDateByAssembly.get(assembly.id) ?? null;

    const materials = new Map<number, MaterialCoverageItem>();

    demands.forEach((demand) => {
      materials.set(demand.productId, {
        productId: demand.productId,
        productName: demand.productName,
        productType: demand.productType ?? null,
        qtyRequired: demand.qtyRequired,
        qtyReservedToPo: 0,
        qtyReservedToBatch: 0,
        qtyUncovered: 0,
        qtyUncoveredAfterTolerance: 0,
        locStock: 0,
        totalStock: 0,
        coveredByOnHand: 0,
        coveredByReservations: 0,
        coveredByExpected: 0,
        coveredByReceived: 0,
        reservations: [],
        blockingPoLineIds: [],
        earliestEta: null,
        tolerance: { abs: 0, pct: 0, source: "GLOBAL_DEFAULT", qty: 0 },
        status: "OK",
        calc: demand.calc ?? null,
      });
    });

    resRows.forEach((res) => {
      const productId = res.productId;
      const productName = res.product?.name ?? null;
      const isSettled = Boolean(res.settledAt);
      const eta = normalizeDate(res.purchaseOrderLine?.etaDate);
      const qtyOrdered = toNumber(res.purchaseOrderLine?.quantityOrdered);
      const qtyExpected = resolveExpectedQty(res.purchaseOrderLine);
      const qtyReceived = toNumber(res.purchaseOrderLine?.qtyReceived);
      const outstanding =
        qtyExpected != null && qtyReceived != null
          ? Math.max(qtyExpected - qtyReceived, 0)
          : null;
      const reservedTotal = res.purchaseOrderLineId
        ? reservedTotalsByLine.get(res.purchaseOrderLineId) ?? 0
        : null;
      const remainingExpected =
        qtyExpected != null
          ? Math.max(qtyExpected - (reservedTotal ?? 0), 0)
          : null;
      const unreceivedExpected =
        qtyExpected != null && qtyReceived != null
          ? Math.max(qtyExpected - qtyReceived, 0)
          : null;
      const overReserved =
        qtyExpected != null && reservedTotal != null
          ? Math.max(reservedTotal - qtyExpected, 0)
          : null;
      const missingEta = !eta;
      const pastDue =
        eta && Number.isFinite(eta.getTime()) && eta.getTime() < todayStart.getTime();
      const afterTarget =
        eta &&
        neededDate &&
        Number.isFinite(eta.getTime()) &&
        Number.isFinite(neededDate.getTime()) &&
        eta.getTime() > neededDate.getTime();
      const blocked =
        res.purchaseOrderLineId != null &&
        (missingEta || pastDue || afterTarget) &&
        !isSettled &&
        (unreceivedExpected == null || unreceivedExpected > 0);
      const dueSoon = Boolean(
        res.purchaseOrderLineId &&
          !isSettled &&
          !blocked &&
          eta &&
          isEtaDueSoon(eta, neededDate, todayStart)
      );

      const reservation: MaterialReservationRow = {
        id: res.id,
        assemblyId: res.assemblyId,
        productId,
        productName,
        qtyReserved: toNumber(res.qtyReserved) ?? 0,
        type: res.purchaseOrderLineId ? "PO" : "BATCH",
        purchaseOrderId: res.purchaseOrderLine?.purchaseOrderId ?? null,
        purchaseOrderLineId: res.purchaseOrderLineId ?? null,
        inventoryBatchId: res.inventoryBatchId ?? null,
        etaDate: eta ? eta.toISOString() : null,
        qtyOrdered,
        qtyExpected,
        qtyReceived,
        outstandingQty: outstanding,
        reservedTotal,
        remainingExpected,
        unreceivedExpected,
        overReserved,
        status: blocked ? "BLOCKED" : "OK",
        dueSoon,
        reason: blocked
          ? missingEta
            ? "ETA missing"
            : pastDue
            ? "ETA past due"
            : afterTarget
            ? "ETA after needed date"
            : "Blocked"
          : null,
        note: res.note ?? null,
        settledAt: res.settledAt ? res.settledAt.toISOString() : null,
      };

      let item = materials.get(productId);
      if (!item) {
        item = {
          productId,
          productName,
          productType: res.product?.type ?? null,
          qtyRequired: null,
          qtyReservedToPo: 0,
          qtyReservedToBatch: 0,
          qtyUncovered: 0,
          qtyUncoveredAfterTolerance: 0,
          locStock: 0,
          totalStock: 0,
          coveredByOnHand: 0,
          coveredByReservations: 0,
          coveredByExpected: 0,
          coveredByReceived: 0,
          reservations: [],
          blockingPoLineIds: [],
          earliestEta: null,
          tolerance: { abs: 0, pct: 0, source: "GLOBAL_DEFAULT", qty: 0 },
          status: "OK",
          calc: demands[0]?.calc ?? null,
        };
        materials.set(productId, item);
      }
      if (!item.productType && res.product?.type) {
        item.productType = res.product?.type ?? null;
      }

      item.reservations.push(reservation);
      if (!isSettled) {
        if (reservation.type === "PO") {
          item.qtyReservedToPo += reservation.qtyReserved;
          if (reservation.etaDate) {
            const etaDate = new Date(reservation.etaDate);
            if (
              !item.earliestEta ||
              etaDate.getTime() < new Date(item.earliestEta).getTime()
            ) {
              item.earliestEta = reservation.etaDate;
            }
          }
          if (blocked && reservation.purchaseOrderLineId) {
            item.blockingPoLineIds.push(reservation.purchaseOrderLineId);
          }
        } else {
          item.qtyReservedToBatch += reservation.qtyReserved;
        }
      }
    });

    const reasons: MaterialHoldReason[] = [];
    let held = false;

    const jobLocationId = (assembly as any).job?.stockLocationId ?? null;

    materials.forEach((item) => {
      const required = item.qtyRequired ?? 0;

      const stockSnap = stockByProduct?.get(item.productId);
      const locStock = jobLocationId
        ? Number(
            stockSnap?.byLocation?.find(
              (row: any) => row.locationId === jobLocationId
            )?.qty ?? 0
          ) || 0
        : 0;
      const totalStock = Number(stockSnap?.totalQty ?? 0) || 0;
      item.locStock = locStock;
      item.totalStock = totalStock;

      const coveredByOnHand = Math.min(required, locStock);
      item.coveredByOnHand = coveredByOnHand;
      const remainingAfterOnHand = Math.max(required - coveredByOnHand, 0);

      const totalReserved = item.qtyReservedToPo + item.qtyReservedToBatch;
      const coveredByReservations = Math.min(remainingAfterOnHand, totalReserved);
      item.coveredByReservations = coveredByReservations;
      item.coveredByExpected = coveredByReservations;
      item.coveredByReceived = 0;
      item.qtyUncovered = Math.max(remainingAfterOnHand - totalReserved, 0);
      const tolerance = resolveCoverageTolerance({
        assembly,
        productType: item.productType,
        defaults,
      });
      const toleranceQty = computeToleranceQty({
        abs: tolerance.abs,
        pct: tolerance.pct,
        requiredQty: required,
      });
      const effectiveUncovered = Math.max(item.qtyUncovered - toleranceQty, 0);
      item.tolerance = { ...tolerance, qty: toleranceQty };
      item.qtyUncoveredAfterTolerance = effectiveUncovered;

      const activePoReservations = item.reservations.filter(
        (r) =>
          r.type === "PO" &&
          r.purchaseOrderLineId != null &&
          !r.settledAt
      );
      const hasPoReservations = activePoReservations.length > 0;
      const hasUnblockedPo = activePoReservations.some(
        (r) => r.status === "OK"
      );
      const blockedPoLineIds = Array.from(
        new Set(
          activePoReservations
            .filter((r) => r.status === "BLOCKED")
            .map((r) => r.purchaseOrderLineId)
            .filter((id): id is number => Boolean(id))
        )
      );

      let status: MaterialCoverageStatus = "OK";
      const dueSoon = hasPoReservations
        ? activePoReservations.some((r) => r.status === "OK" && r.dueSoon)
        : false;

      if (required <= 0) {
        item.blockingPoLineIds = [];
        item.status = "OK";
        return;
      }

      if (required > 0) {
        if (item.qtyUncovered > 0) {
          if (effectiveUncovered > 0) {
            held = true;
            status = "PO_HOLD";
            reasons.push({
              productId: item.productId,
              qtyUncovered: item.qtyUncovered,
              effectiveQty: effectiveUncovered,
              toleranceQty,
              status,
              reservedPoLineIds: blockedPoLineIds,
              suggestedPoLineIds: [],
              earliestEta: item.earliestEta,
              message: `Uncovered qty for ${item.productName ?? "material"}`,
            });
          } else {
            status = "POTENTIAL_UNDERCUT";
            reasons.push({
              productId: item.productId,
              qtyUncovered: item.qtyUncovered,
              effectiveQty: 0,
              toleranceQty,
              status,
              reservedPoLineIds: blockedPoLineIds,
              suggestedPoLineIds: [],
              earliestEta: item.earliestEta,
              message: `Uncovered within tolerance for ${
                item.productName ?? "material"
              }`,
            });
          }
        } else if (
          remainingAfterOnHand > 0 &&
          hasPoReservations &&
          !hasUnblockedPo
        ) {
          held = true;
          status = "PO_HOLD";
          reasons.push({
            productId: item.productId,
            qtyUncovered: 0,
            reservedPoLineIds: blockedPoLineIds,
            suggestedPoLineIds: [],
            earliestEta: item.earliestEta,
            message: `PO line timing blocks ${item.productName ?? "material"}`,
          });
        } else if (!item.qtyUncovered && dueSoon) {
          status = "DUE_SOON";
        }
      }
      item.blockingPoLineIds = blockedPoLineIds;
      item.status = status;
    });

    const coverage: AssemblyMaterialCoverage = {
      assemblyId: assembly.id,
      held,
      reasons,
      materials: Array.from(materials.values()).sort((a, b) => {
        const aName = a.productName || "";
        const bName = b.productName || "";
        if (aName.toLowerCase() === bName.toLowerCase()) {
          return a.productId - b.productId;
        }
        return aName.localeCompare(bName);
      }),
    };

    result.set(assembly.id, coverage);
  });

  return result;
}

function deriveDemandFromCostings(
  assemblies: AssemblyLite[],
  rollups?: Map<number, AssemblyRollup>
) {
  const map = new Map<number, MaterialDemandRow[]>();
  assemblies.forEach((assembly) => {
    const rows = buildDerivedDemandRows({
      ...assembly,
      rollup: rollups?.get(assembly.id) ?? null,
    });
    if (rows.length) {
      map.set(assembly.id, rows);
    }
  });
  return map;
}

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toNumber(value: any): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveExpectedQty(line: {
  quantity?: number | string | null;
  quantityOrdered?: number | string | null;
} | null | undefined): number | null {
  if (!line) return null;
  const qty = toNumber(line.quantity);
  const ordered = toNumber(line.quantityOrdered);
  if (qty != null && qty > 0) return qty;
  if (ordered != null && ordered > 0) return ordered;
  if (qty != null) return qty;
  return ordered ?? null;
}

function isEtaDueSoon(
  eta: Date,
  neededDate: Date | null,
  todayStart: Date
) {
  if (!Number.isFinite(eta.getTime())) return false;
  if (neededDate && Number.isFinite(neededDate.getTime())) {
    return (
      Math.abs(eta.getTime() - neededDate.getTime()) <= DUE_SOON_WINDOW_MS
    );
  }
  const diff = eta.getTime() - todayStart.getTime();
  return diff >= 0 && diff <= DUE_SOON_WINDOW_MS;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
