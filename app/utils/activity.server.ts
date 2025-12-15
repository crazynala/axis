import type { Prisma } from "@prisma/client";
import {
  ActivityKind,
  ActivityAction,
  AssemblyStage,
  DefectDisposition,
} from "@prisma/client";
import { prisma, refreshProductStockSnapshot } from "./prisma.server";

type CutConsumptionLine = {
  batchId: number;
  qty: number; // positive number entered by user; server will store as negative for consumption
  notes?: string | null;
};

type CutConsumption = {
  costingId: number;
  lines: CutConsumptionLine[];
};

export async function createCutActivity(options: {
  assemblyId: number;
  jobId: number;
  activityDate: Date;
  qtyBreakdown: number[];
  notes?: string | null;
  consumptions: CutConsumption[];
  groupKey?: string | null;
  refreshStockSnapshot?: boolean;
}) {
  const {
    assemblyId,
    jobId,
    activityDate,
    qtyBreakdown,
    notes,
    consumptions,
    groupKey,
    refreshStockSnapshot = true,
  } = options;
  const totalCut = (qtyBreakdown || []).reduce(
    (t, n) => (Number.isFinite(n) ? t + (n as number) : t),
    0
  );
  console.log("[activity] createCutActivity begin", {
    assemblyId,
    jobId,
    activityDate: activityDate?.toISOString?.() || activityDate,
    totalCut,
    lines: (consumptions || []).reduce(
      (t, c) => t + (c?.lines?.length || 0),
      0
    ),
  });

  const result = await prisma.$transaction(async (tx) => {
    // Create the assembly activity first
    const activity = await tx.assemblyActivity.create({
      data: {
        assemblyId,
        jobId,
        name: "Cut",
        stage: AssemblyStage.cut,
        kind: ActivityKind.normal,
        action: ActivityAction.RECORDED,
        activityDate,
        qtyBreakdown: qtyBreakdown as any,
        quantity: totalCut,
        notes: notes ?? null,
        groupKey: groupKey ?? null,
      },
    });

    // For each costing selection, create ProductMovements grouped by batch location
    for (const cons of consumptions || []) {
      const rawLines = (cons?.lines || []).filter(
        (l) => Number(l.qty) > 0 && Number.isFinite(Number(l.qty))
      );
      if (!rawLines.length) continue;

      // Fetch costing to determine the productId for the header
      const costing = await tx.costing.findUnique({
        where: { id: cons.costingId },
        select: { productId: true },
      });

      // Enrich lines with batch product/location and group by locationId
      type Enriched = CutConsumptionLine & {
        productId: number | null;
        locationId: number | null;
      };
      const enriched: Enriched[] = [];
      for (const line of rawLines) {
        const b = await tx.batch.findUnique({
          where: { id: line.batchId },
          select: { productId: true, locationId: true },
        });
        enriched.push({
          ...line,
          productId: b?.productId ?? null,
          locationId: b?.locationId ?? null,
        });
      }

      const byLocation = new Map<number | null, Enriched[]>();
      for (const l of enriched) {
        const key = l.locationId ?? null;
        const arr = byLocation.get(key) ?? [];
        arr.push(l);
        byLocation.set(key, arr);
      }

      for (const [locId, lines] of byLocation.entries()) {
        const totalQty = lines.reduce(
          (t, l) => t + Math.abs(Number(l.qty) || 0),
          0
        );
        // Prefer costing.productId; fallback to first line's productId
        const headerProductId =
          costing?.productId ??
          lines.find((l) => l.productId != null)?.productId ??
          undefined;
        const movement = await tx.productMovement.create({
          data: {
            movementType: "Assembly",
            date: activityDate,
            jobId,
            assemblyId,
            assemblyActivityId: activity.id,
            costingId: cons.costingId,
            locationOutId: locId ?? undefined,
            productId: headerProductId as number | undefined,
            quantity: totalQty,
            notes: "Cut consumption",
          },
        });
        for (const line of lines) {
          await tx.productMovementLine.create({
            data: {
              movementId: movement.id,
              productMovementId: movement.id,
              productId: (line.productId ?? headerProductId) as
                | number
                | undefined,
              batchId: line.batchId,
              costingId: cons.costingId,
              quantity: -Math.abs(Number(line.qty)),
              notes: line.notes ?? null,
            },
          });
        }
      }
    }

    return activity;
  });

  if (refreshStockSnapshot) {
    await refreshProductStockSnapshot();
  }
  return result;
}

