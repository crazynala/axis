import { AssemblyStage } from "@prisma/client";
import { prisma } from "~/utils/prisma.server";
import type { LoaderAssembly } from "~/modules/production/services/production.dashboard.server";
import {
  coerceBreakdown,
  computeEffectiveOrderedBreakdown,
  sumNumberArray,
} from "~/modules/job/quantityUtils";
import {
  buildAttentionSignals,
  compareAttentionRows,
  computeDaysTo,
  hasDueSoonOrLate,
  isAttentionEligible,
  type ProductionAttentionFilters,
  type ProductionAttentionSignal,
  type ProductionAttentionSort,
  type ProductionAttentionDates,
} from "~/modules/production/services/production.attention.logic";
import {
  resolveAssemblyTargets,
  type FieldSource,
} from "~/modules/job/services/targetOverrides.server";

export type ProductionAttentionRow = {
  assemblyId: number;
  assemblyLabel: string;
  assemblyName: string | null;
  productName: string | null;
  jobId: number | null;
  jobCode: string | null;
  jobName: string | null;
  customerName: string | null;
  jobState: string | null;
  jobCreatedAt: string | null;
  jobHoldOn: boolean;
  jobHoldReason: string | null;
  jobHoldType: string | null;
  assemblyHoldOn: boolean;
  assemblyHoldReason: string | null;
  assemblyHoldType: string | null;
  effectiveHold: boolean;
  orderedTotal: number;
  canceledTotal: number;
  effectiveOrderedTotal: number;
  effectiveOrderedBySize: number[];
  cutTotal: number;
  finishTotal: number;
  packTotal: number;
  started: boolean;
  done: boolean;
  dropDeadDate: string | null;
  customerTargetDate: string | null;
  internalTargetDate: string | null;
  internalTargetJobValue: string | null;
  customerTargetJobValue: string | null;
  dropDeadJobValue: string | null;
  daysToDropDead: number | null;
  daysToCustomer: number | null;
  daysToInternal: number | null;
  internalTargetSource: FieldSource;
  customerTargetSource: FieldSource;
  dropDeadSource: FieldSource;
  anyOverride: boolean;
  attentionSignals: ProductionAttentionSignal[];
  poHold: boolean;
  poHoldReason: string | null;
  externalLate: boolean;
  hasDueSoonOrLate: boolean;
};

