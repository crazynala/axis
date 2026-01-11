import {
  ActivityAction,
  ActivityKind,
  AssemblyStage,
  DefectDisposition,
  Prisma,
} from "@prisma/client";
import { prisma, refreshProductStockSnapshot } from "~/utils/prisma.server";
import {
  assertBatchLinePresence,
  assertTransferLocations,
} from "~/utils/stockMovementGuards";
import { ensureDestinationBatch, findAssemblyStockBatch } from "~/utils/batch.server";

const DEFECT_MOVEMENT_TYPE: Record<DefectDisposition, string> = {
  none: "DEFECT_NONE",
  review: "DEFECT_REVIEW",
  scrap: "DEFECT_SCRAP",
  offSpec: "DEFECT_OFF_SPEC",
  sample: "DEFECT_SAMPLE",
};

async function findDestinationLocationId(
  tx: Prisma.TransactionClient,
  disposition: DefectDisposition
): Promise<number | null> {
  const type =
    disposition === "scrap"
      ? "scrap"
      : disposition === "review"
      ? "review"
      : disposition === "offSpec"
      ? "off_spec"
      : disposition === "sample"
      ? "sample"
      : null;
  if (!type) return null;
  const loc = await tx.location.findFirst({
    where: { type: type as any },
    orderBy: { id: "asc" },
  });
  if (!loc) {
    console.warn("[defect] No destination location found for disposition", {
      disposition,
    });
    return null;
  }
  return loc.id;
}

function buildMissingLocationError(disposition: DefectDisposition) {
  const label =
    disposition === "scrap"
      ? "Scrap"
      : disposition === "review"
      ? "Review"
      : disposition === "offSpec"
      ? "Off-spec"
      : disposition === "sample"
      ? "Samples"
      : "Destination";
  return new Error(
    `${label} location is missing; cannot record Defect → ${label}. Create the location or fix seed data.`
  );
}

async function maybeCreateDefectMovement(
  tx: Prisma.TransactionClient,
  args: {
    activityId: number;
    assemblyId: number;
    jobId: number;
    productId: number | null;
    quantity: number;
    disposition: DefectDisposition;
    stage?: AssemblyStage | null;
  }
) {
  if (!args.quantity || args.quantity <= 0) return null;
  if (!args.disposition || args.disposition === "none") return null;
  const productIdFromArgs = args.productId ?? null;
  const product =
    productIdFromArgs != null
      ? await tx.product.findUnique({
          where: { id: productIdFromArgs },
          select: { batchTrackingEnabled: true, stockTrackingEnabled: true },
        })
      : null;
  if (product?.stockTrackingEnabled === false) return null;
  const assembly = await tx.assembly.findUnique({
    where: { id: args.assemblyId },
    select: { productId: true, jobId: true },
  });
  const job = await tx.job.findUnique({
    where: { id: args.jobId },
    select: { stockLocationId: true },
  });
  const sourceLocationId = job?.stockLocationId ?? null;
  const destinationLocationId = await findDestinationLocationId(
    tx,
    args.disposition
  );
  if (!destinationLocationId || !sourceLocationId) {
    throw buildMissingLocationError(args.disposition);
  }
  const productId = args.productId ?? assembly?.productId ?? null;
  if (!productId) {
    console.warn("[defect] Skipping movement; missing product", {
      activityId: args.activityId,
      assemblyId: args.assemblyId,
    });
    return null;
  }
  const movement = await tx.productMovement.create({
    data: {
      movementType: DEFECT_MOVEMENT_TYPE[args.disposition],
      date: new Date(),
      jobId: args.jobId,
      assemblyId: args.assemblyId,
      assemblyActivityId: args.activityId,
      productId,
      locationOutId: sourceLocationId,
      locationInId: destinationLocationId,
      quantity: Math.abs(args.quantity),
      notes: `Auto defect movement (${args.disposition})`,
    },
  });
  assertTransferLocations({
    movementType: movement.movementType,
    locationInId: movement.locationInId,
    locationOutId: movement.locationOutId,
    context: { movementId: movement.id, activityId: args.activityId },
  });
  let batchId: number | null = null;
  let sourceBatchId: number | null = null;
  const normalizedStage = (args.stage as string | null) ?? null;
  if (
    normalizedStage === AssemblyStage.finish ||
    normalizedStage === "make"
  ) {
    const destLocation = await tx.location.findUnique({
      where: { id: destinationLocationId },
      select: { name: true },
    });
    const batch = await ensureDestinationBatch(tx, {
      productId,
      jobId: args.jobId,
      assemblyId: args.assemblyId,
      locationId: destinationLocationId,
      name: `A${args.assemblyId} Defect - ${destLocation?.name || "Destination"}`,
    });
    batchId = batch?.id ?? null;
    if (product?.batchTrackingEnabled) {
      const sourceBatch = await findAssemblyStockBatch(tx, {
        productId,
        jobId: args.jobId,
        assemblyId: args.assemblyId,
        locationId: sourceLocationId,
      });
      sourceBatchId = sourceBatch?.id ?? null;
      if (!sourceBatchId) {
        throw new Error(
          "Finished goods batch is missing in stock location; record Finish before Defect."
        );
      }
    }
  }
  assertBatchLinePresence({
    movementType: movement.movementType,
    batchTrackingEnabled: Boolean(product?.batchTrackingEnabled),
    hasBatchId: batchId != null && (!product?.batchTrackingEnabled || sourceBatchId != null),
    context: { movementId: movement.id, productId },
  });
  if (product?.batchTrackingEnabled && sourceBatchId) {
    await tx.productMovementLine.create({
      data: {
        movementId: movement.id,
        productMovementId: movement.id,
        productId,
        batchId: sourceBatchId,
        quantity: -Math.abs(args.quantity),
        notes: "Defect (source)",
      },
    });
  }
  await tx.productMovementLine.create({
    data: {
      movementId: movement.id,
      productMovementId: movement.id,
      productId,
      batchId: batchId ?? undefined,
      quantity: Math.abs(args.quantity),
      notes: `Defect (${args.disposition})`,
    },
  });
  return movement;
}

