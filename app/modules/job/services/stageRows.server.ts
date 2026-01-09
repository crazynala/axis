import {
  ActivityAction,
  ActivityKind,
  ExternalStepType,
  type AssemblyActivity,
} from "@prisma/client";
import type { DerivedExternalStep } from "~/modules/job/types/externalSteps";
import type { StageRow } from "~/modules/job/types/stageRows";
import { buildExternalStepsByAssembly } from "~/modules/job/services/externalSteps.server";
import { prisma } from "~/utils/prisma.server";
import { computeEffectiveOrderedBreakdown } from "~/modules/job/quantityUtils";
import {
  computeExternalGateFromSteps,
  computeFinishCapBreakdown,
} from "~/modules/job/utils/stageGateUtils";

type AggregationActivity = {
  stage?: string | null;
  kind?: ActivityKind | string | null;
  action?: ActivityAction | null;
  quantity?: number | null;
  qtyBreakdown?: Array<number | null> | null;
  externalStepType?: ExternalStepType | null;
};

export type StageStats = {
  goodArr: number[];
  defectArr: number[];
  loggedDefectArr: number[];
  reconciledDefectArr: number[];
  processedArr: number[];
  usableArr: number[];
  attemptsArr: number[];
  goodTotal: number;
  defectTotal: number;
  loggedDefectTotal: number;
  reconciledDefectTotal: number;
  processedTotal: number;
  usableTotal: number;
  attemptsTotal: number;
};

type StageStatsMap = Record<"cut" | "sew" | "finish" | "pack" | "qc", StageStats>;

type ExternalAggregate = {
  sent: number[];
  received: number[];
  net: number[];
  loss: number[];
  sentTotal: number;
  receivedTotal: number;
  netTotal: number;
  lossTotal: number;
};

export type StageAggregation = {
  assemblyId: number;
  orderedRaw: number[];
  canceled: number[];
  ordered: number[];
  orderedTotal: number;
  displayArrays: Record<"cut" | "sew" | "finish" | "pack" | "qc", number[]>;
  totals: Record<"cut" | "sew" | "finish" | "pack" | "qc", number>;
  stageStats: StageStatsMap;
  externalAggregates: Map<ExternalStepType, ExternalAggregate>;
};

export type AggregateStageOptions = {
  assemblyId: number;
  orderedBreakdown?: number[] | null;
  fallbackBreakdowns: {
    cut?: number[] | null;
    sew?: number[] | null;
    finish?: number[] | null;
  };
  fallbackTotals: {
    cut?: number | null;
    sew?: number | null;
    finish?: number | null;
  };
  packSnapshot: { breakdown: number[]; total: number };
  activities: AggregationActivity[];
};