export async function buildProductionAttentionRows(options: {
  assemblies: LoaderAssembly[];
  filters: ProductionAttentionFilters;
  sort: ProductionAttentionSort;
  defaultLeadDays: number;
  bufferDays: number;
  escalationBufferDays: number;
  today?: Date;
}): Promise<ProductionAttentionRow[]> {
  const { assemblies, filters, sort } = options;
  const today = options.today ?? new Date();
  const assemblyIds = assemblies.map((assembly) => assembly.id);
  if (!assemblyIds.length) return [];

  const cancelActivities = await prisma.assemblyActivity.findMany({
    where: { assemblyId: { in: assemblyIds }, stage: AssemblyStage.cancel },
    select: { assemblyId: true, qtyBreakdown: true, quantity: true },
  });
  const canceledByAssembly = sumCanceledByAssembly(cancelActivities);

  const rows: ProductionAttentionRow[] = [];
  for (const assembly of assemblies) {
    const job = assembly.job;
    const jobState = job?.state ?? null;
    const rollup = assembly.rollup ?? null;
    const cutTotal = Number(rollup?.cutGoodQty ?? 0) || 0;
    const finishTotal = Number(rollup?.finishGoodQty ?? 0) || 0;
    const packTotal = Number(rollup?.packedQty ?? 0) || 0;

    const orderedBreakdown = coerceBreakdown(
      assembly.qtyOrderedBreakdown,
      assembly.quantity
    );
    const canceledBreakdown = canceledByAssembly.get(assembly.id) ?? [];
    const effective = computeEffectiveOrderedBreakdown({
      orderedBySize: orderedBreakdown,
      canceledBySize: canceledBreakdown,
    });
    const orderedTotal = sumNumberArray(effective.ordered);
    const canceledTotal = sumNumberArray(effective.canceled);
    const effectiveOrderedTotal = effective.total;

    if (!isAttentionEligible({ jobState, effectiveOrderedTotal, packTotal })) {
      continue;
    }

    const externalSteps = assembly.externalSteps ?? [];
    const hasExternalInProgress = externalSteps.some(
      (step) => step.status === "IN_PROGRESS"
    );
    const started = cutTotal > 0 || hasExternalInProgress;
    const done = packTotal >= effectiveOrderedTotal;

    const jobHoldOn = Boolean(job?.jobHoldOn);
    const assemblyHoldOn = Boolean(assembly.manualHoldOn);
    const effectiveHold = jobHoldOn || assemblyHoldOn;

    const resolved = resolveAssemblyTargets({
      job: {
        createdAt: job?.createdAt ?? null,
        customerOrderDate: job?.customerOrderDate ?? null,
        internalTargetDate: job?.internalTargetDate ?? null,
        customerTargetDate: job?.customerTargetDate ?? null,
        dropDeadDate: job?.dropDeadDate ?? null,
        shipToLocation: job?.shipToLocation ?? null,
      },
      assembly: {
        internalTargetDateOverride: assembly.internalTargetDateOverride,
        customerTargetDateOverride: assembly.customerTargetDateOverride,
        dropDeadDateOverride: assembly.dropDeadDateOverride,
        shipToLocationOverride: assembly.shipToLocationOverride ?? null,
      },
      defaultLeadDays: options.defaultLeadDays,
      bufferDays: options.bufferDays,
      escalationBufferDays: options.escalationBufferDays,
    });

    if (!filters.includeHeld && effectiveHold) continue;
    if (filters.onlyNotStarted && started) continue;

    const dates = resolveAttentionDatesFromTargets(resolved, today);
    const dueSoonOrLate = hasDueSoonOrLate(dates);
    if (filters.onlyDueSoon && !dueSoonOrLate) continue;

    const risk = assembly.risk ?? null;
    const poHold = Boolean(risk?.poHold);
    const externalLate = Boolean(risk?.hasExternalLate);
    if (filters.onlyBlocked && !(effectiveHold || poHold || externalLate)) {
      continue;
    }

    const attentionSignals = buildAttentionSignals({
      dates,
      started,
      jobHoldOn,
      jobHoldType: job?.jobHoldType ?? null,
      jobHoldReason: job?.jobHoldReason ?? null,
      assemblyHoldOn,
      assemblyHoldType: assembly.manualHoldType ?? null,
      assemblyHoldReason: assembly.manualHoldReason ?? null,
      poHold,
      poHoldReason: risk?.poHoldReason ?? null,
      externalLate,
      anyOverride: resolved.anyOverride,
      internalSource: resolved.internal.source,
    });

    rows.push({
      assemblyId: assembly.id,
      assemblyLabel: `A${assembly.id}`,
      assemblyName: assembly.name ?? null,
      productName: assembly.productName ?? null,
      jobId: job?.id ?? null,
      jobCode: job?.projectCode ?? null,
      jobName: job?.name ?? null,
      customerName: job?.customerName ?? null,
      jobState,
      jobCreatedAt: job?.createdAt ?? null,
      jobHoldOn,
      jobHoldReason: job?.jobHoldReason ?? null,
      jobHoldType: job?.jobHoldType ?? null,
      assemblyHoldOn,
      assemblyHoldReason: assembly.manualHoldReason ?? null,
      assemblyHoldType: assembly.manualHoldType ?? null,
      effectiveHold,
      orderedTotal,
      canceledTotal,
      effectiveOrderedTotal,
      effectiveOrderedBySize: effective.effective,
      cutTotal,
      finishTotal,
      packTotal,
      started,
      done,
      dropDeadDate: dates.dropDeadDate ? dates.dropDeadDate.toISOString() : null,
      customerTargetDate: dates.customerTargetDate
        ? dates.customerTargetDate.toISOString()
        : null,
      internalTargetDate: dates.internalTargetDate
        ? dates.internalTargetDate.toISOString()
        : null,
      internalTargetJobValue: resolved.internal.jobValue
        ? toDate(resolved.internal.jobValue)?.toISOString() ?? null
        : null,
      customerTargetJobValue: resolved.customer.jobValue
        ? toDate(resolved.customer.jobValue)?.toISOString() ?? null
        : null,
      dropDeadJobValue: resolved.dropDead.jobValue
        ? toDate(resolved.dropDead.jobValue)?.toISOString() ?? null
        : null,
      daysToDropDead: dates.daysToDropDead,
      daysToCustomer: dates.daysToCustomer,
      daysToInternal: dates.daysToInternal,
      attentionSignals,
      poHold,
      poHoldReason: risk?.poHoldReason ?? null,
      externalLate,
      hasDueSoonOrLate: dueSoonOrLate,
      internalTargetSource: resolved.internal.source,
      customerTargetSource: resolved.customer.source,
      dropDeadSource: resolved.dropDead.source,
      anyOverride: resolved.anyOverride,
    });
  }

  rows.sort((a, b) =>
    compareAttentionRows(
      {
        assemblyId: a.assemblyId,
        jobId: a.jobId,
        jobCode: a.jobCode,
        customerName: a.customerName,
        createdAt: a.jobCreatedAt ? new Date(a.jobCreatedAt) : null,
        started: a.started,
        effectiveHold: a.effectiveHold,
        poHold: a.poHold,
        externalLate: a.externalLate,
        daysToDropDead: a.daysToDropDead,
        daysToCustomer: a.daysToCustomer,
        daysToInternal: a.daysToInternal,
      },
      {
        assemblyId: b.assemblyId,
        jobId: b.jobId,
        jobCode: b.jobCode,
        customerName: b.customerName,
        createdAt: b.jobCreatedAt ? new Date(b.jobCreatedAt) : null,
        started: b.started,
        effectiveHold: b.effectiveHold,
        poHold: b.poHold,
        externalLate: b.externalLate,
        daysToDropDead: b.daysToDropDead,
        daysToCustomer: b.daysToCustomer,
        daysToInternal: b.daysToInternal,
      },
      sort
    )
  );

  return rows;
}

