import type { ActivityAction, AssemblyActivity } from "@prisma/client";
import {
  ExternalStepType,
  ActivityKind,
  type Costing,
} from "@prisma/client";
import { resolveLeadTimeDetail } from "~/utils/leadTime";
import type {
  DerivedExternalStep,
  ExternalLeadTimeSource,
  ExternalStepStatus,
} from "../types/externalSteps";

type AssemblyWithCostings = {
  id: number;
  costings: Array<
    Costing & {
      product?: {
        leadTimeDays?: number | null;
        supplier?: {
          id: number;
          name: string | null;
          defaultLeadTimeDays?: number | null;
        } | null;
        externalStepType?: ExternalStepType | null;
      } | null;
    }
  >;
  product?: {
    leadTimeDays?: number | null;
    supplier?: {
      id: number;
      name: string | null;
      defaultLeadTimeDays?: number | null;
    } | null;
  } | null;
};

type ActivityWithVendor = AssemblyActivity & {
  vendorCompany?: { id: number; name: string | null } | null;
};

type QuantitySummary = {
  totals?: { cut?: number; sew?: number; finish?: number; pack?: number };
};

const STEP_ORDER: ExternalStepType[] = [
  ExternalStepType.EMBROIDERY,
  ExternalStepType.WASH,
  ExternalStepType.DYE,
];

const STEP_LABELS: Record<ExternalStepType, string> = {
  [ExternalStepType.EMBROIDERY]: "Embroidery",
  [ExternalStepType.WASH]: "Wash",
  [ExternalStepType.DYE]: "Dye",
};

const STATUS_LABELS: Record<ExternalStepStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "Sent out",
  DONE: "Received",
  IMPLICIT_DONE: "Done (implicit)",
};

const STATUS_COLORS: Record<ExternalStepStatus, string> = {
  NOT_STARTED: "gray",
  IN_PROGRESS: "blue",
  DONE: "green",
  IMPLICIT_DONE: "teal",
};

export function buildExternalStepsByAssembly(options: {
  assemblies: AssemblyWithCostings[];
  activitiesByAssembly: Map<number, ActivityWithVendor[]>;
  quantityByAssembly: Map<number, QuantitySummary>;
}): Record<number, DerivedExternalStep[]> {
  const result: Record<number, DerivedExternalStep[]> = {};
  for (const assembly of options.assemblies) {
    const activities = options.activitiesByAssembly.get(assembly.id) || [];
    const quantitySummary =
      options.quantityByAssembly.get(assembly.id) || undefined;
    result[assembly.id] = deriveStepsForAssembly(
      assembly,
      activities,
      quantitySummary
    );
  }
  return result;
}

function deriveStepsForAssembly(
  assembly: AssemblyWithCostings,
  activities: ActivityWithVendor[],
  summary?: QuantitySummary
): DerivedExternalStep[] {
  const expectedTypes = new Set<ExternalStepType>();
  for (const costing of assembly.costings || []) {
    const type =
      costing?.externalStepType ??
      (costing as any)?.product?.externalStepType ??
      null;
    if (type) {
      expectedTypes.add(type);
    }
  }
  // TODO: after backfilling costings.externalStepType, drop product fallback.
  const recordedTypes = new Set<ExternalStepType>();
  for (const activity of activities || []) {
    if (activity?.externalStepType) {
      recordedTypes.add(activity.externalStepType);
    }
  }
  const unionTypes = new Set<ExternalStepType>([
    ...Array.from(expectedTypes),
    ...Array.from(recordedTypes),
  ]);
  const orderedTypes: ExternalStepType[] = [
    ...STEP_ORDER.filter((type) => unionTypes.has(type)),
    ...Array.from(unionTypes).filter((type) => !STEP_ORDER.includes(type)),
  ];
  if (!orderedTypes.length) return [];

  const totals = summary?.totals || {};
  const hasFinish =
    Number(totals.finish ?? 0) > 0 ||
    activities.some(
      (act) => act?.stage === "finish" && Number(act.quantity ?? 0) > 0
    );
  const hasSew =
    Number(totals.sew ?? 0) > 0 ||
    activities.some(
      (act) => act?.stage === "sew" && Number(act.quantity ?? 0) > 0
    );

  const stageDates = {
    cut: getLatestStageDate(activities, "cut"),
    sew: getLatestStageDate(activities, "sew"),
    finish: getLatestStageDate(activities, "finish"),
  };

  return orderedTypes
    .map((type) =>
      deriveStep({
        type,
        assembly,
        activities,
        hasFinish,
        hasSew,
        stageDates,
        expected: expectedTypes.has(type),
      })
    )
    .filter((step): step is DerivedExternalStep => Boolean(step));
}