export async function moveDefectDisposition(
  activityId: number,
  newDisposition: DefectDisposition
) {
  return prisma.$transaction(async (tx) => {
    const activity = await tx.assemblyActivity.findUnique({
      where: { id: activityId },
      select: {
        id: true,
        assemblyId: true,
        jobId: true,
        productId: true,
        quantity: true,
        defectDisposition: true,
        stage: true,
      },
    });
    if (!activity) return null;
    if (!activity.quantity || activity.quantity <= 0) return null;
    const assembly = await tx.assembly.findUnique({
      where: { id: activity.assemblyId ?? 0 },
      select: { jobId: true, productId: true },
    });
    const job = await tx.job.findUnique({
      where: { id: activity.jobId ?? 0 },
      select: { stockLocationId: true },
    });
    const source =
      (await findDestinationLocationId(
        tx,
        (activity.defectDisposition as DefectDisposition) || DefectDisposition.review
      )) ?? job?.stockLocationId ?? null;
    const dest = await findDestinationLocationId(tx, newDisposition);
    if (!source || !dest) return null;
    const productId = activity.productId ?? assembly?.productId ?? null;
    if (!productId) return null;
    assertTransferLocations({
      movementType: DEFECT_MOVEMENT_TYPE[newDisposition],
      locationInId: dest,
      locationOutId: source,
      context: { activityId, assemblyId: activity.assemblyId },
    });
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { batchTrackingEnabled: true },
    });
    const movement = await tx.productMovement.create({
      data: {
        movementType: DEFECT_MOVEMENT_TYPE[newDisposition],
        date: new Date(),
        jobId: activity.jobId ?? undefined,
        assemblyId: activity.assemblyId ?? undefined,
        assemblyActivityId: activity.id,
        productId,
        locationOutId: source,
        locationInId: dest,
        quantity: Math.abs(Number(activity.quantity)),
        notes: `Defect disposition change to ${newDisposition}`,
      },
    });
    const normalizedStage = String(activity.stage || "").toLowerCase();
    if (normalizedStage === "finish" || normalizedStage === "make") {
      const destLocation = await tx.location.findUnique({
        where: { id: dest },
        select: { name: true },
      });
      const batch = await ensureDestinationBatch(tx, {
        productId,
        jobId: activity.jobId ?? null,
        assemblyId: activity.assemblyId ?? null,
        locationId: dest,
        name: `A${activity.assemblyId ?? "?"} Defect - ${destLocation?.name || "Destination"}`,
      });
      let sourceBatchId: number | null = null;
      if (product?.batchTrackingEnabled) {
        const sourceBatch = await findAssemblyStockBatch(tx, {
          productId,
          jobId: activity.jobId ?? null,
          assemblyId: activity.assemblyId ?? null,
          locationId: source,
        });
        sourceBatchId = sourceBatch?.id ?? null;
        if (!sourceBatchId) {
          throw new Error(
            "Finished goods batch is missing in stock location; record Finish before Defect."
          );
        }
      }
      assertBatchLinePresence({
        movementType: movement.movementType,
        batchTrackingEnabled: Boolean(product?.batchTrackingEnabled),
        hasBatchId:
          batch?.id != null && (!product?.batchTrackingEnabled || sourceBatchId != null),
        context: { movementId: movement.id, productId },
      });
      if (product?.batchTrackingEnabled && sourceBatchId) {
        await tx.productMovementLine.create({
          data: {
            movementId: movement.id,
            productMovementId: movement.id,
            productId,
            batchId: sourceBatchId,
            quantity: -Math.abs(Number(activity.quantity)),
            notes: "Defect (source)",
          },
        });
      }
      await tx.productMovementLine.create({
        data: {
          movementId: movement.id,
          productMovementId: movement.id,
          productId,
          batchId: batch?.id ?? undefined,
          quantity: Math.abs(Number(activity.quantity)),
          notes: `Defect disposition change to ${newDisposition}`,
        },
      });
    }
    await tx.assemblyActivity.update({
      where: { id: activityId },
      data: { defectDisposition: newDisposition },
    });
    return movement;
  });
}