function resolveAttentionDatesFromTargets(
  resolved: ReturnType<typeof resolveAssemblyTargets>,
  today: Date
): ProductionAttentionDates {
  const dropDeadDate = toDate(resolved.dropDead.value);
  const customerTargetDate = toDate(resolved.customer.value);
  const internalTargetDate = toDate(resolved.internal.value);
  return {
    dropDeadDate,
    customerTargetDate,
    internalTargetDate,
    daysToDropDead: computeDaysTo(dropDeadDate, today),
    daysToCustomer: computeDaysTo(customerTargetDate, today),
    daysToInternal: computeDaysTo(internalTargetDate, today),
  };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function sumCanceledByAssembly(
  activities: Array<{
    assemblyId: number | null;
    qtyBreakdown: Array<number | null> | null;
    quantity: any;
  }>
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  activities.forEach((activity) => {
    const assemblyId = activity.assemblyId ?? null;
    if (!assemblyId) return;
    const breakdown = coerceBreakdown(
      activity.qtyBreakdown ?? [],
      Number(activity.quantity ?? 0)
    );
    if (!breakdown.length) return;
    const existing = out.get(assemblyId) || [];
    const len = Math.max(existing.length, breakdown.length);
    const next = Array.from({ length: len }, (_, idx) => {
      const base = existing[idx] ?? 0;
      const add = breakdown[idx] ?? 0;
      return Number(base) + Number(add);
    });
    out.set(assemblyId, next);
  });
  return out;
}
