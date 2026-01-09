import { ActivityAction, ActivityKind, AssemblyStage } from "@prisma/client";
import { prisma } from "~/utils/prisma.server";
import {
  aggregateAssemblyStages,
  type StageAggregation,
} from "~/modules/job/services/stageRows.server";
import {
  computeDownstreamUsed,
  computeExternalGateFromSteps,
  computeReconcileDefault,
  computeReconcileMax,
  anyPositive,
} from "~/modules/job/utils/stageGateUtils";

type ReconcileContext = {
  aggregation: StageAggregation;
  externalGate: ReturnType<typeof computeExternalGateFromSteps>;
};

export async function loadReconcileContext(assemblyId: number): Promise<ReconcileContext> {
  const assembly = await prisma.assembly.findUnique({
    where: { id: assemblyId },
    select: {
      id: true,
      jobId: true,
      qtyOrderedBreakdown: true,
      c_qtyCut_Breakdown: true,
      c_qtySew_Breakdown: true,
      c_qtyFinish_Breakdown: true,
      c_qtyCut: true,
      c_qtySew: true,
      c_qtyFinish: true,
    },
  });
  if (!assembly) {
    throw new Error("Assembly not found.");
  }
  const boxLines = await prisma.boxLine.findMany({
    where: { assemblyId, packingOnly: { not: true } },
    select: { qtyBreakdown: true, quantity: true },
  });
  const packSnapshot = boxLines.reduce(
    (acc, line) => {
      const raw =
        Array.isArray(line.qtyBreakdown) && line.qtyBreakdown.length
          ? (line.qtyBreakdown as number[])
          : line.quantity != null
          ? [Number(line.quantity) || 0]
          : [];
      const len = Math.max(acc.breakdown.length, raw.length);
      for (let i = 0; i < len; i++) {
        acc.breakdown[i] =
          Number(acc.breakdown[i] ?? 0) + Number(raw[i] ?? 0);
      }
      return acc;
    },
    { breakdown: [] as number[], total: 0 }
  );
  packSnapshot.total = packSnapshot.breakdown.reduce(
    (t, n) => t + (Number(n) || 0),
    0
  );
  const activities = await prisma.assemblyActivity.findMany({
    where: { assemblyId },
    select: {
      stage: true,
      kind: true,
      action: true,
      quantity: true,
      qtyBreakdown: true,
      externalStepType: true,
    },
  });
  const aggregation = aggregateAssemblyStages({
    assemblyId,
    orderedBreakdown: (assembly.qtyOrderedBreakdown as number[]) || [],
    fallbackBreakdowns: {
      cut: (assembly.c_qtyCut_Breakdown as number[]) || [],
      sew: (assembly.c_qtySew_Breakdown as number[]) || [],
      finish: (assembly.c_qtyFinish_Breakdown as number[]) || [],
    },
    fallbackTotals: {
      cut: Number(assembly.c_qtyCut ?? 0),
      sew: Number(assembly.c_qtySew ?? 0),
      finish: Number(assembly.c_qtyFinish ?? 0),
    },
    packSnapshot,
    activities,
  });
  const steps = Array.from(aggregation.externalAggregates.values()).map((agg) => ({
    sent: agg.sent,
    received: agg.received,
  }));
  const externalGate = computeExternalGateFromSteps(steps);
  return { aggregation, externalGate };
}

export async function validateReconcileBreakdown(opts: {
  assemblyId: number;
  stage: AssemblyStage;
  breakdown: number[];
}) {
  const { aggregation, externalGate } = await loadReconcileContext(opts.assemblyId);
  const stageKey = String(opts.stage || "").toLowerCase();
  const stats = aggregation.stageStats;
  const downstream = computeDownstreamUsed({
    externalGate,
    sewRecorded: stats.sew.processedArr || [],
    finishRecorded: stats.finish.processedArr || [],
    packRecorded: stats.pack.processedArr || [],
  });
  const usable =
    stageKey === "cut"
      ? stats.cut.usableArr || []
      : stageKey === "sew"
      ? stats.sew.usableArr || []
      : stageKey === "finish"
      ? stats.finish.usableArr || []
      : stageKey === "pack"
      ? stats.pack.usableArr || []
      : [];
  const alreadyReconciled =
    stageKey === "cut"
      ? stats.cut.reconciledDefectArr || []
      : stageKey === "sew"
      ? stats.sew.reconciledDefectArr || []
      : stageKey === "finish"
      ? stats.finish.reconciledDefectArr || []
      : stats.pack.reconciledDefectArr || [];
  const downstreamUsed =
    stageKey === "cut"
      ? downstream.cut
      : stageKey === "sew"
      ? downstream.sew
      : stageKey === "finish"
      ? downstream.finish
      : downstream.pack;
  const maxReconcile = computeReconcileMax(
    usable,
    downstreamUsed,
    alreadyReconciled
  );
  if (!anyPositive(maxReconcile)) {
    return "No reconciliable slack remains at this stage.";
  }
  const len = Math.max(maxReconcile.length, opts.breakdown.length);
  for (let i = 0; i < len; i++) {
    const req = Number(opts.breakdown[i] ?? 0) || 0;
    const cap = Number(maxReconcile[i] ?? 0) || 0;
    if (req > cap) {
      return `Reconcile qty at variant ${i + 1} exceeds remaining slack (${cap}).`;
    }
  }
  return null;
}

export async function createReconcileActivity(opts: {
  assemblyId: number;
  jobId: number;
  stage: AssemblyStage;
  qtyBreakdown: number[];
  activityDate: Date;
  defectDisposition?: string | null;
  defectReasonId?: number | null;
  notes?: string | null;
}) {
  const qtyTotal = (opts.qtyBreakdown || []).reduce(
    (t, n) => t + (Number(n) || 0),
    0
  );
  if (!qtyTotal) {
    throw new Error("Reconcile quantity must be greater than zero.");
  }
  return prisma.assemblyActivity.create({
    data: {
      assemblyId: opts.assemblyId,
      jobId: opts.jobId,
      name: "Reconcile defects",
      stage: opts.stage,
      kind: ActivityKind.defect,
      action: ActivityAction.LOSS_RECONCILED,
      quantity: qtyTotal,
      qtyBreakdown: opts.qtyBreakdown as any,
      activityDate: opts.activityDate,
      defectDisposition: opts.defectDisposition ?? null,
      defectReasonId: opts.defectReasonId ?? null,
      notes: opts.notes ?? null,
    },
  });
}
