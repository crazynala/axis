import { json, redirect } from "@remix-run/node";
import type { Prisma } from "@prisma/client";
import { ActivityAction, ActivityKind, AssemblyStage, ExternalStepType } from "@prisma/client";
import { prisma } from "~/utils/prisma.server";
import { deleteSplitActivity, upsertSplitActivity } from "~/utils/activity.server";
import { aggregateAssemblyStages } from "~/modules/job/services/stageRows.server";
import { buildExternalStepsByAssembly } from "~/modules/job/services/externalSteps.server";
import { computeDownstreamUsed, computeExternalGateFromSteps } from "~/modules/job/utils/stageGateUtils";

type AllocationInput = {
  childAssemblyId?: number | null;
  childKey?: string | null;
  breakdown: number[];
  finishBreakdown: number[];
  externalAllocations: Record<string, { sent?: number[]; received?: number[] }>;
};

function parseAllocations(raw: string): AllocationInput[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        childAssemblyId:
          item?.childAssemblyId != null ? Number(item.childAssemblyId) : null,
        childKey: item?.childKey != null ? String(item.childKey) : null,
        breakdown: Array.isArray(item?.breakdown)
          ? item.breakdown.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0))
          : [],
        finishBreakdown: Array.isArray(item?.finishBreakdown)
          ? item.finishBreakdown.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0))
          : [],
        externalAllocations: normalizeExternalAllocations(item?.externalAllocations),
      }))
      .filter((item) => Number.isFinite(item.childAssemblyId) || item.childKey);
  } catch {
    return [];
  }
}

function normalizeExternalAllocations(raw: any): Record<string, { sent?: number[]; received?: number[] }> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, { sent?: number[]; received?: number[] }> = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    const sentRaw = (value as any).sent;
    const receivedRaw = (value as any).received;
    const sent = Array.isArray(sentRaw)
      ? sentRaw.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0))
      : undefined;
    const received = Array.isArray(receivedRaw)
      ? receivedRaw.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0))
      : undefined;
    out[key] = { sent, received };
  });
  return out;
}

function resolveSplitStage(splitStageRaw: string): {
  splitStage: "order" | "cut" | "sew" | "finish" | "external";
  splitExternalType: ExternalStepType | null;
  error?: string;
} {
  const splitStageLower = splitStageRaw.toLowerCase();
  if (splitStageLower === "finish") {
    return { splitStage: "finish", splitExternalType: null };
  }
  if (splitStageLower === "sew") {
    return { splitStage: "sew", splitExternalType: null };
  }
  if (splitStageLower === "order") {
    return { splitStage: "order", splitExternalType: null };
  }
  if (splitStageLower.startsWith("external:")) {
    const typeRaw = splitStageRaw.split(":")[1] || "";
    if (Object.values(ExternalStepType).includes(typeRaw as ExternalStepType)) {
      return { splitStage: "external", splitExternalType: typeRaw as ExternalStepType };
    }
    return { splitStage: "cut", splitExternalType: null, error: "Unknown external step type for split stage." };
  }
  return { splitStage: "cut", splitExternalType: null };
}

function sumArrays(a: number[], b: number[]) {
  const len = Math.max(a.length, b.length);
  const out = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    out[i] = (Number(a[i] ?? 0) || 0) + (Number(b[i] ?? 0) || 0);
  }
  return out;
}

function maxArrays(a: number[], b: number[]) {
  const len = Math.max(a.length, b.length);
  const out = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    out[i] = Math.max(Number(a[i] ?? 0) || 0, Number(b[i] ?? 0) || 0);
  }
  return out;
}

function subtractArrays(a: number[], b: number[]) {
  const len = Math.max(a.length, b.length);
  const out = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    out[i] = (Number(a[i] ?? 0) || 0) - (Number(b[i] ?? 0) || 0);
  }
  return out;
}

function totalArray(arr: number[]) {
  return arr.reduce((t, n) => t + (Number(n) || 0), 0);
}

function normalizeBreakdown(arr: Array<number | null> | null | undefined, fallbackQty: number) {
  if (Array.isArray(arr) && arr.length) {
    return arr.map((n) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0));
  }
  if (Number.isFinite(fallbackQty) && fallbackQty > 0) return [fallbackQty | 0];
  return [];
}