function deriveStep(opts: {
  type: ExternalStepType;
  assembly: AssemblyWithCostings;
  activities: ActivityWithVendor[];
  hasFinish: boolean;
  hasSew: boolean;
  stageDates: {
    cut: Date | null;
    sew: Date | null;
    finish: Date | null;
  };
  expected: boolean;
}): DerivedExternalStep | null {
  const { type, assembly, activities, hasFinish, hasSew, stageDates, expected } =
    opts;
  const stepActivities = (activities || []).filter(
    (act) => act.externalStepType === type
  );
  if (!expected && stepActivities.length === 0) return null;
  const sentEvents = stepActivities.filter(
    (act) => act.action === "SENT_OUT"
  );
  const receivedEvents = stepActivities.filter(
    (act) => act.action === "RECEIVED_IN"
  );
  const latestSent = getLatestByDate(sentEvents, (act) =>
    toDate(act.activityDate)
  );
  const latestReceived = getLatestByDate(receivedEvents, (act) =>
    toDate(act.activityDate)
  );

  let status: ExternalStepStatus = "NOT_STARTED";
  if (receivedEvents.length) status = "DONE";
  else if (sentEvents.length) status = "IN_PROGRESS";
  else if (hasFinish && expected) status = "IMPLICIT_DONE";

  const qtyOut = latestSent ? toNumber(latestSent.quantity) : null;
  const qtyIn = latestReceived ? toNumber(latestReceived.quantity) : null;
  const defectQtyRaw = stepActivities
    .filter((act) => act.kind === ActivityKind.defect)
    .reduce((total, act) => total + Math.abs(toNumber(act.quantity) || 0), 0);
  const defectQty = defectQtyRaw > 0 ? defectQtyRaw : null;

  const vendor =
    latestReceived?.vendorCompany ||
    latestSent?.vendorCompany ||
    null;

  const costingForStep = findCostingForStep(assembly, type);
  const productForStep =
    costingForStep?.product ?? assembly.product ?? null;
  const companyForStep =
    costingForStep?.product?.supplier ??
    assembly.product?.supplier ??
    null;

  const leadTimeInfo = resolveLeadTimeDetail({
    costing: costingForStep ? { leadTimeDays: costingForStep.leadTimeDays } : undefined,
    product: productForStep
      ? { leadTimeDays: productForStep.leadTimeDays }
      : undefined,
    company: companyForStep
      ? { defaultLeadTimeDays: companyForStep.defaultLeadTimeDays }
      : undefined,
  });

  if (expected && leadTimeInfo.value == null) {
    console.warn("[externalSteps] Missing lead time", {
      assemblyId: assembly.id,
      stepType: type,
    });
  }

  const sentDate = latestSent ? toDate(latestSent.activityDate) : null;
  const etaDate =
    sentDate && leadTimeInfo.value
      ? addDays(sentDate, leadTimeInfo.value)
      : null;
  const isLate =
    Boolean(etaDate) &&
    status !== "DONE" &&
    status !== "IMPLICIT_DONE" &&
    etaDate!.getTime() < Date.now();
  const lowConfidence =
    !hasSew &&
    (status === "IN_PROGRESS" ||
      status === "DONE" ||
      status === "IMPLICIT_DONE");

  const hasExplicitEvents =
    sentEvents.length > 0 || receivedEvents.length > 0;
  const inferredStart =
    !hasExplicitEvents ? stageDates.sew ?? stageDates.cut ?? null : null;
  const inferredEnd = !hasExplicitEvents ? stageDates.finish ?? null : null;

  const activitiesForDrawer = stepActivities.map((act) => ({
    id: act.id,
    action: act.action,
    kind: act.kind,
    activityDate: toIso(toDate(act.activityDate)),
    quantity: toNumber(act.quantity),
    vendor: act.vendorCompany
      ? { id: act.vendorCompany.id, name: act.vendorCompany.name }
      : null,
  }));

  return {
    type,
    label: STEP_LABELS[type] || type,
    expected,
    status,
    sentDate: toIso(sentDate),
    receivedDate: toIso(latestReceived ? toDate(latestReceived.activityDate) : null),
    qtyOut,
    qtyIn,
    defectQty,
    vendor: vendor ? { id: vendor.id, name: vendor.name } : null,
    etaDate: toIso(etaDate),
    leadTimeDays: leadTimeInfo.value,
    leadTimeSource: leadTimeInfo.source
      ? leadTimeInfo.source.toUpperCase() === "COSTING"
        ? "COSTING"
        : leadTimeInfo.source.toUpperCase() === "PRODUCT"
        ? "PRODUCT"
        : "COMPANY"
      : null,
    isLate,
    lowConfidence,
    inferredStartDate: toIso(inferredStart),
    inferredEndDate: toIso(inferredEnd),
    activities: activitiesForDrawer,
  };
}

function findCostingForStep(
  assembly: AssemblyWithCostings,
  type: ExternalStepType
) {
  const candidates = (assembly.costings || []).filter(
    (c) => c.externalStepType === type
  );
  if (!candidates.length) return null;
  const withLeadTime = candidates.find(
    (c) => Number(c.leadTimeDays ?? 0) > 0
  );
  return withLeadTime ?? candidates[0];
}

function getLatestStageDate(
  activities: ActivityWithVendor[],
  stage: string
): Date | null {
  const matches = (activities || []).filter(
    (act) => String(act.stage || "").toLowerCase() === stage
  );
  const latest = getLatestByDate(matches, (act) => toDate(act.activityDate));
  return latest ? toDate(latest.activityDate) : null;
}

function getLatestByDate<T>(
  items: T[],
  getDate: (item: T) => Date | null
): T | null {
  let latest: T | null = null;
  let latestTime = -Infinity;
  for (const item of items || []) {
    const date = getDate(item);
    if (!date) continue;
    const time = date.getTime();
    if (time >= latestTime) {
      latest = item;
      latestTime = time;
    }
  }
  return latest;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toNumber(value: any): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export const externalStepStatusLabels = STATUS_LABELS;
export const externalStepStatusColors = STATUS_COLORS;