export function aggregateAssemblyStages(
  options: AggregateStageOptions
): StageAggregation {
  const {
    assemblyId,
    orderedBreakdown,
    fallbackBreakdowns,
    fallbackTotals,
    packSnapshot,
    activities,
  } = options;
  const orderedRaw = Array.isArray(orderedBreakdown)
    ? normalizeBreakdown(orderedBreakdown, 0, false)
    : [];
  const canceledBreakdown = sumBreakdownsForStage(activities, "cancel");
  const { effective: ordered, total: orderedTotal } = computeEffectiveOrderedBreakdown({
    orderedBySize: orderedRaw,
    canceledBySize: canceledBreakdown,
  });
  const stageActs = {
    cut: filterStage(activities, "cut"),
    sew: filterStage(activities, "sew"),
    finish: filterStage(activities, "finish"),
    pack: filterStage(activities, "pack"),
    qc: filterStage(activities, "qc"),
  };
  const fallbackCutArr = normalizeBreakdown(
    fallbackBreakdowns.cut || [],
    0,
    false
  );
  const fallbackSewArr = normalizeBreakdown(
    fallbackBreakdowns.sew || [],
    0,
    false
  );
  const fallbackFinishArr = normalizeBreakdown(
    fallbackBreakdowns.finish || [],
    0,
    false
  );
  const fallbackPackArr = normalizeBreakdown(packSnapshot.breakdown, packSnapshot.total);
  const fallbackPackTotal = Math.max(packSnapshot.total ?? 0, sumArray(fallbackPackArr));
  const stageStats: StageStatsMap = {
    cut: computeStageStats(stageActs.cut, fallbackCutArr, Number(fallbackTotals.cut ?? 0)),
    sew: computeStageStats(stageActs.sew, fallbackSewArr, Number(fallbackTotals.sew ?? 0)),
    finish: computeStageStats(
      stageActs.finish,
      fallbackFinishArr,
      Number(fallbackTotals.finish ?? 0)
    ),
    pack: computeStageStats(stageActs.pack, fallbackPackArr, fallbackPackTotal, {
      useFallbackIfNoNormal: true,
    }),
    qc: computeStageStats(stageActs.qc, [], 0),
  };

  const usableCutArr = stageStats.cut.usableArr;
  const hasSewData =
    stageStats.sew.attemptsTotal > 0 || fallbackSewArr.some((n) => Number(n) > 0);
  const hasFinishData =
    stageStats.finish.attemptsTotal > 0 || fallbackFinishArr.some((n) => Number(n) > 0);
  const sewArrRaw = stageStats.sew.usableArr;
  const finishArrRaw = stageStats.finish.usableArr;
  const usableSewArr = hasSewData ? minArrays(sewArrRaw, usableCutArr) : sewArrRaw;
  const sewLimitBase = hasSewData ? usableSewArr : usableCutArr;
  const usableFinishArr = hasFinishData
    ? minArrays(finishArrRaw, sewLimitBase)
    : finishArrRaw;
  const hasPackData =
    stageStats.pack.attemptsTotal > 0 ||
    fallbackPackArr.some((n) => Number(n ?? 0) !== 0);
  const usablePackArr = hasPackData
    ? minArrays(stageStats.pack.usableArr, usableFinishArr)
    : usableFinishArr;

  const displayCutArr = hasSewData ? minArrays(usableCutArr, usableSewArr) : usableCutArr;
  const displaySewArr = hasFinishData
    ? minArrays(usableSewArr, usableFinishArr)
    : usableSewArr;
  const displayFinishArr = usableFinishArr;
  const displayPackArr = hasPackData
    ? usablePackArr
    : Array.from({ length: usableFinishArr.length }, () => 0);
  const displayQcArr = stageStats.qc.usableArr;

  const displayArrays = {
    cut: displayCutArr,
    sew: displaySewArr,
    finish: displayFinishArr,
    pack: displayPackArr,
    qc: displayQcArr,
  };
  const totals = {
    cut: sumArray(displayCutArr),
    sew: sumArray(displaySewArr),
    finish: sumArray(displayFinishArr),
    pack: sumArray(displayPackArr),
    qc: sumArray(displayQcArr),
  };
  const externalAggregates = buildExternalAggregates(activities);

  return {
    assemblyId,
    orderedRaw,
    canceled: canceledBreakdown,
    ordered,
    orderedTotal,
    displayArrays,
    totals,
    stageStats,
    externalAggregates,
  };
}