async function computeDownstreamUsedByAssembly(assemblyIds: number[]) {
  const assemblies = await prisma.assembly.findMany({
    where: { id: { in: assemblyIds } },
    select: { id: true, qtyOrderedBreakdown: true },
  });
  const assembliesForExternal = assemblies.map((a) => ({ id: a.id, costings: [], product: null }));
  const activities = await prisma.assemblyActivity.findMany({
    where: { assemblyId: { in: assemblyIds } },
    select: {
      assemblyId: true,
      stage: true,
      kind: true,
      action: true,
      quantity: true,
      qtyBreakdown: true,
      externalStepType: true,
    },
  });
  const boxLines = await prisma.boxLine.findMany({
    where: { assemblyId: { in: assemblyIds }, packingOnly: { not: true } },
    select: { assemblyId: true, qtyBreakdown: true, quantity: true },
  });

  const activitiesByAssembly = new Map<number, any[]>();
  for (const act of activities) {
    if (!act.assemblyId) continue;
    const list = activitiesByAssembly.get(act.assemblyId) ?? [];
    list.push(act);
    activitiesByAssembly.set(act.assemblyId, list);
  }

  const packedByAssembly = new Map<number, { breakdown: number[]; total: number }>();
  for (const line of boxLines) {
    if (!line.assemblyId) continue;
    const rawBreakdown = Array.isArray(line.qtyBreakdown) ? (line.qtyBreakdown as number[]) : [];
    const fallback = rawBreakdown.length === 0 && line.quantity != null ? [Number(line.quantity) || 0] : [];
    const breakdown = rawBreakdown.length ? rawBreakdown : fallback;
    if (!breakdown.length) continue;
    const current = packedByAssembly.get(line.assemblyId) || { breakdown: [], total: 0 };
    const next = sumArrays(current.breakdown, breakdown);
    packedByAssembly.set(line.assemblyId, {
      breakdown: next,
      total: next.reduce((sum, n) => sum + (Number(n) || 0), 0),
    });
  }

  const aggregations = new Map<number, ReturnType<typeof aggregateAssemblyStages>>();
  for (const assembly of assemblies) {
    const aggregation = aggregateAssemblyStages({
      assemblyId: assembly.id,
      orderedBreakdown: (assembly.qtyOrderedBreakdown as number[]) || [],
      fallbackBreakdowns: { cut: [], sew: [], finish: [] },
      fallbackTotals: { cut: 0, sew: 0, finish: 0 },
      packSnapshot: packedByAssembly.get(assembly.id) || { breakdown: [], total: 0 },
      activities: activitiesByAssembly.get(assembly.id) || [],
    });
    aggregations.set(assembly.id, aggregation);
  }

  const quantityByAssembly = new Map<number, { totals?: { cut?: number; sew?: number; finish?: number; pack?: number } }>();
  for (const [assemblyId, aggregation] of aggregations.entries()) {
    quantityByAssembly.set(assemblyId, {
      totals: {
        cut: aggregation.totals.cut,
        sew: aggregation.totals.sew,
        finish: aggregation.totals.finish,
        pack: aggregation.totals.pack,
      },
    });
  }

  const externalSteps = buildExternalStepsByAssembly({
    assemblies: assembliesForExternal as any,
    activitiesByAssembly,
    quantityByAssembly,
  });

  const downstreamByAssembly = new Map<
    number,
    { cut: number[]; sew: number[]; finish: number[]; external: number[] }
  >();
  for (const [assemblyId, aggregation] of aggregations.entries()) {
    const steps = externalSteps[assemblyId] || [];
    const externalGate = computeExternalGateFromSteps(
      steps.map((s: any) => ({ sent: s.sent || [], received: s.received || [] }))
    );
    const downstream = computeDownstreamUsed({
      externalGate,
      sewRecorded: aggregation.stageStats.sew.processedArr || [],
      finishRecorded: aggregation.stageStats.finish.processedArr || [],
      packRecorded: aggregation.stageStats.pack.processedArr || [],
      retainRecorded: aggregation.stageStats.retain.processedArr || [],
    });
    const finishDown = maxArrays(
      aggregation.stageStats.finish.processedArr || [],
      maxArrays(
        aggregation.stageStats.pack.processedArr || [],
        aggregation.stageStats.retain.processedArr || []
      )
    );
    downstreamByAssembly.set(assemblyId, {
      cut: downstream.cut || [],
      sew: downstream.sew || [],
      finish: aggregation.stageStats.pack.processedArr || [],
      external: finishDown,
    });
  }

  return downstreamByAssembly;
}

