import { ActivityAction, ActivityKind, AssemblyStage } from "@prisma/client";
import { prisma, refreshProductStockSnapshot } from "~/utils/prisma.server";
import { assertBatchLinePresence } from "~/utils/stockMovementGuards";

export type PooledCutAssemblyInput = {
  assemblyId: number;
  qtyBreakdown: number[];
};

export async function createPooledCutEvent(options: {
  assemblyGroupId: number;
  eventDate: Date;
  fabricProductId: number;
  locationOutId?: number | null;
  qtyMeters: number;
  perAssembly: PooledCutAssemblyInput[];
  notes?: string | null;
  userId?: number | null;
}) {
  const {
    assemblyGroupId,
    eventDate,
    fabricProductId,
    locationOutId,
    qtyMeters,
    perAssembly,
    notes,
    userId,
  } = options;

  const assemblyIds = perAssembly
    .map((row) => Number(row.assemblyId))
    .filter((id) => Number.isFinite(id));
  if (!assemblyIds.length) {
    throw new Error("no_assemblies");
  }

  const qtyTotalMeters = Math.max(Number(qtyMeters) || 0, 0);
  if (!Number.isFinite(qtyTotalMeters) || qtyTotalMeters <= 0) {
    throw new Error("invalid_qty_meters");
  }

  const assemblies = await prisma.assembly.findMany({
    where: { id: { in: assemblyIds } },
    select: { id: true, jobId: true, assemblyGroupId: true },
  });
  const assemblyMap = new Map(assemblies.map((a) => [a.id, a]));
  for (const id of assemblyIds) {
    const row = assemblyMap.get(id);
    if (!row || row.assemblyGroupId !== assemblyGroupId) {
      throw new Error("assembly_group_mismatch");
    }
  }

  const jobId = assemblies.find((a) => a.jobId != null)?.jobId ?? null;
  const normalizedNotes = notes?.trim() || null;

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: fabricProductId },
      select: { batchTrackingEnabled: true },
    });
    const event = await tx.assemblyGroupEvent.create({
      data: {
        assemblyGroupId,
        jobId,
        type: "POOLED_CUT",
        eventDate,
        notes: normalizedNotes,
        createdBy: userId ? String(userId) : null,
      },
    });

    const activityIds: number[] = [];
    const perAssemblyTotals = perAssembly.map((row) => {
      const qtyBreakdown = Array.isArray(row.qtyBreakdown)
        ? row.qtyBreakdown.map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0))
        : [];
      const quantity = qtyBreakdown.reduce((t, n) => t + (Number(n) || 0), 0);
      return {
        assemblyId: row.assemblyId,
        qtyBreakdown,
        quantity,
      };
    });

    for (const row of perAssemblyTotals) {
      const asm = assemblyMap.get(row.assemblyId);
      const activity = await tx.assemblyActivity.create({
        data: {
          assemblyId: row.assemblyId,
          jobId: asm?.jobId ?? null,
          name: "Cut",
          stage: AssemblyStage.cut,
          kind: ActivityKind.normal,
          action: ActivityAction.RECORDED,
          activityDate: eventDate,
          qtyBreakdown: row.qtyBreakdown as any,
          quantity: row.quantity,
          notes: normalizedNotes,
          assemblyGroupEventId: event.id,
        },
      });
      activityIds.push(activity.id);
    }

    const movement = await tx.productMovement.create({
      data: {
        movementType: "Assembly",
        date: eventDate,
        jobId,
        assemblyGroupId,
        assemblyGroupEventId: event.id,
        locationOutId: locationOutId ?? undefined,
        productId: fabricProductId,
        quantity: qtyTotalMeters,
        notes: "Group cut consumption",
      },
    });

    assertBatchLinePresence({
      movementType: movement.movementType,
      batchTrackingEnabled: Boolean(product?.batchTrackingEnabled),
      hasBatchId: false,
      context: { movementId: movement.id, productId: fabricProductId },
    });

    await tx.productMovementLine.create({
      data: {
        movementId: movement.id,
        productMovementId: movement.id,
        productId: fabricProductId,
        quantity: -Math.abs(qtyTotalMeters),
        notes: "Group cut consumption",
      },
    });

    await tx.operationLog.create({
      data: {
        userId: userId ?? null,
        action: "ASSEMBLY_GROUP_EVENT_CREATE",
        entityType: "AssemblyGroupEvent",
        entityId: event.id,
        detail: {
          type: "POOLED_CUT",
          assemblyGroupId,
          jobId,
          eventDate: eventDate.toISOString(),
          fabricProductId,
          qtyMeters: qtyTotalMeters,
          perAssembly: perAssemblyTotals,
          activityIds,
          movementId: movement.id,
          notes: normalizedNotes,
        },
      },
    });

    return event;
  });

  await refreshProductStockSnapshot();
  return result;
}

export async function deleteAssemblyGroupEvent(options: {
  eventId: number;
  userId?: number | null;
}) {
  const { eventId, userId } = options;
  if (!Number.isFinite(eventId)) {
    throw new Error("invalid_event");
  }
  const event = await prisma.assemblyGroupEvent.findUnique({
    where: { id: eventId },
    select: { id: true, assemblyGroupId: true, jobId: true, type: true },
  });
  if (!event) return null;

  const result = await prisma.$transaction(async (tx) => {
    const movements = await tx.productMovement.findMany({
      where: { assemblyGroupEventId: eventId },
      select: { id: true },
    });
    const movementIds = movements.map((m) => m.id);
    if (movementIds.length) {
      await tx.productMovementLine.deleteMany({
        where: { movementId: { in: movementIds } },
      });
      await tx.productMovement.deleteMany({
        where: { id: { in: movementIds } },
      });
    }
    const activities = await tx.assemblyActivity.findMany({
      where: { assemblyGroupEventId: eventId },
      select: { id: true },
    });
    const activityIds = activities.map((a) => a.id);
    if (activityIds.length) {
      await tx.assemblyActivity.deleteMany({
        where: { id: { in: activityIds } },
      });
    }
    await tx.assemblyGroupEvent.delete({ where: { id: eventId } });
    await tx.operationLog.create({
      data: {
        userId: userId ?? null,
        action: "ASSEMBLY_GROUP_EVENT_DELETE",
        entityType: "AssemblyGroupEvent",
        entityId: eventId,
        detail: {
          assemblyGroupId: event.assemblyGroupId,
          jobId: event.jobId,
          type: event.type,
          activityIds,
          movementIds,
        },
      },
    });
    return {
      eventId,
      activityCount: activityIds.length,
      movementCount: movementIds.length,
    };
  });

  await refreshProductStockSnapshot();
  return result;
}
