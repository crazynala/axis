import type { MaterialDemandSource } from "@prisma/client";
import { prisma } from "~/utils/prisma.server";
import type { AssemblyRollup } from "~/modules/production/services/rollups.server";
import {
  buildDerivedDemandRows,
  type AssemblyDemandInput,
  type MaterialDemandRow,
} from "~/modules/materials/services/materialDemand.server";

type AssemblyLite = AssemblyDemandInput & {
  job?: { targetDate?: Date | string | null; dropDeadDate?: Date | string | null };
};

export type MaterialReservationRow = {
  id: number;
  assemblyId: number;
  productId: number;
  productName: string | null;
  qtyReserved: number;
  type: "PO" | "BATCH";
  purchaseOrderLineId: number | null;
  inventoryBatchId: number | null;
  etaDate: string | null;
  qtyOrdered: number | null;
  qtyReceived: number | null;
  outstandingQty: number | null;
  status: "OK" | "BLOCKED";
  reason: string | null;
  note: string | null;
};

export type MaterialCoverageItem = {
  productId: number;
  productName: string | null;
  qtyRequired: number | null;
  qtyReservedToPo: number;
  qtyReservedToBatch: number;
  qtyUncovered: number;
  locStock: number;
  totalStock: number;
  coveredByOnHand: number;
  coveredByReservations: number;
  reservations: MaterialReservationRow[];
  blockingPoLineIds: number[];
  earliestEta: string | null;
  calc?: MaterialDemandRow["calc"] | null;
};

export type MaterialHoldReason = {
  productId: number;
  qtyUncovered: number;
  reservedPoLineIds: number[];
  suggestedPoLineIds: number[];
  earliestEta: string | null;
  message: string;
};

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
  today = new Date(),
}: {
  assemblies: AssemblyLite[];
  rollups?: Map<number, AssemblyRollup>;
  stockByProduct?: Map<number, any>;
  today?: Date;
}): Promise<Map<number, AssemblyMaterialCoverage>> {
  const result = new Map<number, AssemblyMaterialCoverage>();
  if (!assemblies.length) return result;

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
    include: { product: { select: { id: true, name: true } } },
  });
  const reservations = await prisma.supplyReservation.findMany({
    where: { assemblyId: { in: assemblyIds } },
    include: {
      product: { select: { id: true, name: true } },
      purchaseOrderLine: {
        select: {
          id: true,
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
      costingId: row.costingId ?? null,
      qtyRequired: toNumber(row.qtyRequired),
      uom: row.uom ?? null,
      source: row.source ?? null,
    });
    demandsByAssembly.set(row.assemblyId, list);
  });

  const reservationsByAssembly = new Map<number, typeof reservations>();
  reservations.forEach((res) => {
    const list = reservationsByAssembly.get(res.assemblyId) || [];
    list.push(res);
    reservationsByAssembly.set(res.assemblyId, list);
  });

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
        qtyRequired: demand.qtyRequired,
        qtyReservedToPo: 0,
        qtyReservedToBatch: 0,
        qtyUncovered: 0,
        locStock: 0,
        totalStock: 0,
        coveredByOnHand: 0,
        coveredByReservations: 0,
        reservations: [],
        blockingPoLineIds: [],
        earliestEta: null,
        calc: demand.calc ?? null,
      });
    });

    resRows.forEach((res) => {
      const productId = res.productId;
      const productName = res.product?.name ?? null;
      const eta = normalizeDate(res.purchaseOrderLine?.etaDate);
      const qtyOrdered = toNumber(
        res.purchaseOrderLine?.quantityOrdered ?? res.purchaseOrderLine?.quantity
      );
      const qtyReceived = toNumber(res.purchaseOrderLine?.qtyReceived);
      const outstanding =
        qtyOrdered != null && qtyReceived != null
          ? Math.max(qtyOrdered - qtyReceived, 0)
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
        (outstanding == null || outstanding > 0);

      const reservation: MaterialReservationRow = {
        id: res.id,
        assemblyId: res.assemblyId,
        productId,
        productName,
        qtyReserved: toNumber(res.qtyReserved) ?? 0,
        type: res.purchaseOrderLineId ? "PO" : "BATCH",
        purchaseOrderLineId: res.purchaseOrderLineId ?? null,
        inventoryBatchId: res.inventoryBatchId ?? null,
        etaDate: eta ? eta.toISOString() : null,
        qtyOrdered,
        qtyReceived,
        outstandingQty: outstanding,
        status: blocked ? "BLOCKED" : "OK",
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
      };

      let item = materials.get(productId);
      if (!item) {
        item = {
          productId,
          productName,
          qtyRequired: null,
          qtyReservedToPo: 0,
          qtyReservedToBatch: 0,
          qtyUncovered: 0,
          locStock: 0,
          totalStock: 0,
          coveredByOnHand: 0,
          coveredByReservations: 0,
          reservations: [],
          blockingPoLineIds: [],
          earliestEta: null,
          calc: demandRows[0]?.calc ?? null,
        };
        materials.set(productId, item);
      }

      item.reservations.push(reservation);
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
      item.qtyUncovered = Math.max(remainingAfterOnHand - totalReserved, 0);

      const hasPoReservations = item.reservations.some(
        (r) => r.type === "PO" && r.purchaseOrderLineId != null
      );
      const hasUnblockedPo = item.reservations.some(
        (r) => r.type === "PO" && r.status === "OK"
      );
      const blockedPoLineIds = item.reservations
        .filter((r) => r.type === "PO" && r.status === "BLOCKED")
        .map((r) => r.purchaseOrderLineId)
        .filter((id): id is number => Boolean(id));

      if (required > 0) {
        if (item.qtyUncovered > 0) {
          held = true;
          reasons.push({
            productId: item.productId,
            qtyUncovered: item.qtyUncovered,
            reservedPoLineIds: blockedPoLineIds,
            suggestedPoLineIds: [],
            earliestEta: item.earliestEta,
            message: `Uncovered qty for ${item.productName ?? "material"}`,
          });
        } else if (
          remainingAfterOnHand > 0 &&
          hasPoReservations &&
          !hasUnblockedPo
        ) {
          held = true;
          reasons.push({
            productId: item.productId,
            qtyUncovered: 0,
            reservedPoLineIds: blockedPoLineIds,
            suggestedPoLineIds: [],
            earliestEta: item.earliestEta,
            message: `PO line timing blocks ${item.productName ?? "material"}`,
          });
        }
      }
      item.blockingPoLineIds = blockedPoLineIds;
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

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