export function buildStageRowsFromAggregation(options: {
  aggregation: StageAggregation;
  derivedExternalSteps: DerivedExternalStep[] | undefined | null;
}): {
  rows: StageRow[];
  finishInput: { breakdown: number[]; total: number };
} {
  const { aggregation, derivedExternalSteps } = options;
  const rows: StageRow[] = [];
  const sewGate = computeSewGateBreakdown({
    aggregation,
    derivedExternalSteps,
    allowCutFallback: false,
  });
  rows.push({
    kind: "internal",
    stage: "order",
    label: "Ordered",
    breakdown: aggregation.ordered,
    total: aggregation.orderedTotal,
  });
  rows.push({
    kind: "internal",
    stage: "cut",
    label: "Cut",
    breakdown: aggregation.displayArrays.cut,
    total: aggregation.totals.cut,
    loss: aggregation.stageStats.cut.defectArr,
    lossTotal: aggregation.stageStats.cut.defectTotal,
    loggedDefectTotal: aggregation.stageStats.cut.loggedDefectTotal,
  });
  rows.push({
    kind: "internal",
    stage: "sew",
    label: "Sew",
    breakdown: sewGate.breakdown,
    total: sewGate.total,
    loss: aggregation.stageStats.sew.defectArr,
    lossTotal: aggregation.stageStats.sew.defectTotal,
    loggedDefectTotal: aggregation.stageStats.sew.loggedDefectTotal,
    hint: formatSewGateHint(sewGate.source),
  });

  const externalSteps = Array.isArray(derivedExternalSteps)
    ? derivedExternalSteps
    : [];
  for (const step of externalSteps) {
    const aggregates = aggregation.externalAggregates.get(step.type) ?? emptyExternalAggregate();
    rows.push({
      kind: "external",
      stage: "external",
      label: step.label,
      externalStepType: step.type,
      expected: step.expected,
      status: step.status,
      etaDate: step.etaDate,
      isLate: Boolean(step.isLate),
      vendor: step.vendor ?? null,
      lowConfidence: Boolean(step.lowConfidence),
      leadTimeDays: step.leadTimeDays ?? null,
      leadTimeSource: step.leadTimeSource ?? null,
      activities: step.activities,
      sent: aggregates.sent,
      received: aggregates.received,
      net: aggregates.net,
      loss: aggregates.loss,
      totals: {
        sent: aggregates.sentTotal,
        received: aggregates.receivedTotal,
        net: aggregates.netTotal,
        loss: aggregates.lossTotal,
      },
    });
  }

  rows.push({
    kind: "internal",
    stage: "finish",
    label: "Finish",
    breakdown: aggregation.displayArrays.finish,
    total: aggregation.totals.finish,
    loss: aggregation.stageStats.finish.defectArr,
    lossTotal: aggregation.stageStats.finish.defectTotal,
    loggedDefectTotal: aggregation.stageStats.finish.loggedDefectTotal,
  });
  rows.push({
    kind: "internal",
    stage: "pack",
    label: "Pack",
    breakdown: aggregation.displayArrays.pack,
    total: aggregation.totals.pack,
    loss: aggregation.stageStats.pack.defectArr,
    lossTotal: aggregation.stageStats.pack.defectTotal,
    loggedDefectTotal: aggregation.stageStats.pack.loggedDefectTotal,
  });
  rows.push({
    kind: "internal",
    stage: "qc",
    label: "QC",
    breakdown: aggregation.displayArrays.qc,
    total: aggregation.totals.qc,
    loss: aggregation.stageStats.qc.defectArr,
    lossTotal: aggregation.stageStats.qc.defectTotal,
    loggedDefectTotal: aggregation.stageStats.qc.loggedDefectTotal,
  });

  const externalGate = computeExternalGateFromSteps(
    externalSteps.map((step) => {
      const aggregates =
        aggregation.externalAggregates.get(step.type) ??
        emptyExternalAggregate();
      return { sent: aggregates.sent, received: aggregates.received };
    })
  );
  const sewRecorded = aggregation.stageStats.sew.goodArr || [];
  const cutRecorded = aggregation.stageStats.cut.goodArr || [];
  const sewHasExplicit = aggregation.stageStats.sew.attemptsTotal > 0;
  const finishInputBreakdown = computeFinishCapBreakdown({
    externalGate,
    sewRecorded,
    sewHasExplicit,
    cutRecorded,
    finishRecorded: aggregation.stageStats.finish.goodArr || [],
    finishLogged: [],
    finishLossReconciled: aggregation.stageStats.finish.defectArr || [],
  });
  const finishInput = {
    breakdown: finishInputBreakdown,
    total: sumArray(finishInputBreakdown),
  };

  return { rows, finishInput };
}

