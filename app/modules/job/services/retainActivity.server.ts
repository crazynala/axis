import {
  ActivityAction,
  ActivityKind,
  AssemblyStage,
  type Prisma,
} from "@prisma/client";
import { prisma, refreshProductStockSnapshot } from "~/utils/prisma.server";
import { assertBatchLinePresence, assertTransferLocations } from "~/utils/stockMovementGuards";
import { ensureDestinationBatch, findAssemblyStockBatch } from "~/utils/batch.server";

const RETAIN_MOVEMENT_TYPE = "RETAIN";

type CreateRetainInput = {
  assemblyId: number;
  jobId: number;
  activityDate: Date;
  qtyBreakdown: number[];
  quantity: number;
  notes?: string | null;
};

const sumArr = (arr: number[]) =>
  arr.reduce((sum, n) => sum + (Number(n) || 0), 0);

const normalizeBreakdown = (
  arr: Array<number | null> | null | undefined,
  fallbackQty: number
) => {
  if (Array.isArray(arr) && arr.length) {
    return arr.map((n) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0));
  }
  if (Number.isFinite(fallbackQty) && fallbackQty > 0) return [fallbackQty | 0];
  return [];
};

function getRetainDestinationType(assemblyType: string) {
  const type = assemblyType.toLowerCase();
  if (type === "keep") return "Samples";
  if (type === "internal_dev" || type === "internal dev" || type === "internal-dev") {
    return "Dev Samples";
  }
  return null;
}

const addArrays = (a: number[], b: number[]) => {
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, idx) =>
    (Number(a[idx] ?? 0) || 0) + (Number(b[idx] ?? 0) || 0)
  );
};

async function findRetainDestination(
  tx: Prisma.TransactionClient,
  assemblyType: string
) {
  const label = getRetainDestinationType(assemblyType);
  if (!label) return null;
  const location = await tx.location.findFirst({
    where: {
      type: "sample",
      name: { equals: label, mode: "insensitive" },
    },
    orderBy: { id: "asc" },
  });
  return { location, label };
}