type FinishInventoryParams = {
  activityId: number;
  assemblyId: number;
  jobId: number;
  qtyBreakdown: number[];
  activityDate: Date;
  groupKey?: string | null;
};

export async function ensureFinishInventoryArtifacts(
  tx: Prisma.TransactionClient,
  params: FinishInventoryParams
) {
  const {
    activityId,
    assemblyId,
    jobId,
    qtyBreakdown,
    activityDate,
    groupKey,
  } = params;
  const totalFinish = (qtyBreakdown || []).reduce(
    (t, n) => (Number.isFinite(n) ? t + (n as number) : t),
    0
  );
  if (totalFinish <= 0) return;

  const [assembly, job] = await Promise.all([
    tx.assembly.findUnique({
      where: { id: assemblyId },
      select: { id: true, name: true, productId: true },
    }),
    tx.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        name: true,
        projectCode: true,
        stockLocationId: true,
      },
    }),
  ]);
  if (!assembly || !assembly.productId || !job) {
    console.warn(
      "[activity.finish] Missing assembly/job/product context; skipping inventory movement",
      { activityId, assemblyId, jobId }
    );
    return;
  }

  const identifier = (job.projectCode || "").trim() || `Job ${job.id}`;
  const jobName = (job.name || "").trim();
  const assemblyName = (assembly.name || `Assembly ${assembly.id}`).trim();
  const batchName = [identifier, jobName, assemblyName]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  let batch = await tx.batch.findFirst({
    where: {
      productId: assembly.productId,
      jobId: job.id,
      assemblyId: assembly.id,
      name: batchName,
    },
  });
  if (!batch) {
    batch = await tx.batch.create({
      data: {
        productId: assembly.productId,
        jobId: job.id,
        assemblyId: assembly.id,
        locationId: job.stockLocationId ?? undefined,
        name: batchName,
        receivedAt: activityDate,
        source: "Assembly Finish",
      },
    });
  } else {
    const updates: Record<string, unknown> = {};
    if ((batch.name || "") !== batchName) updates.name = batchName;
    if ((batch.locationId ?? null) !== (job.stockLocationId ?? null)) {
      updates.locationId = job.stockLocationId ?? null;
    }
    if (Object.keys(updates).length) {
      batch = await tx.batch.update({ where: { id: batch.id }, data: updates });
    }
  }

  const movement = await tx.productMovement.create({
    data: {
      movementType: "Assembly",
      date: activityDate,
      jobId: job.id,
      assemblyId: assembly.id,
      assemblyActivityId: activityId,
      productId: assembly.productId,
      locationInId: job.stockLocationId ?? undefined,
      quantity: totalFinish,
      notes: "Assembly finish output",
      groupKey: groupKey ?? null,
    },
  });

  await tx.productMovementLine.create({
    data: {
      movementId: movement.id,
      productMovementId: movement.id,
      productId: assembly.productId,
      batchId: batch.id,
      quantity: Math.abs(totalFinish),
      notes: "Assembly finish output",
    },
  });
}

export async function createFinishActivity(options: {
  assemblyId: number;
  jobId: number;
  activityDate: Date;
  qtyBreakdown: number[];
  notes?: string | null;
  groupKey?: string | null;
  refreshStockSnapshot?: boolean;
}) {
  const {
    assemblyId,
    jobId,
    activityDate,
    qtyBreakdown,
    notes,
    groupKey,
    refreshStockSnapshot = true,
  } = options;
  const totalFinish = (qtyBreakdown || []).reduce(
    (t, n) => (Number.isFinite(n) ? t + (n as number) : t),
    0
  );
  console.log("[activity] createFinishActivity begin", {
    assemblyId,
    jobId,
    activityDate: activityDate?.toISOString?.() || activityDate,
    totalMake: totalFinish,
  });
  const activity = await prisma.$transaction(async (tx) => {
    const created = await tx.assemblyActivity.create({
      data: {
        assemblyId,
        jobId,
        name: "Finish",
        stage: AssemblyStage.finish,
        kind: ActivityKind.normal,
        action: ActivityAction.RECORDED,
        activityDate,
        qtyBreakdown: qtyBreakdown as any,
        quantity: totalFinish,
        notes: notes ?? null,
        groupKey: groupKey ?? null,
      },
    });
    await ensureFinishInventoryArtifacts(tx, {
      activityId: created.id,
      assemblyId,
      jobId,
      qtyBreakdown,
      activityDate,
      groupKey,
    });
    return created;
  });
  if (refreshStockSnapshot) {
    await refreshProductStockSnapshot();
  }
  return activity;
}
