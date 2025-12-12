import {
  ActivityKind,
  AssemblyStage,
  DefectDisposition,
  Prisma,
} from "@prisma/client";
import { prisma } from "~/utils/prisma.server";

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
    console.warn("[defect] Skipping movement; missing locations", {
      sourceLocationId,
      destinationLocationId,
      disposition: args.disposition,
    });
    return null;
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
  let batchId: number | null = null;
  if (args.stage === AssemblyStage.make) {
    const batch = await tx.batch.findFirst({
      where: {
        productId,
        assemblyId: args.assemblyId,
        jobId: args.jobId,
      },
      orderBy: { createdAt: "desc" },
    });
    batchId = batch?.id ?? null;
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
    await tx.productMovementLine.create({
      data: {
        movementId: movement.id,
        productMovementId: movement.id,
        productId,
        quantity: Math.abs(Number(activity.quantity)),
        notes: `Defect disposition change to ${newDisposition}`,
      },
    });
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
  return prisma.$transaction(async (tx) => {
    const activity = await tx.assemblyActivity.create({
      data: {
        assemblyId: input.assemblyId,
        jobId: input.jobId,
        name: "Defect",
        stage: input.stage,
        kind: ActivityKind.defect,
        defectDisposition: disposition,
        defectReasonId: input.defectReasonId ?? null,
        activityDate: input.activityDate,
        qtyBreakdown: (input.qtyBreakdown as any) ?? [],
        quantity: input.quantity,
        notes: input.notes ?? null,
        productId: input.productId ?? null,
      },
    });

    await maybeCreateDefectMovement(tx, {
      activityId: activity.id,
      assemblyId: input.assemblyId,
      jobId: input.jobId,
      productId: input.productId ?? null,
      quantity: input.quantity,
      disposition,
      stage: input.stage,
    });

    return activity;
  });
}
