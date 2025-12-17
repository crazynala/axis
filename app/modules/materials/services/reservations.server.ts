import { prisma } from "~/utils/prisma.server";

export type TrimReservationsResult = {
  trimmed: number;
  reservedTotal: number;
  maxAllowed: number;
  qtyExpected: number;
  qtyReceived: number;
};

export function resolveExpectedQty(line: {
  quantity?: number | string | null;
  quantityOrdered?: number | string | null;
} | null | undefined) {
  if (!line) return 0;
  const qty = Number(line.quantity ?? 0) || 0;
  const ordered = Number(line.quantityOrdered ?? 0) || 0;
  if (qty > 0) return qty;
  if (ordered > 0) return ordered;
  return qty || ordered || 0;
}

export async function trimReservationsToExpected({
  purchaseOrderLineId,
  userId,
  note,
}: {
  purchaseOrderLineId: number;
  userId?: number | null;
  note?: string | null;
}): Promise<TrimReservationsResult | null> {
  const line = await prisma.purchaseOrderLine.findUnique({
    where: { id: purchaseOrderLineId },
    select: { id: true, quantity: true, quantityOrdered: true, qtyReceived: true },
  });
  if (!line) return null;

  const qtyExpected = resolveExpectedQty(line);
  const qtyReceived = Number(line.qtyReceived ?? 0) || 0;
  const reservations = await prisma.supplyReservation.findMany({
    where: { purchaseOrderLineId, settledAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, qtyReserved: true },
  });
  const reservedTotal = reservations.reduce(
    (sum, res) => sum + (Number(res.qtyReserved) || 0),
    0
  );
  const maxAllowed = Math.max(qtyExpected - qtyReceived, 0);
  let overage = Math.max(reservedTotal - maxAllowed, 0);
  if (overage <= 0) {
    return { trimmed: 0, reservedTotal, maxAllowed, qtyExpected, qtyReceived };
  }

  const updates = [];
  for (const res of reservations) {
    if (overage <= 0) break;
    const current = Number(res.qtyReserved) || 0;
    const reduceBy = Math.min(overage, current);
    overage -= reduceBy;
    updates.push(
      prisma.supplyReservation.update({
        where: { id: res.id },
        data: { qtyReserved: Math.max(current - reduceBy, 0) },
      })
    );
  }

  const trimmed = Math.max(reservedTotal - maxAllowed, 0);
  const normalizedNote = note?.trim() || null;
  const newReservedTotal = reservedTotal - trimmed;
  const tx = [
    ...updates,
    prisma.operationLog.create({
      data: {
        userId: userId ?? null,
        action: "RESERVATION_TRIM",
        entityType: "PurchaseOrderLine",
        entityId: purchaseOrderLineId,
        detail: {
          purchaseOrderLineId,
          reservedBefore: reservedTotal,
          reservedAfter: newReservedTotal,
          expectedQty: qtyExpected,
          qtyReceived,
          trimmed,
          note: normalizedNote,
          strategy: "newest-first",
        },
      },
    }),
  ];

  await prisma.$transaction(tx);

  return {
    trimmed,
    reservedTotal,
    maxAllowed,
    qtyExpected,
    qtyReceived,
  };
}

export async function settleReservationsForAssemblyProduct({
  assemblyId,
  productId,
  userId,
  note,
}: {
  assemblyId: number;
  productId: number;
  userId?: number | null;
  note?: string | null;
}) {
  const activeReservations = await prisma.supplyReservation.findMany({
    where: { assemblyId, productId, settledAt: null },
    select: { id: true, qtyReserved: true, purchaseOrderLineId: true },
  });
  if (!activeReservations.length) {
    return { settledCount: 0, reservedTotal: 0 };
  }

  const reservedTotal = activeReservations.reduce(
    (sum, res) => sum + (Number(res.qtyReserved) || 0),
    0
  );
  const reservationIds = activeReservations.map((res) => res.id);
  const now = new Date();
  const normalizedNote = note?.trim() || null;

  await prisma.$transaction([
    prisma.supplyReservation.updateMany({
      where: { id: { in: reservationIds } },
      data: { settledAt: now },
    }),
    prisma.operationLog.create({
      data: {
        userId: userId ?? null,
        action: "RESERVATION_SETTLE",
        entityType: "Assembly",
        entityId: assemblyId,
        detail: {
          assemblyId,
          productId,
          reservationIds,
          reservedTotal,
          settledAt: now.toISOString(),
          note: normalizedNote,
        },
      },
    }),
  ]);

  return { settledCount: reservationIds.length, reservedTotal };
}