async function applySplitAllocationWrites(
  tx: Prisma.TransactionClient,
  opts: {
    jobId: number;
    splitGroupId: number;
    parentAssemblyId: number;
    splitStage: "order" | "cut" | "sew" | "finish" | "external";
    splitExternalType: ExternalStepType | null;
    allocations: Array<
      AllocationInput & {
        childAssemblyId: number;
      }
    >;
    existingAllocations: Array<{ id: number; childAssemblyId: number }>;
    parentRemainder: number[];
    sourceCutActivityId: number | null;
    sourceSewActivityId: number | null;
    sourceFinishActivityId: number | null;
    sourceExternalByType: Map<
      ExternalStepType,
      {
        sent: number[];
        received: number[];
        sentActivityId: number | null;
        receivedActivityId: number | null;
      }
    >;
  }
) {
  const {
    jobId,
    splitGroupId,
    parentAssemblyId,
    splitStage,
    splitExternalType,
    allocations,
    existingAllocations,
    parentRemainder,
    sourceCutActivityId,
    sourceSewActivityId,
    sourceFinishActivityId,
    sourceExternalByType,
  } = opts;

  await tx.assembly.update({
    where: { id: parentAssemblyId },
    data: { qtyOrderedBreakdown: parentRemainder as any },
  });

  for (const alloc of allocations) {
    const target = existingAllocations.find((a) => a.childAssemblyId === alloc.childAssemblyId);
    const allocatedBreakdown = (alloc.breakdown || []).map((n) =>
      Number.isFinite(Number(n)) ? Number(n) | 0 : 0
    );
    const finishBreakdown =
      splitStage === "finish"
        ? (alloc.finishBreakdown || []).map((n) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0))
        : [];
    const externalAllocations =
      splitStage === "external" && splitExternalType
        ? {
            [splitExternalType]: {
              sent: (alloc.externalAllocations[splitExternalType]?.sent || []).map((n) =>
                Number.isFinite(Number(n)) ? Number(n) | 0 : 0
              ),
              received: (alloc.externalAllocations[splitExternalType]?.received || []).map((n) =>
                Number.isFinite(Number(n)) ? Number(n) | 0 : 0
              ),
            },
          }
        : {};
    const total = totalArray(allocatedBreakdown);
    if (!target) {
      await tx.assemblySplitAllocation.create({
        data: {
          splitGroupId,
          childAssemblyId: alloc.childAssemblyId,
          allocatedBreakdown: allocatedBreakdown as any,
          finishBreakdown: finishBreakdown as any,
          externalAllocations: externalAllocations as any,
        },
      });
    } else {
      await tx.assemblySplitAllocation.update({
        where: { id: target.id },
        data: {
          allocatedBreakdown: allocatedBreakdown as any,
          finishBreakdown: finishBreakdown as any,
          externalAllocations: externalAllocations as any,
        },
      });
    }

    await tx.assembly.update({
      where: { id: alloc.childAssemblyId },
      data: { qtyOrderedBreakdown: allocatedBreakdown as any },
    });

    const allocation = target
      ? target
      : await tx.assemblySplitAllocation.findFirst({
          where: { splitGroupId, childAssemblyId: alloc.childAssemblyId },
        });
    if (!allocation) continue;

    const existing = await tx.assemblyActivity.findFirst({
      where: { splitAllocationId: allocation.id, stage: AssemblyStage.cut },
    });
    if (!total) {
      if (existing) {
        await tx.assemblyActivity.delete({ where: { id: existing.id } });
      }
    } else if (existing) {
      await tx.assemblyActivity.update({
        where: { id: existing.id },
        data: {
          qtyBreakdown: allocatedBreakdown as any,
          quantity: total,
          isProjected: true,
          sourceActivityId: sourceCutActivityId ?? undefined,
        },
      });
    } else {
      await tx.assemblyActivity.create({
        data: {
          assemblyId: alloc.childAssemblyId,
          jobId,
          name: "Inherited Cut",
          stage: AssemblyStage.cut,
          kind: ActivityKind.normal,
          action: ActivityAction.NOTE,
          activityDate: new Date(),
          qtyBreakdown: allocatedBreakdown as any,
          quantity: total,
          notes: "Derived from split allocation",
          splitAllocationId: allocation.id,
          isProjected: true,
          sourceActivityId: sourceCutActivityId ?? undefined,
        },
      });
    }

    const sewBreakdown =
      splitStage === "sew"
        ? (alloc.breakdown || []).map((n) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0))
        : [];
    const sewTotal = totalArray(sewBreakdown);
    const existingSew = await tx.assemblyActivity.findFirst({
      where: { splitAllocationId: allocation.id, stage: AssemblyStage.sew },
    });
    if (!sewTotal) {
      if (existingSew) {
        await tx.assemblyActivity.delete({ where: { id: existingSew.id } });
      }
    } else if (existingSew) {
      await tx.assemblyActivity.update({
        where: { id: existingSew.id },
        data: {
          qtyBreakdown: sewBreakdown as any,
          quantity: sewTotal,
          isProjected: true,
          sourceActivityId: sourceSewActivityId ?? undefined,
        },
      });
    } else {
      await tx.assemblyActivity.create({
        data: {
          assemblyId: alloc.childAssemblyId,
          jobId,
          name: "Inherited Sew",
          stage: AssemblyStage.sew,
          kind: ActivityKind.normal,
          action: ActivityAction.NOTE,
          activityDate: new Date(),
          qtyBreakdown: sewBreakdown as any,
          quantity: sewTotal,
          notes: "Derived from split allocation",
          splitAllocationId: allocation.id,
          isProjected: true,
          sourceActivityId: sourceSewActivityId ?? undefined,
        },
      });
    }

    const finishTotal = totalArray(finishBreakdown);
    const existingFinish = await tx.assemblyActivity.findFirst({
      where: { splitAllocationId: allocation.id, stage: AssemblyStage.finish },
    });
    if (!finishTotal) {
      if (existingFinish) {
        await tx.assemblyActivity.delete({ where: { id: existingFinish.id } });
      }
    } else if (existingFinish) {
      await tx.assemblyActivity.update({
        where: { id: existingFinish.id },
        data: {
          qtyBreakdown: finishBreakdown as any,
          quantity: finishTotal,
          isProjected: true,
          sourceActivityId: sourceFinishActivityId ?? undefined,
        },
      });
    } else {
      await tx.assemblyActivity.create({
        data: {
          assemblyId: alloc.childAssemblyId,
          jobId,
          name: "Inherited Finish",
          stage: AssemblyStage.finish,
          kind: ActivityKind.normal,
          action: ActivityAction.RECORDED,
          activityDate: new Date(),
          qtyBreakdown: finishBreakdown as any,
          quantity: finishTotal,
          notes: "Derived from split allocation",
          splitAllocationId: allocation.id,
          isProjected: true,
          sourceActivityId: sourceFinishActivityId ?? undefined,
        },
      });
    }

    const externalEntries = Object.entries(externalAllocations || {});
    const existingExternalActs = await tx.assemblyActivity.findMany({
      where: {
        splitAllocationId: allocation.id,
        externalStepType: { not: null },
      },
    });
    if (!externalEntries.length && existingExternalActs.length) {
      for (const act of existingExternalActs) {
        await tx.assemblyActivity.delete({ where: { id: act.id } });
      }
      continue;
    }
    const existingByKey = new Map<string, typeof existingExternalActs[number]>();
    for (const act of existingExternalActs) {
      const key = `${act.externalStepType}:${act.action}`;
      existingByKey.set(key, act);
    }
    for (const [typeRaw, payload] of externalEntries) {
      if (!Object.values(ExternalStepType).includes(typeRaw as ExternalStepType)) continue;
      const type = typeRaw as ExternalStepType;
      const sourceInfo = sourceExternalByType.get(type) || {
        sentActivityId: null,
        receivedActivityId: null,
      };
      const sent = payload.sent || [];
      const received = payload.received || [];
      const sentTotal = totalArray(sent);
      const receivedTotal = totalArray(received);
      const sentKey = `${type}:SENT_OUT`;
      const receivedKey = `${type}:RECEIVED_IN`;
      const existingSent = existingByKey.get(sentKey);
      const existingReceived = existingByKey.get(receivedKey);
      if (!sentTotal) {
        if (existingSent) {
          await tx.assemblyActivity.delete({ where: { id: existingSent.id } });
        }
      } else if (existingSent) {
        await tx.assemblyActivity.update({
          where: { id: existingSent.id },
          data: {
            qtyBreakdown: sent as any,
            quantity: sentTotal,
            isProjected: true,
            sourceActivityId: sourceInfo.sentActivityId ?? undefined,
          },
        });
      } else {
        await tx.assemblyActivity.create({
          data: {
            assemblyId: alloc.childAssemblyId,
            jobId,
            name: `Inherited ${type} (sent)`,
            stage: AssemblyStage.sew,
            kind: ActivityKind.normal,
            action: ActivityAction.SENT_OUT,
            externalStepType: type,
            activityDate: new Date(),
            qtyBreakdown: sent as any,
            quantity: sentTotal,
            notes: "Derived from split allocation",
            splitAllocationId: allocation.id,
            isProjected: true,
            sourceActivityId: sourceInfo.sentActivityId ?? undefined,
          },
        });
      }
      if (!receivedTotal) {
        if (existingReceived) {
          await tx.assemblyActivity.delete({ where: { id: existingReceived.id } });
        }
      } else if (existingReceived) {
        await tx.assemblyActivity.update({
          where: { id: existingReceived.id },
          data: {
            qtyBreakdown: received as any,
            quantity: receivedTotal,
            isProjected: true,
            sourceActivityId: sourceInfo.receivedActivityId ?? undefined,
          },
        });
      } else {
        await tx.assemblyActivity.create({
          data: {
            assemblyId: alloc.childAssemblyId,
            jobId,
            name: `Inherited ${type} (received)`,
            stage: AssemblyStage.sew,
            kind: ActivityKind.normal,
            action: ActivityAction.RECEIVED_IN,
            externalStepType: type,
            activityDate: new Date(),
            qtyBreakdown: received as any,
            quantity: receivedTotal,
            notes: "Derived from split allocation",
            splitAllocationId: allocation.id,
            isProjected: true,
            sourceActivityId: sourceInfo.receivedActivityId ?? undefined,
          },
        });
      }
    }
  }
}

