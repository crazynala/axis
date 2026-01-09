import { computeEffectiveOrderedBreakdown } from "~/modules/job/quantityUtils";

export type QuantityValue = { value: string };

export type AssemblyGroupQtyValue = {
  assemblyId: number;
  qtyBreakdown: QuantityValue[];
};

export type AssemblyActivityFormValues = {
  activityDate: Date | null;
  qtyBreakdown: QuantityValue[];
  qtyGroup?: AssemblyGroupQtyValue[];
  consumption: Record<string, Record<string, string>>;
};

export type AssemblyGroupDefault = {
  assemblyId: number;
  defaultBreakdown: number[];
};

export type BuildAssemblyActivityDefaultsArgs = {
  mode: "create" | "edit";
  initialDate?: Date | string | null;
  initialBreakdown?: number[] | null;
  defaultBreakdown: number[];
  groupDefaults?: AssemblyGroupDefault[] | null;
  initialConsumption?: Record<number, Record<number, number>> | null;
};

export function computeDefaultActivityBreakdownFromArrays(args: {
  activityType: "cut" | "finish" | "pack";
  labelsLen: number;
  ordered?: number[];
  canceled?: number[];
  alreadyCut?: number[];
  leftToCut?: number[];
  finishInput?: number[];
  finishDone?: number[];
  packedDone?: number[];
}) {
  const {
    activityType,
    labelsLen,
    ordered = [],
    canceled = [],
    alreadyCut = [],
    leftToCut = [],
    finishInput = [],
    finishDone = [],
    packedDone = [],
  } = args;
  const effectiveOrdered = computeEffectiveOrderedBreakdown({
    orderedBySize: ordered,
    canceledBySize: canceled,
  }).effective;

  const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
  const get = (arr: number[], idx: number) => Number(arr[idx] ?? 0) || 0;

  if (activityType === "cut") {
    return Array.from({ length: labelsLen }, (_, i) => {
      const ext = leftToCut[i];
      if (Number.isFinite(ext)) {
        return clamp(Math.min(Number(ext), get(effectiveOrdered, i)));
      }
      return clamp(get(effectiveOrdered, i) - get(alreadyCut, i));
    });
  }

  if (activityType === "finish") {
    return Array.from({ length: labelsLen }, (_, i) => {
      const cap = finishInput.length
        ? get(finishInput, i)
        : alreadyCut.length
        ? get(alreadyCut, i)
        : get(effectiveOrdered, i);
      return clamp(cap - get(finishDone, i));
    });
  }

  return Array.from({ length: labelsLen }, (_, i) => {
    const cap = finishInput.length
      ? get(finishInput, i)
      : alreadyCut.length
      ? get(alreadyCut, i)
      : get(effectiveOrdered, i);
    return clamp(cap - get(packedDone, i));
  });
}

export function mapConsumptionToStrings(
  input?: Record<number, Record<number, number>> | null
): Record<string, Record<string, string>> {
  if (!input) return {};
  const result: Record<string, Record<string, string>> = {};
  for (const [cidKey, batches] of Object.entries(input)) {
    const nextBatches: Record<string, string> = {};
    for (const [bidKey, qty] of Object.entries(batches || {})) {
      nextBatches[bidKey] =
        qty === undefined || qty === null ? "" : String(qty ?? 0);
    }
    result[cidKey] = nextBatches;
  }
  return result;
}

export function buildAssemblyActivityDefaultValues(
  args: BuildAssemblyActivityDefaultsArgs
): AssemblyActivityFormValues {
  const {
    mode,
    initialDate,
    initialBreakdown,
    defaultBreakdown,
    groupDefaults,
    initialConsumption,
  } = args;
  const baseDate = initialDate ? new Date(initialDate as any) : new Date();
  const consumption =
    mode === "edit" && initialConsumption
      ? mapConsumptionToStrings(initialConsumption)
      : {};

  if (groupDefaults && groupDefaults.length > 0) {
    return {
      activityDate: baseDate,
      qtyBreakdown: [],
      qtyGroup: groupDefaults.map((g) => ({
        assemblyId: g.assemblyId,
        qtyBreakdown: g.defaultBreakdown.map((n) => ({
          value: String(n || 0),
        })),
      })),
      consumption,
    };
  }

  const sourceBreakdown = Array.isArray(initialBreakdown)
    ? initialBreakdown
    : defaultBreakdown;

  return {
    activityDate: baseDate,
    qtyBreakdown: sourceBreakdown.map((n) => ({ value: String(n || 0) })),
    consumption,
  };
}