export async function loadAssemblyStageRows(
  assemblyId: number
): Promise<StageRow[]> {
  const assembly = await prisma.assembly.findUnique({
    where: { id: assemblyId },
    include: {
      costings: {
        select: {
          id: true,
          externalStepType: true,
          leadTimeDays: true,
          product: {
            select: {
              id: true,
              leadTimeDays: true,
              supplier: {
                select: {
                  id: true,
                  name: true,
                  defaultLeadTimeDays: true,
                },
              },
              externalStepType: true,
            },
          },
        },
      },
      product: {
        select: {
          id: true,
          leadTimeDays: true,
          supplier: {
            select: {
              id: true,
              name: true,
              defaultLeadTimeDays: true,
            },
          },
        },
      },
    },
  });
  if (!assembly) return [];
  const boxLines = await prisma.boxLine.findMany({
    where: { assemblyId, packingOnly: { not: true } },
    select: { qtyBreakdown: true, quantity: true },
  });
  const packSnapshot = mergePackBreakdown(boxLines);
  const activitiesRaw = await prisma.assemblyActivity.findMany({
    where: { assemblyId },
    include: {
      vendorCompany: { select: { id: true, name: true } },
    },
    orderBy: [{ activityDate: "desc" }, { id: "desc" }],
  });
  const activities = activitiesRaw.map(normalizeActivityForAggregation);
  const aggregation = aggregateAssemblyStages({
    assemblyId,
    orderedBreakdown: assembly.qtyOrderedBreakdown as number[] | null,
    fallbackBreakdowns: {
      cut: (assembly as any).c_qtyCut_Breakdown || [],
      sew: (assembly as any).c_qtySew_Breakdown || [],
      finish: (assembly as any).c_qtyFinish_Breakdown || [],
    },
    fallbackTotals: {
      cut: (assembly as any).c_qtyCut ?? 0,
      sew: (assembly as any).c_qtySew ?? 0,
      finish: (assembly as any).c_qtyFinish ?? 0,
    },
    packSnapshot,
    activities,
  });
  const activitiesByAssembly = new Map<number, AssemblyActivity[]>();
  activitiesByAssembly.set(assemblyId, activitiesRaw);
  const quantityByAssembly = new Map<
    number,
    { totals?: { cut?: number; sew?: number; finish?: number; pack?: number } }
  >();
  quantityByAssembly.set(assemblyId, {
    totals: {
      cut: aggregation.totals.cut,
      sew: aggregation.totals.sew,
      finish: aggregation.totals.finish,
      pack: aggregation.totals.pack,
    },
  });
  const externalSteps = buildExternalStepsByAssembly({
    assemblies: [assembly],
    activitiesByAssembly,
    quantityByAssembly,
  });
  const derivedSteps = externalSteps[assemblyId] || [];
  const { rows } = buildStageRowsFromAggregation({
    aggregation,
    derivedExternalSteps: derivedSteps,
  });
  return rows;
}

function filterStage(
  activities: AggregationActivity[],
  stage: "cut" | "sew" | "finish" | "pack" | "qc"
) {
  return (activities || []).filter((act) => {
    const raw = String(act?.stage || "").toLowerCase();
    return raw === stage;
  });
}

function computeStageStats(
  acts: AggregationActivity[],
  fallbackArr: number[],
  fallbackTotal: number,
  options?: { useFallbackIfNoNormal?: boolean }
): StageStats {
  if (!acts.length) {
    const arrCopy = [...fallbackArr];
    return {
      goodArr: arrCopy,
      defectArr: [],
      loggedDefectArr: [],
      reconciledDefectArr: [],
      processedArr: arrCopy,
      usableArr: arrCopy,
      attemptsArr: arrCopy,
      goodTotal: fallbackTotal,
      defectTotal: 0,
      loggedDefectTotal: 0,
      reconciledDefectTotal: 0,
      processedTotal: fallbackTotal,
      usableTotal: fallbackTotal,
      attemptsTotal: fallbackTotal,
    };
  }
  const goodArr: number[] = [];
  const defectArr: number[] = [];
  const loggedDefectArr: number[] = [];
  const reconciledDefectArr: number[] = [];
  let goodTotal = 0;
  let defectTotal = 0;
  let loggedDefectTotal = 0;
  let reconciledDefectTotal = 0;
  for (const act of acts) {
    const qty = Number(act.quantity ?? 0) || 0;
    const breakdown = normalizeBreakdown(act.qtyBreakdown, qty);
    if (
      String(act.kind || "").toLowerCase() ===
      ActivityKind.defect.toLowerCase()
    ) {
      defectTotal += qty;
      addInto(defectArr, breakdown);
      if (act.action === ActivityAction.LOSS_RECONCILED ||
          act.action === ActivityAction.ADJUSTMENT) {
        reconciledDefectTotal += qty;
        addInto(reconciledDefectArr, breakdown);
      }
      if (act.action === ActivityAction.DEFECT_LOGGED) {
        loggedDefectTotal += qty;
        addInto(loggedDefectArr, breakdown);
      }
    } else {
      goodTotal += qty;
      addInto(goodArr, breakdown);
    }
  }
  if (
    options?.useFallbackIfNoNormal &&
    goodTotal === 0 &&
    defectTotal > 0 &&
    fallbackArr.length
  ) {
    goodArr.splice(0, goodArr.length, ...fallbackArr);
    goodTotal = fallbackTotal;
  }
  const len = Math.max(
    goodArr.length,
    defectArr.length,
    loggedDefectArr.length,
    reconciledDefectArr.length
  );
  const processedArr: number[] = [];
  const usableArr: number[] = [];
  const attemptsArr: number[] = [];
  for (let i = 0; i < len; i++) {
    const good = Number(goodArr[i] ?? 0) || 0;
    const bad = Number(defectArr[i] ?? 0) || 0;
    processedArr[i] = good + bad;
    usableArr[i] = good;
    attemptsArr[i] = processedArr[i];
  }
  const processedTotal = goodTotal + defectTotal;
  return {
    goodArr,
    defectArr,
    loggedDefectArr,
    reconciledDefectArr,
    processedArr,
    usableArr,
    attemptsArr,
    goodTotal,
    defectTotal,
    loggedDefectTotal,
    reconciledDefectTotal,
    processedTotal,
    usableTotal: goodTotal,
    attemptsTotal: processedTotal,
  };
}