export async function handleAssemblySplitUpdate(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const splitGroupId = Number(opts.form.get("splitGroupId"));
  const parentAssemblyId = Number(opts.form.get("parentAssemblyId") ?? opts.assemblyId);
  const splitStageRaw = String(opts.form.get("splitStage") || "cut");
  const resolved = resolveSplitStage(splitStageRaw);
  const splitStage = resolved.splitStage;
  const splitExternalType = resolved.splitExternalType;
  if (resolved.error) {
    return json({ error: resolved.error }, { status: 400 });
  }
  const allocationsRaw = String(opts.form.get("allocations") || "[]");
  if (!Number.isFinite(splitGroupId)) {
    return json({ error: "Missing split group id." }, { status: 400 });
  }
  const allocations = parseAllocations(allocationsRaw).filter((item) =>
    Number.isFinite(item.childAssemblyId)
  ) as AllocationInput[];
  if (!allocations.length) {
    return json({ error: "No split allocations provided." }, { status: 400 });
  }
  const splitGroup = await prisma.assemblySplitGroup.findUnique({
    where: { id: splitGroupId },
    include: { allocations: true },
  });
  if (!splitGroup || splitGroup.parentAssemblyId !== parentAssemblyId) {
    return json({ error: "Split group not found for parent assembly." }, { status: 404 });
  }
  const packedLines = await prisma.boxLine.count({
    where: { assemblyId: parentAssemblyId, packingOnly: { not: true } },
  });
  if (packedLines > 0) {
    return json(
      { error: "Split allocations are locked after packing/shipping. Undo packing/shipments first." },
      { status: 400 }
    );
  }

  const childIds = allocations.map((a) => a.childAssemblyId);
  const assemblyIds = [parentAssemblyId, ...childIds];
  const assemblies = await prisma.assembly.findMany({
    where: { id: { in: assemblyIds } },
    select: { id: true, qtyOrderedBreakdown: true },
  });
  const assemblyById = new Map(assemblies.map((a) => [a.id, a]));
  if (!assemblyById.has(parentAssemblyId)) {
    return json({ error: "Parent assembly not found." }, { status: 404 });
  }

  const activities = await prisma.assemblyActivity.findMany({
    where: { assemblyId: parentAssemblyId },
    select: {
      stage: true,
      kind: true,
      action: true,
      quantity: true,
      qtyBreakdown: true,
      splitAllocationId: true,
      externalStepType: true,
      isProjected: true,
      id: true,
    },
  });
  const sourceCutActs = activities.filter(
    (act) =>
      String(act.stage || "").toLowerCase() === "cut" &&
      act.kind !== ActivityKind.defect &&
      act.splitAllocationId == null &&
      !act.isProjected
  );
  let sourceCutBreakdown: number[] = [];
  let sourceCutActivityId: number | null = null;
  for (const act of sourceCutActs) {
    if (!sourceCutActivityId) sourceCutActivityId = act.id ?? null;
    const breakdown = normalizeBreakdown(
      Array.isArray(act.qtyBreakdown) ? (act.qtyBreakdown as number[]) : [],
      Number(act.quantity ?? 0) || 0
    );
    sourceCutBreakdown = sumArrays(sourceCutBreakdown, breakdown);
  }
  if (!sourceCutBreakdown.length) {
    const parent = assemblyById.get(parentAssemblyId);
    sourceCutBreakdown = Array.isArray(parent?.qtyOrderedBreakdown) ? (parent?.qtyOrderedBreakdown as number[]) : [];
  }
  const sourceOrderBreakdown = Array.isArray(assemblyById.get(parentAssemblyId)?.qtyOrderedBreakdown)
    ? (assemblyById.get(parentAssemblyId)?.qtyOrderedBreakdown as number[])
    : [];

  const sourceSewActs = activities.filter(
    (act) =>
      String(act.stage || "").toLowerCase() === "sew" &&
      act.kind !== ActivityKind.defect &&
      act.splitAllocationId == null &&
      !act.isProjected
  );
  let sourceSewBreakdown: number[] = [];
  let sourceSewActivityId: number | null = null;
  for (const act of sourceSewActs) {
    if (!sourceSewActivityId) sourceSewActivityId = act.id ?? null;
    const breakdown = normalizeBreakdown(
      Array.isArray(act.qtyBreakdown) ? (act.qtyBreakdown as number[]) : [],
      Number(act.quantity ?? 0) || 0
    );
    sourceSewBreakdown = sumArrays(sourceSewBreakdown, breakdown);
  }

  const sourceFinishActs = activities.filter(
    (act) =>
      String(act.stage || "").toLowerCase() === "finish" &&
      act.kind !== ActivityKind.defect &&
      act.splitAllocationId == null &&
      !act.isProjected
  );
  let sourceFinishBreakdown: number[] = [];
  let sourceFinishActivityId: number | null = null;
  for (const act of sourceFinishActs) {
    if (!sourceFinishActivityId) sourceFinishActivityId = act.id ?? null;
    const breakdown = normalizeBreakdown(
      Array.isArray(act.qtyBreakdown) ? (act.qtyBreakdown as number[]) : [],
      Number(act.quantity ?? 0) || 0
    );
    sourceFinishBreakdown = sumArrays(sourceFinishBreakdown, breakdown);
  }

  const sourceExternalByType = new Map<
    ExternalStepType,
    {
      sent: number[];
      received: number[];
      sentActivityId: number | null;
      receivedActivityId: number | null;
    }
  >();
  for (const act of activities) {
    if (!act.externalStepType) continue;
    if (act.kind === ActivityKind.defect) continue;
    if (act.splitAllocationId != null || act.isProjected) continue;
    const type = act.externalStepType;
    const current =
      sourceExternalByType.get(type) || {
        sent: [],
        received: [],
        sentActivityId: null,
        receivedActivityId: null,
      };
    const breakdown = normalizeBreakdown(
      Array.isArray(act.qtyBreakdown) ? (act.qtyBreakdown as number[]) : [],
      Number(act.quantity ?? 0) || 0
    );
    if (act.action === ActivityAction.SENT_OUT) {
      if (!current.sentActivityId) current.sentActivityId = act.id ?? null;
      current.sent = sumArrays(current.sent, breakdown);
    }
    if (act.action === ActivityAction.RECEIVED_IN) {
      if (!current.receivedActivityId) current.receivedActivityId = act.id ?? null;
      current.received = sumArrays(current.received, breakdown);
    }
    sourceExternalByType.set(type, current);
  }

  const allocationSum = allocations.reduce((sum, a) => sumArrays(sum, a.breakdown || []), []);
  const orderRemainder = subtractArrays(sourceOrderBreakdown, allocationSum);
  const cutRemainder = subtractArrays(sourceCutBreakdown, allocationSum);
  const sewRemainder = subtractArrays(sourceSewBreakdown, allocationSum);

  const finishAllocSum = allocations.reduce((sum, a) => sumArrays(sum, a.finishBreakdown || []), []);
  const finishRemainder = subtractArrays(sourceFinishBreakdown, finishAllocSum);

  const externalAllocSum = splitExternalType
    ? allocations.reduce((sum, a) => {
        const entry = a.externalAllocations[splitExternalType];
        const received = entry?.received || [];
        const sent = entry?.sent || [];
        const useReceived = received.some((n) => (Number(n) || 0) > 0);
        const arr = useReceived ? received : sent;
        return sumArrays(sum, arr);
      }, [] as number[])
    : [];
  const sourceExternal = splitExternalType
    ? sourceExternalByType.get(splitExternalType) || {
        sent: [],
        received: [],
        sentActivityId: null,
        receivedActivityId: null,
      }
    : null;
  const externalCap = sourceExternal
    ? (sourceExternal.received.some((n) => (Number(n) || 0) > 0)
        ? sourceExternal.received
        : sourceExternal.sent)
    : [];
  const externalRemainder = subtractArrays(externalCap, externalAllocSum);

  if (splitStage === "order" && orderRemainder.some((n) => n < 0)) {
    return json(
      { error: "Allocations exceed available ordered quantities. Reduce one or more child allocations." },
      { status: 400 }
    );
  }
  if (splitStage === "cut" && cutRemainder.some((n) => n < 0)) {
    return json(
      { error: "Allocations exceed available cut quantities. Reduce one or more child allocations." },
      { status: 400 }
    );
  }
  if (splitStage === "sew" && sewRemainder.some((n) => n < 0)) {
    return json(
      { error: "Allocations exceed recorded sew quantities. Reduce one or more child allocations." },
      { status: 400 }
    );
  }
  if (splitStage === "finish" && finishRemainder.some((n) => n < 0)) {
    return json(
      { error: "Finish allocations exceed recorded finish quantities. Reduce one or more finish allocations." },
      { status: 400 }
    );
  }
  if (splitStage === "external" && externalRemainder.some((n) => n < 0)) {
    return json(
      { error: "External allocations exceed recorded quantities at the selected step." },
      { status: 400 }
    );
  }

  const downstreamByAssembly = await computeDownstreamUsedByAssembly(assemblyIds);
  for (const alloc of allocations) {
    const downstream = downstreamByAssembly.get(alloc.childAssemblyId) || {
      cut: [],
      sew: [],
      finish: [],
      external: [],
    };
    const stageMin =
      splitStage === "finish"
        ? downstream.finish
        : splitStage === "sew"
          ? (downstream as any).sew || []
        : splitStage === "external"
          ? downstream.external
          : downstream.cut;
    const stageBreakdown =
      splitStage === "finish"
        ? alloc.finishBreakdown || []
        : splitStage === "sew"
          ? alloc.breakdown || []
        : splitStage === "external"
          ? (() => {
              const ext = alloc.externalAllocations[splitExternalType || ""] || {};
              const received = ext.received || [];
              const sent = ext.sent || [];
              return received.some((n) => (Number(n) || 0) > 0) ? received : sent;
            })()
          : alloc.breakdown || [];
    const len = Math.max(stageMin.length, stageBreakdown.length);
    for (let i = 0; i < len; i++) {
      const req = Number(stageMin[i] ?? 0) || 0;
      const val = Number(stageBreakdown[i] ?? 0) || 0;
      if (val < req) {
        return json(
          { error: `Child allocation is below downstream usage at size ${i + 1} (min ${req}).` },
          { status: 400 }
        );
      }
    }
    if (splitStage === "external" && splitExternalType) {
      const ext = alloc.externalAllocations[splitExternalType] || {};
      const sentArr = ext.sent || [];
      const recArr = ext.received || [];
      const sentLen = Math.max(sentArr.length, recArr.length);
      for (let i = 0; i < sentLen; i++) {
        const sent = Number(sentArr[i] ?? 0) || 0;
        const rec = Number(recArr[i] ?? 0) || 0;
        if (rec > sent) {
          return json(
            { error: `Child external received exceeds sent at size ${i + 1}.` },
            { status: 400 }
          );
        }
      }
    }
  }

  const parentMinReq = downstreamByAssembly.get(parentAssemblyId) || {
    cut: [],
    sew: [],
    finish: [],
    external: [],
  };
  const parentStageReq =
    splitStage === "finish"
      ? parentMinReq.finish
      : splitStage === "sew"
        ? (parentMinReq as any).sew || []
      : splitStage === "external"
        ? parentMinReq.external
        : parentMinReq.cut;
  const parentStageRemainder =
    splitStage === "finish"
      ? finishRemainder
      : splitStage === "sew"
        ? sewRemainder
      : splitStage === "external"
        ? externalRemainder
        : splitStage === "order"
          ? orderRemainder
          : cutRemainder;
  const len = Math.max(parentStageReq.length, parentStageRemainder.length);
  for (let i = 0; i < len; i++) {
    const req = Number(parentStageReq[i] ?? 0) || 0;
    const val = Number(parentStageRemainder[i] ?? 0) || 0;
    if (val < req) {
      return json(
        { error: `Parent remainder is below downstream usage at size ${i + 1} (min ${req}).` },
        { status: 400 }
      );
    }
  }

  const parentRemainder =
    splitStage === "finish"
      ? finishRemainder
      : splitStage === "sew"
        ? sewRemainder
      : splitStage === "external"
        ? externalRemainder
        : splitStage === "order"
          ? orderRemainder
          : cutRemainder;

  const stageAllocSum =
    splitStage === "finish"
      ? finishAllocSum
      : splitStage === "external"
        ? externalAllocSum
        : allocationSum;
  const totalAllocated = totalArray(stageAllocSum);
  const parentRemainderTotal = totalArray(parentRemainder);
  const childAssemblyIds = allocations.map((alloc) => alloc.childAssemblyId);

  await prisma.$transaction(async (tx) => {
    await applySplitAllocationWrites(tx, {
      jobId: opts.jobId,
      splitGroupId,
      parentAssemblyId,
      splitStage,
      splitExternalType,
      allocations: allocations as Array<AllocationInput & { childAssemblyId: number }>,
      existingAllocations: splitGroup.allocations,
      parentRemainder,
      sourceCutActivityId,
      sourceSewActivityId,
      sourceFinishActivityId,
      sourceExternalByType,
    });
    await upsertSplitActivity({
      tx,
      splitGroupId,
      assemblyId: parentAssemblyId,
      jobId: opts.jobId,
      activityDate: new Date(),
      splitStageKey: splitStageRaw,
      allocatedBreakdown: stageAllocSum,
      totalAllocated,
      parentRemainder: parentRemainderTotal,
      childAssemblyIds,
    });
  });

  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}