type CreateDefectInput = {
  assemblyId: number;
  jobId: number;
  activityDate: Date;
  stage: AssemblyStage;
  quantity: number;
  qtyBreakdown?: number[];
  defectReasonId?: number | null;
  defectDisposition?: DefectDisposition | null;
  notes?: string | null;
  productId?: number | null;
};

export async function createDefectActivity(input: CreateDefectInput) {
  const disposition =
    input.defectDisposition ?? DefectDisposition.review;
  const result = await prisma.$transaction(async (tx) => {
    if (disposition !== DefectDisposition.none) {
      const productIdForCheck = input.productId ?? null;
      const product =
        productIdForCheck != null
          ? await tx.product.findUnique({
              where: { id: productIdForCheck },
              select: { stockTrackingEnabled: true },
            })
          : null;
      if (product?.stockTrackingEnabled !== false) {
        const job = await tx.job.findUnique({
          where: { id: input.jobId },
          select: { stockLocationId: true },
        });
        const destinationLocationId = await findDestinationLocationId(
          tx,
          disposition
        );
        if (!job?.stockLocationId || !destinationLocationId) {
          throw buildMissingLocationError(disposition);
        }
      }
    }
    const activity = await tx.assemblyActivity.create({
      data: {
        assemblyId: input.assemblyId,
        jobId: input.jobId,
        name: "Defect",
        stage: input.stage,
        kind: ActivityKind.defect,
        action: ActivityAction.DEFECT_LOGGED,
        defectDisposition: disposition,
        defectReasonId: input.defectReasonId ?? null,
        activityDate: input.activityDate,
        qtyBreakdown: (input.qtyBreakdown as any) ?? [],
        quantity: input.quantity,
        notes: input.notes ?? null,
        productId: input.productId ?? null,
      },
    });

    const movement = await maybeCreateDefectMovement(tx, {
      activityId: activity.id,
      assemblyId: input.assemblyId,
      jobId: input.jobId,
      productId: input.productId ?? null,
      quantity: input.quantity,
      disposition,
      stage: input.stage,
    });

    return { activity, movement };
  });
  if (result.movement?.productId) {
    // Defect movements are transfer-like and must be reflected in the snapshot immediately.
    await refreshProductStockSnapshot();
  }
  return result.activity;
}