function addInto(target: number[], source: number[]) {
  const len = Math.max(target.length, source.length);
  for (let i = 0; i < len; i++) {
    const curr = Number(target[i] ?? 0) || 0;
    const val = Number(source[i] ?? 0) || 0;
    target[i] = curr + val;
  }
}

function normalizeBreakdown(
  arr: Array<number | null> | null | undefined,
  fallbackQty: number,
  allowFallbackQty = true
): number[] {
  if (Array.isArray(arr) && arr.length) {
    return arr.map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0));
  }
  if (allowFallbackQty && Number.isFinite(fallbackQty) && fallbackQty > 0) {
    return [Number(fallbackQty) || 0];
  }
  return [];
}

function sumArray(arr: number[]) {
  return (arr || []).reduce((total, value) => total + (Number(value) || 0), 0);
}

function minArrays(a: number[], b: number[]) {
  const len = Math.max(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    out[i] = Math.min(Number(a[i] ?? 0) || 0, Number(b[i] ?? 0) || 0);
  }
  return out;
}

function maxArrays(a: number[], b: number[]) {
  const len = Math.max(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    out[i] = Math.max(Number(a[i] ?? 0) || 0, Number(b[i] ?? 0) || 0);
  }
  return out;
}

function hasAny(arr: number[]) {
  return (arr || []).some((val) => Number(val ?? 0) > 0);
}

type SewGateSource =
  | "external_received"
  | "external_sent"
  | "sew"
  | "finish"
  | "fallback_cut"
  | "none";

export function computeSewGateBreakdown(options: {
  aggregation: StageAggregation;
  derivedExternalSteps: DerivedExternalStep[] | undefined | null;
  allowCutFallback?: boolean;
}): { breakdown: number[]; total: number; source: SewGateSource } {
  const { aggregation, derivedExternalSteps, allowCutFallback = true } = options;
  const externalSteps = Array.isArray(derivedExternalSteps)
    ? derivedExternalSteps
    : [];
  if (externalSteps.length) {
    let receivedGate: number[] | null = null;
    for (const step of externalSteps) {
      const aggregates =
        aggregation.externalAggregates.get(step.type) ??
        emptyExternalAggregate();
      if (!hasAny(aggregates.received)) continue;
      receivedGate = receivedGate
        ? minArrays(receivedGate, aggregates.received)
        : [...aggregates.received];
    }
    if (receivedGate && hasAny(receivedGate)) {
      return {
        breakdown: receivedGate,
        total: sumArray(receivedGate),
        source: "external_received",
      };
    }
    let sentGate: number[] | null = null;
    for (const step of externalSteps) {
      const aggregates =
        aggregation.externalAggregates.get(step.type) ??
        emptyExternalAggregate();
      if (!hasAny(aggregates.sent)) continue;
      sentGate = sentGate
        ? minArrays(sentGate, aggregates.sent)
        : [...aggregates.sent];
    }
    if (sentGate && hasAny(sentGate)) {
      return {
        breakdown: sentGate,
        total: sumArray(sentGate),
        source: "external_sent",
      };
    }
  }

  const sewArr = aggregation.stageStats.sew.processedArr || [];
  const finishArr = aggregation.stageStats.finish.processedArr || [];
  const sewTotal = sumArray(sewArr);
  const finishTotal = sumArray(finishArr);
  if (sewTotal > 0 || finishTotal > 0) {
    const breakdown = maxArrays(sewArr, finishArr);
    return {
      breakdown,
      total: sumArray(breakdown),
      source: finishTotal >= sewTotal ? "finish" : "sew",
    };
  }

  const fallback = aggregation.stageStats.cut.processedArr || [];
  if (!allowCutFallback) {
    return { breakdown: [], total: 0, source: "none" };
  }
  return {
    breakdown: fallback,
    total: sumArray(fallback),
    source: "fallback_cut",
  };
}