export async function handleAssemblySplitCommit(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const parentAssemblyId = Number(opts.form.get("parentAssemblyId") ?? opts.assemblyId);
  if (!Number.isFinite(parentAssemblyId)) {
    return json({ error: "Missing parent assembly id." }, { status: 400 });
  }
  const splitStageRaw = String(opts.form.get("splitStage") || "order");
  const resolved = resolveSplitStage(splitStageRaw);
  const splitStage = resolved.splitStage;
  const splitExternalType = resolved.splitExternalType;
  if (resolved.error) {
    return json({ error: resolved.error }, { status: 400 });
  }
  const allocationsRaw = String(opts.form.get("allocations") || "[]");
  const allocations = parseAllocations(allocationsRaw);
  if (!allocations.length) {
    return json({ error: "No split allocations provided." }, { status: 400 });
  }
  const childKeys = Array.from(
    new Set(
      allocations
        .map((alloc) => String(alloc.childKey || "").trim())
        .filter((key) => key.length > 0)
    )
  );
  if (!childKeys.length) {
    return json({ error: "Split needs at least one child assembly." }, { status: 400 });
  }

  const parent = await prisma.assembly.findFirst({
    where: { id: parentAssemblyId, jobId: opts.jobId },
    include: { costings: true },
  });
  if (!parent) {
    return json({ error: "Parent assembly not found." }, { status: 404 });
  }
  const existing = await prisma.assemblySplitGroup.findFirst({
    where: { parentAssemblyId },
    select: { id: true },
  });
  if (existing) {
    return json({ error: "Split already exists. Use edit instead." }, { status: 400 });
  }

  const packedLines = await prisma.boxLine.count({
    where: { assemblyId: parentAssemblyId, packingOnly: { not: true } },
  });
  if (packedLines > 0) {
    return json(
      { error: "Splits are locked after packing/shipping. Undo packing/shipments first." },
      { status: 400 }
    );
  }

  const parentAssemblyIds = [parentAssemblyId];
  const assemblies = await prisma.assembly.findMany({
    where: { id: { in: parentAssemblyIds } },
    select: { id: true, qtyOrderedBreakdown: true },
  });
  const assemblyById = new Map(assemblies.map((a) => [a.id, a]));

  const activities = await prisma.assemblyActivity.findMany({
    where: { assemblyId: parentAssemblyId },
    select: {
      stage: true,
      kind: true,
      action: true,
      quantity: true,
      qtyBreakdown: true,
      splitAllocationId: true,
      externalStepType: true,
      isProjected: true,
      id: true,
    },
  });

  const sourceCutActs = activities.filter(
    (act) =>
      String(act.stage || "").toLowerCase() === "cut" &&
      act.kind !== ActivityKind.defect &&
      act.splitAllocationId == null &&
      !act.isProjected
  );
  let sourceCutBreakdown: number[] = [];
  let sourceCutActivityId: number | null = null;
  for (const act of sourceCutActs) {
    if (!sourceCutActivityId) sourceCutActivityId = act.id ?? null;
    const breakdown = normalizeBreakdown(
      Array.isArray(act.qtyBreakdown) ? (act.qtyBreakdown as number[]) : [],
      Number(act.quantity ?? 0) || 0
    );
    sourceCutBreakdown = sumArrays(sourceCutBreakdown, breakdown);
  }
  if (!sourceCutBreakdown.length) {
    const parentAssembly = assemblyById.get(parentAssemblyId);
    sourceCutBreakdown = Array.isArray(parentAssembly?.qtyOrderedBreakdown)
      ? (parentAssembly?.qtyOrderedBreakdown as number[])
      : [];
  }
  const sourceOrderBreakdown = Array.isArray(assemblyById.get(parentAssemblyId)?.qtyOrderedBreakdown)
    ? (assemblyById.get(parentAssemblyId)?.qtyOrderedBreakdown as number[])
    : [];

  const sourceSewActs = activities.filter(
    (act) =>
      String(act.stage || "").toLowerCase() === "sew" &&
      act.kind !== ActivityKind.defect &&
      act.splitAllocationId == null &&
      !act.isProjected
  );
  let sourceSewBreakdown: number[] = [];
  let sourceSewActivityId: number | null = null;
  for (const act of sourceSewActs) {
    if (!sourceSewActivityId) sourceSewActivityId = act.id ?? null;
    const breakdown = normalizeBreakdown(
      Array.isArray(act.qtyBreakdown) ? (act.qtyBreakdown as number[]) : [],
      Number(act.quantity ?? 0) || 0
    );
    sourceSewBreakdown = sumArrays(sourceSewBreakdown, breakdown);
  }

  const sourceFinishActs = activities.filter(
    (act) =>
      String(act.stage || "").toLowerCase() === "finish" &&
      act.kind !== ActivityKind.defect &&
      act.splitAllocationId == null &&
      !act.isProjected
  );
  let sourceFinishBreakdown: number[] = [];
  let sourceFinishActivityId: number | null = null;
  for (const act of sourceFinishActs) {
    if (!sourceFinishActivityId) sourceFinishActivityId = act.id ?? null;
    const breakdown = normalizeBreakdown(
      Array.isArray(act.qtyBreakdown) ? (act.qtyBreakdown as number[]) : [],
      Number(act.quantity ?? 0) || 0
    );
    sourceFinishBreakdown = sumArrays(sourceFinishBreakdown, breakdown);
  }

  const sourceExternalByType = new Map<
    ExternalStepType,
    {
      sent: number[];
      received: number[];
      sentActivityId: number | null;
      receivedActivityId: number | null;
    }
  >();
  for (const act of activities) {
    if (!act.externalStepType) continue;
    if (act.kind === ActivityKind.defect) continue;
    if (act.splitAllocationId != null || act.isProjected) continue;
    const type = act.externalStepType;
    const current =
      sourceExternalByType.get(type) || {
        sent: [],
        received: [],
        sentActivityId: null,
        receivedActivityId: null,
      };
    const breakdown = normalizeBreakdown(
      Array.isArray(act.qtyBreakdown) ? (act.qtyBreakdown as number[]) : [],
      Number(act.quantity ?? 0) || 0
    );
    if (act.action === ActivityAction.SENT_OUT) {
      if (!current.sentActivityId) current.sentActivityId = act.id ?? null;
      current.sent = sumArrays(current.sent, breakdown);
    }
    if (act.action === ActivityAction.RECEIVED_IN) {
      if (!current.receivedActivityId) current.receivedActivityId = act.id ?? null;
      current.received = sumArrays(current.received, breakdown);
    }
    sourceExternalByType.set(type, current);
  }

  const allocationSum = allocations.reduce((sum, a) => sumArrays(sum, a.breakdown || []), []);
  const orderRemainder = subtractArrays(sourceOrderBreakdown, allocationSum);
  const cutRemainder = subtractArrays(sourceCutBreakdown, allocationSum);
  const sewRemainder = subtractArrays(sourceSewBreakdown, allocationSum);

  const finishAllocSum = allocations.reduce((sum, a) => sumArrays(sum, a.finishBreakdown || []), []);
  const finishRemainder = subtractArrays(sourceFinishBreakdown, finishAllocSum);

  const externalAllocSum = splitExternalType
    ? allocations.reduce((sum, a) => {
        const entry = a.externalAllocations[splitExternalType];
        const received = entry?.received || [];
        const sent = entry?.sent || [];
        const useReceived = received.some((n) => (Number(n) || 0) > 0);
        const arr = useReceived ? received : sent;
        return sumArrays(sum, arr);
      }, [] as number[])
    : [];
  const sourceExternal = splitExternalType
    ? sourceExternalByType.get(splitExternalType) || {
        sent: [],
        received: [],
        sentActivityId: null,
        receivedActivityId: null,
      }
    : null;
  const externalCap = sourceExternal
    ? (sourceExternal.received.some((n) => (Number(n) || 0) > 0)
        ? sourceExternal.received
        : sourceExternal.sent)
    : [];
  const externalRemainder = subtractArrays(externalCap, externalAllocSum);

  if (splitStage === "order" && orderRemainder.some((n) => n < 0)) {
    return json(
      { error: "Allocations exceed available ordered quantities. Reduce one or more child allocations." },
      { status: 400 }
    );
  }
  if (splitStage === "cut" && cutRemainder.some((n) => n < 0)) {
    return json(
      { error: "Allocations exceed available cut quantities. Reduce one or more child allocations." },
      { status: 400 }
    );
  }
  if (splitStage === "sew" && sewRemainder.some((n) => n < 0)) {
    return json(
      { error: "Allocations exceed recorded sew quantities. Reduce one or more child allocations." },
      { status: 400 }
    );
  }
  if (splitStage === "finish" && finishRemainder.some((n) => n < 0)) {
    return json(
      { error: "Finish allocations exceed recorded finish quantities. Reduce one or more finish allocations." },
      { status: 400 }
    );
  }
  if (splitStage === "external" && externalRemainder.some((n) => n < 0)) {
    return json(
      { error: "External allocations exceed recorded quantities at the selected step." },
      { status: 400 }
    );
  }

  for (const alloc of allocations) {
    if (splitStage === "external" && splitExternalType) {
      const ext = alloc.externalAllocations[splitExternalType] || {};
      const sentArr = ext.sent || [];
      const recArr = ext.received || [];
      const sentLen = Math.max(sentArr.length, recArr.length);
      for (let i = 0; i < sentLen; i++) {
        const sent = Number(sentArr[i] ?? 0) || 0;
        const rec = Number(recArr[i] ?? 0) || 0;
        if (rec > sent) {
          return json(
            { error: `Child external received exceeds sent at size ${i + 1}.` },
            { status: 400 }
          );
        }
      }
    }
  }

  const downstreamByAssembly = await computeDownstreamUsedByAssembly([parentAssemblyId]);
  const parentMinReq = downstreamByAssembly.get(parentAssemblyId) || {
    cut: [],
    sew: [],
    finish: [],
    external: [],
  };
  const parentStageReq =
    splitStage === "finish"
      ? parentMinReq.finish
      : splitStage === "sew"
        ? parentMinReq.sew
        : splitStage === "external"
          ? parentMinReq.external
          : parentMinReq.cut;
  const parentStageRemainder =
    splitStage === "finish"
      ? finishRemainder
      : splitStage === "sew"
        ? sewRemainder
        : splitStage === "external"
          ? externalRemainder
          : splitStage === "order"
            ? orderRemainder
            : cutRemainder;
  const len = Math.max(parentStageReq.length, parentStageRemainder.length);
  for (let i = 0; i < len; i++) {
    const req = Number(parentStageReq[i] ?? 0) || 0;
    const val = Number(parentStageRemainder[i] ?? 0) || 0;
    if (val < req) {
      return json(
        { error: `Parent remainder is below downstream usage at size ${i + 1} (min ${req}).` },
        { status: 400 }
      );
    }
  }

  const parentRemainder =
    splitStage === "finish"
      ? finishRemainder
      : splitStage === "sew"
        ? sewRemainder
        : splitStage === "external"
          ? externalRemainder
          : splitStage === "order"
            ? orderRemainder
            : cutRemainder;
  const stageAllocSum =
    splitStage === "finish"
      ? finishAllocSum
      : splitStage === "external"
        ? externalAllocSum
        : allocationSum;
  const totalAllocated = totalArray(stageAllocSum);
  const parentRemainderTotal = totalArray(parentRemainder);

  await prisma.$transaction(async (tx) => {
    const createdGroup = await tx.assemblySplitGroup.create({
      data: { parentAssemblyId },
    });
    const childIds: number[] = [];
    const childIdByKey = new Map<string, number>();
    for (let idx = 0; idx < childKeys.length; idx++) {
      const key = childKeys[idx];
      const labelSuffix = childKeys.length > 1 ? ` ${idx + 1}` : "";
      const created = await tx.assembly.create({
        data: {
          name: parent.name ? `${parent.name} Split${labelSuffix}` : `Assembly ${parent.id} Split${labelSuffix}`,
          status: "DRAFT",
          quantity: 0,
          qtyOrderedBreakdown: [],
          notes: parent.notes,
          statusWhiteboard: parent.statusWhiteboard,
          jobId: parent.jobId,
          productId: parent.productId,
          variantSetId: parent.variantSetId,
          assemblyType: parent.assemblyType ?? "Prod",
        },
      });
      childIds.push(created.id);
      childIdByKey.set(key, created.id);
      if (Array.isArray(parent.costings) && parent.costings.length) {
        await tx.costing.createMany({
          data: parent.costings.map((costing) => ({
            assemblyId: created.id,
            productId: costing.productId,
            quantityPerUnit: costing.quantityPerUnit,
            unitCost: costing.unitCost,
            notes: costing.notes,
            activityUsed: costing.activityUsed,
            costPricePerItem: costing.costPricePerItem,
            salePricePerItem: costing.salePricePerItem,
            salePriceGroupId: costing.salePriceGroupId,
            manualSalePrice: costing.manualSalePrice,
            manualMargin: costing.manualMargin,
            externalStepType: costing.externalStepType ?? null,
            flagAssembly: costing.flagAssembly,
            flagDefinedInProduct: costing.flagDefinedInProduct,
            flagIsBillableDefaultOrManual: costing.flagIsBillableDefaultOrManual,
            flagIsBillableManual: costing.flagIsBillableManual,
            flagIsInvoiceableManual: costing.flagIsInvoiceableManual,
            flagIsDisabled: costing.flagIsDisabled,
          })),
        });
      }
    }

    const resolvedAllocations = allocations
      .map((alloc) => {
        const key = String(alloc.childKey || "").trim();
        const childAssemblyId = childIdByKey.get(key);
        if (!childAssemblyId) return null;
        return {
          ...alloc,
          childAssemblyId,
        };
      })
      .filter(Boolean) as Array<AllocationInput & { childAssemblyId: number }>;

    await applySplitAllocationWrites(tx, {
      jobId: opts.jobId,
      splitGroupId: createdGroup.id,
      parentAssemblyId,
      splitStage,
      splitExternalType,
      allocations: resolvedAllocations,
      existingAllocations: [],
      parentRemainder,
      sourceCutActivityId,
      sourceSewActivityId,
      sourceFinishActivityId,
      sourceExternalByType,
    });
    await upsertSplitActivity({
      tx,
      splitGroupId: createdGroup.id,
      assemblyId: parentAssemblyId,
      jobId: opts.jobId,
      activityDate: new Date(),
      splitStageKey: splitStageRaw,
      allocatedBreakdown: stageAllocSum,
      totalAllocated,
      parentRemainder: parentRemainderTotal,
      childAssemblyIds: childIds,
    });
  });

  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}