export type SerializeAssemblyActivityOptions = {
  mode: "create" | "edit";
  activityType: "cut" | "make" | "pack";
  activityId?: number;
  extraFields?: Record<string, string | number>;
  overrideIntent?: string;
};

export function serializeAssemblyActivityValues(
  values: AssemblyActivityFormValues,
  options: SerializeAssemblyActivityOptions
): FormData {
  const { mode, activityType, activityId, extraFields, overrideIntent } =
    options;
  const fd = new FormData();

  if (mode === "edit") {
    fd.set("_intent", "activity.update");
    if (activityId != null) fd.set("activityId", String(activityId));
  } else {
    fd.set(
      "_intent",
      overrideIntent ? overrideIntent : `activity.create.${activityType}`
    );
  }

  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) {
      fd.set(k, String(v));
    }
  }

  const date = values.activityDate ? new Date(values.activityDate) : null;
  if (date) fd.set("activityDate", date.toISOString().slice(0, 10));

  const qtyBreakdown = (values.qtyBreakdown || []).map(
    (entry) => Number(entry?.value || 0) | 0
  );
  fd.set("qtyBreakdown", JSON.stringify(qtyBreakdown));

  if (values.qtyGroup && values.qtyGroup.length > 0) {
    const groupPayload = values.qtyGroup
      .map((group) => ({
        assemblyId: group.assemblyId,
        qtyBreakdown: (group.qtyBreakdown || []).map(
          (entry) => Number(entry?.value || 0) | 0
        ),
      }))
      .filter((entry) => Number.isFinite(entry.assemblyId));
    if (groupPayload.length > 0) {
      fd.set("groupQty", JSON.stringify(groupPayload));
    }
  }

  const consumptionValues = values.consumption || {};
  const consumptionsArr = Object.keys(consumptionValues)
    .map((k) => Number(k))
    .reduce<
      Array<{
        costingId: number;
        lines: Array<{ batchId: number; qty: number }>;
      }>
    >((acc, cid) => {
      if (!Number.isFinite(cid)) return acc;
      const lines = Object.entries(consumptionValues[cid] || {})
        .map(([batchId, q]) => ({
          batchId: Number(batchId),
          qty: Number(q) || 0,
        }))
        .filter((line) => line.qty > 0);
      if (lines.length > 0) acc.push({ costingId: cid, lines });
      return acc;
    }, []);
  fd.set("consumptions", JSON.stringify(consumptionsArr));

  return fd;
}

export function calculateUnitsInCut(
  qtyBreakdown: QuantityValue[] | undefined,
  qtyGroup: AssemblyGroupQtyValue[] | undefined
): number {
  if (qtyGroup && qtyGroup.length > 0) {
    return qtyGroup.reduce((total, group) => {
      const subtotal = (group?.qtyBreakdown || []).reduce((inner, entry) => {
        const value = Number(entry?.value ?? 0);
        return inner + (Number.isFinite(value) ? value : 0);
      }, 0);
      return total + subtotal;
    }, 0);
  }

  return (qtyBreakdown || []).reduce((total, entry) => {
    const value = Number(entry?.value ?? 0);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function calculateConsumptionTotals(
  consumption: AssemblyActivityFormValues["consumption"]
): Record<number, number> {
  const totals: Record<number, number> = {};
  if (!consumption) return totals;
  for (const [cidKey, batches] of Object.entries(consumption)) {
    const cid = Number(cidKey);
    if (!Number.isFinite(cid)) continue;
    const total = Object.values(batches || {}).reduce((sum, qty) => {
      const value = Number(qty) || 0;
      return sum + value;
    }, 0);
    totals[cid] = total;
  }
  return totals;
}