function formatSewGateHint(source: SewGateSource): string | undefined {
  switch (source) {
    case "external_received":
      return "Implied from external received";
    case "external_sent":
      return "Implied from external sent";
    case "finish":
      return "Implied from finish";
    case "fallback_cut":
      return "Implied from cut usable";
    default:
      return undefined;
  }
}

function buildExternalAggregates(
  activities: AggregationActivity[]
): Map<ExternalStepType, ExternalAggregate> {
  const map = new Map<ExternalStepType, ExternalAggregate>();
  for (const act of activities) {
    const type = act.externalStepType;
    if (!type) continue;
    if (
      act.action !== ActivityAction.SENT_OUT &&
      act.action !== ActivityAction.RECEIVED_IN
    ) {
      continue;
    }
    const breakdown = normalizeBreakdown(act.qtyBreakdown, Number(act.quantity ?? 0));
    if (!breakdown.length) continue;
    const agg = map.get(type) ?? {
      sent: [],
      received: [],
      net: [],
      loss: [],
      sentTotal: 0,
      receivedTotal: 0,
      netTotal: 0,
      lossTotal: 0,
    };
    if (act.action === ActivityAction.SENT_OUT) addInto(agg.sent, breakdown);
    else addInto(agg.received, breakdown);
    map.set(type, agg);
  }
  for (const agg of map.values()) {
    const len = Math.max(agg.sent.length, agg.received.length);
    agg.net = [];
    agg.loss = [];
    for (let i = 0; i < len; i++) {
      const sent = Number(agg.sent[i] ?? 0) || 0;
      const received = Number(agg.received[i] ?? 0) || 0;
      agg.net[i] = Math.min(sent, received);
      agg.loss[i] = Math.max(sent - received, 0);
    }
    agg.sentTotal = sumArray(agg.sent);
    agg.receivedTotal = sumArray(agg.received);
    agg.netTotal = sumArray(agg.net);
    agg.lossTotal = sumArray(agg.loss);
  }
  return map;
}

function emptyExternalAggregate(): ExternalAggregate {
  return {
    sent: [],
    received: [],
    net: [],
    loss: [],
    sentTotal: 0,
    receivedTotal: 0,
    netTotal: 0,
    lossTotal: 0,
  };
}

function mergePackBreakdown(
  boxLines: Array<{ qtyBreakdown: number[] | null; quantity: number | null }>
): { breakdown: number[]; total: number } {
  const breakdown: number[] = [];
  let total = 0;
  for (const line of boxLines || []) {
    const arr = normalizeBreakdown(line.qtyBreakdown, Number(line.quantity ?? 0));
    addInto(breakdown, arr);
  }
  total = sumArray(breakdown);
  return { breakdown, total };
}

function normalizeActivityForAggregation(act: AssemblyActivity): AggregationActivity {
  let stage = String(act.stage || "").toLowerCase();
  if (!stage) {
    const name = String(act.name || "").toLowerCase();
    if (name.includes("cut")) stage = "cut";
    else if (name.includes("sew")) stage = "sew";
    else if (name.includes("finish") || name.includes("make")) stage = "finish";
    else if (name.includes("pack")) stage = "pack";
    else if (name.includes("qc")) stage = "qc";
    else if (name.includes("cancel")) stage = "cancel";
    else stage = "other";
  }
  if (stage === "make") stage = "finish";
  if (stage === "trim") stage = "sew";
  if (stage === "embroidery") stage = "finish";
  const kind = (act.kind || ActivityKind.normal).toLowerCase() as ActivityKind;
  return {
    stage,
    kind,
    action: act.action,
    quantity: act.quantity,
    qtyBreakdown: act.qtyBreakdown as any,
    externalStepType: act.externalStepType,
  };
}

function sumBreakdownsForStage(
  activities: AggregationActivity[],
  stage: string
): number[] {
  const breakdowns: number[][] = [];
  for (const act of activities || []) {
    const raw = String(act?.stage || "").toLowerCase();
    if (raw !== stage) continue;
    const arr = normalizeBreakdown(act.qtyBreakdown, Number(act.quantity ?? 0));
    if (arr.length) breakdowns.push(arr);
  }
  return breakdowns.reduce((total, arr) => {
    addInto(total, arr);
    return total;
  }, [] as number[]);
}