export async function handleAssemblySplitUndo(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const splitGroupId = Number(opts.form.get("splitGroupId"));
  if (!Number.isFinite(splitGroupId)) {
    return json({ error: "Missing split group id." }, { status: 400 });
  }
  const group = await prisma.assemblySplitGroup.findUnique({
    where: { id: splitGroupId },
    include: { allocations: true },
  });
  if (!group) {
    return json({ error: "Split group not found." }, { status: 404 });
  }
  const childIds = group.allocations.map((a) => a.childAssemblyId);
  const downstreamByAssembly = await computeDownstreamUsedByAssembly(childIds);
  for (const alloc of group.allocations) {
    const used = downstreamByAssembly.get(alloc.childAssemblyId);
    const anyUsed =
      (used?.cut || []).some((n) => (Number(n) || 0) > 0) ||
      (used?.finish || []).some((n) => (Number(n) || 0) > 0) ||
      (used?.external || []).some((n) => (Number(n) || 0) > 0);
    if (anyUsed) {
      return json(
        { error: "Cannot undo split: one or more child assemblies already has downstream activity." },
        { status: 400 }
      );
    }
  }

  const parent = await prisma.assembly.findUnique({
    where: { id: group.parentAssemblyId },
    select: { qtyOrderedBreakdown: true },
  });
  const parentBase = Array.isArray(parent?.qtyOrderedBreakdown)
    ? (parent?.qtyOrderedBreakdown as number[])
    : [];
  const allocationSum = group.allocations.reduce((sum, a) => sumArrays(sum, (a.allocatedBreakdown as number[]) || []), []);
  const restored = sumArrays(parentBase, allocationSum);
  const totalAllocated = totalArray(allocationSum);
  const parentRemainderTotal = totalArray(restored);
  const childAssemblyIds = group.allocations.map((alloc) => alloc.childAssemblyId);

  await prisma.$transaction(async (tx) => {
    await tx.assembly.update({
      where: { id: group.parentAssemblyId },
      data: { qtyOrderedBreakdown: restored as any },
    });
    for (const alloc of group.allocations) {
      await tx.assembly.update({
        where: { id: alloc.childAssemblyId },
        data: { qtyOrderedBreakdown: [] as any },
      });
      await tx.assemblyActivity.deleteMany({
        where: { splitAllocationId: alloc.id },
      });
    }
    await tx.assemblySplitAllocation.deleteMany({ where: { splitGroupId } });
    await tx.assemblySplitGroup.delete({ where: { id: splitGroupId } });
    await deleteSplitActivity({ tx, splitGroupId });
  });

  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}