export async function createRetainActivity(input: CreateRetainInput) {
  const result = await prisma.$transaction(async (tx) => {
    const assembly = await tx.assembly.findUnique({
      where: { id: input.assemblyId },
      select: { id: true, jobId: true, productId: true, assemblyType: true },
    });
    if (!assembly || !assembly.jobId) {
      throw new Error("Assembly not found for retain activity.");
    }
    const assemblyType = String(assembly.assemblyType || "");
    const destinationInfo = await findRetainDestination(tx, assemblyType);
    if (!destinationInfo?.location?.id) {
      const label = getRetainDestinationType(assemblyType) || "Destination";
      throw new Error(
        `${label} location is missing; cannot record Retain. Create the location or fix seed data.`
      );
    }
    const job = await tx.job.findUnique({
      where: { id: input.jobId },
      select: { stockLocationId: true },
    });
    if (!job?.stockLocationId) {
      throw new Error("Job stock location is missing; cannot record Retain.");
    }
    const productId = assembly.productId ?? null;
    if (!productId) {
      throw new Error("Assembly product is missing; cannot record Retain.");
    }
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { batchTrackingEnabled: true, stockTrackingEnabled: true },
    });
    if (product?.stockTrackingEnabled === false) {
      throw new Error("Product is not stock-tracked; cannot record Retain.");
    }

    const activities = await tx.assemblyActivity.findMany({
      where: { assemblyId: input.assemblyId },
      select: { stage: true, kind: true, quantity: true, qtyBreakdown: true },
    });
    const finishActs = activities.filter(
      (act) =>
        String(act.stage || "").toLowerCase() === "finish" &&
        String(act.kind || "").toLowerCase() !== "defect"
    );
    const retainActs = activities.filter(
      (act) => String(act.stage || "").toLowerCase() === "retain"
    );
    const finishBreakdown = finishActs.reduce((sum, act) => {
      const arr = normalizeBreakdown(
        act.qtyBreakdown as number[],
        Number(act.quantity ?? 0) || 0
      );
      return addArrays(sum, arr);
    }, [] as number[]);
    const retainBreakdown = retainActs.reduce((sum, act) => {
      const arr = normalizeBreakdown(
        act.qtyBreakdown as number[],
        Number(act.quantity ?? 0) || 0
      );
      return addArrays(sum, arr);
    }, [] as number[]);

    const len = Math.max(
      finishBreakdown.length,
      retainBreakdown.length,
      input.qtyBreakdown.length
    );
    const available = Array.from({ length: len }, (_, idx) =>
      Math.max(0, Number(finishBreakdown[idx] ?? 0) - Number(retainBreakdown[idx] ?? 0))
    );
    for (let i = 0; i < len; i++) {
      const requested = Number(input.qtyBreakdown[i] ?? 0) || 0;
      if (requested > Number(available[i] ?? 0)) {
        throw new Error(
          `Retain quantity exceeds available finished goods at size ${i + 1}.`
        );
      }
    }

    const activity = await tx.assemblyActivity.create({
      data: {
        assemblyId: input.assemblyId,
        jobId: input.jobId,
        name: "Retain",
        stage: AssemblyStage.retain,
        kind: ActivityKind.normal,
        action: ActivityAction.RECORDED,
        activityDate: input.activityDate,
        qtyBreakdown: input.qtyBreakdown as any,
        quantity: input.quantity,
        notes: input.notes ?? null,
        productId,
      },
    });

    const destinationLocationId = destinationInfo.location.id;
    const destinationName = destinationInfo.location.name || destinationInfo.label;
    const batch = await ensureDestinationBatch(tx, {
      productId,
      jobId: input.jobId,
      assemblyId: input.assemblyId,
      locationId: destinationLocationId,
      name: `A${input.assemblyId} Retained - ${destinationName}`,
    });
    let sourceBatchId: number | null = null;
    if (product?.batchTrackingEnabled) {
      const sourceBatch = await findAssemblyStockBatch(tx, {
        productId,
        jobId: input.jobId,
        assemblyId: input.assemblyId,
        locationId: job.stockLocationId,
      });
      sourceBatchId = sourceBatch?.id ?? null;
      if (!sourceBatchId) {
        throw new Error(
          "Finished goods batch is missing in stock location; record Finish before Retain."
        );
      }
    }
    const movement = await tx.productMovement.create({
      data: {
        movementType: RETAIN_MOVEMENT_TYPE,
        date: new Date(),
        jobId: input.jobId,
        assemblyId: input.assemblyId,
        assemblyActivityId: activity.id,
        productId,
        locationOutId: job.stockLocationId,
        locationInId: destinationLocationId,
        quantity: Math.abs(input.quantity),
        notes: `Retain → ${destinationName}`,
      },
    });
    assertTransferLocations({
      movementType: movement.movementType,
      locationInId: movement.locationInId,
      locationOutId: movement.locationOutId,
      context: { movementId: movement.id, activityId: activity.id },
    });
    assertBatchLinePresence({
      movementType: movement.movementType,
      batchTrackingEnabled: Boolean(product?.batchTrackingEnabled),
      hasBatchId: batch?.id != null && (!product?.batchTrackingEnabled || sourceBatchId != null),
      context: { movementId: movement.id, productId },
    });
    if (product?.batchTrackingEnabled && sourceBatchId) {
      await tx.productMovementLine.create({
        data: {
          movementId: movement.id,
          productMovementId: movement.id,
          productId,
          batchId: sourceBatchId,
          quantity: -Math.abs(input.quantity),
          notes: "Retain (source)",
        },
      });
    }
    await tx.productMovementLine.create({
      data: {
        movementId: movement.id,
        productMovementId: movement.id,
        productId,
        batchId: batch?.id ?? undefined,
        quantity: Math.abs(input.quantity),
        notes: "Retained",
      },
    });
    return activity;
  });

  if (result) {
    await refreshProductStockSnapshot();
  }
  return result;
}
