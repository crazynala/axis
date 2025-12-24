import type { ActivityAction, ActivityKind } from "@prisma/client";
import { AssemblyStage } from "@prisma/client";
import { prisma } from "~/utils/prisma.server";
import { buildExternalStepsByAssembly } from "~/modules/job/services/externalSteps.server";
import type { DerivedExternalStep } from "~/modules/job/types/externalSteps";
import {
  loadAssemblyRollups,
  type AssemblyRollup,
} from "~/modules/production/services/rollups.server";
import { loadDefaultInternalTargetLeadDays } from "~/modules/job/services/targetOverrides.server";
import {
  loadMaterialCoverage,
  type AssemblyMaterialCoverage,
} from "~/modules/production/services/materialCoverage.server";
import {
  loadCoverageToleranceDefaults,
  type CoverageToleranceDefaults,
} from "~/modules/materials/services/coverageTolerance.server";
import {
  buildRiskSignals,
  type AssemblyRiskSignals,
  type PurchaseOrderLineSummary,
  type RiskAssemblyInput,
} from "~/modules/production/services/riskSignals.server";
import { getProductStockSnapshots } from "~/utils/prisma.server";
import { getVariantLabels } from "~/utils/getVariantLabels";

type LoaderPurchaseOrderLineSummary = Omit<
  PurchaseOrderLineSummary,
  "etaDate"
> & { etaDate: string | null };

export type LoaderAssembly = {
  id: number;
  name: string | null;
  qtyOrderedBreakdown: number[];
  quantity: number | null;
  manualHoldOn: boolean;
  manualHoldReason: string | null;
  manualHoldType: string | null;
  internalTargetDateOverride: string | null;
  customerTargetDateOverride: string | null;
  dropDeadDateOverride: string | null;
  shipToLocationOverride: { id: number; name: string | null } | null;
  productId: number | null;
  variantLabels: string[];
  materialCoverageTolerancePct: number | null;
  materialCoverageToleranceAbs: number | null;
  job: {
    id: number;
    state: string | null;
    createdAt: string | null;
    projectCode: string | null;
    name: string | null;
    targetDate: string | null;
    dropDeadDate: string | null;
    internalTargetDate: string | null;
    customerTargetDate: string | null;
    shipToLocation: { id: number; name: string | null } | null;
    customerName: string | null;
    jobHoldOn: boolean;
    jobHoldReason: string | null;
    jobHoldType: string | null;
  } | null;
  status?: string | null;
  productName: string | null;
  rollup: AssemblyRollup | null;
  risk: AssemblyRiskSignals;
  externalSteps: DerivedExternalStep[];
  materialCoverage: AssemblyMaterialCoverage | null;
  poLines: LoaderPurchaseOrderLineSummary[];
};

export type LoaderData = {
  asOf: string;
  assemblies: LoaderAssembly[];
  toleranceDefaults: CoverageToleranceDefaults;
  defaultLeadDays: number;
};

export const activeAssemblyFilter = {
  OR: [
    { status: null },
    { status: "" },
    { status: { notIn: ["CANCELED", "COMPLETE"] } },
  ],
  job: { state: { not: "CANCELED" } },
};

const assemblyIncludes = {
  job: {
    select: {
      id: true,
      state: true,
      createdAt: true,
      projectCode: true,
      name: true,
      targetDate: true,
      dropDeadDate: true,
      internalTargetDate: true,
      customerTargetDate: true,
      stockLocationId: true,
      jobHoldOn: true,
      jobHoldReason: true,
      jobHoldType: true,
      shipToLocation: { select: { id: true, name: true } },
      company: { select: { name: true } },
    },
  },
  product: {
    select: {
      id: true,
      name: true,
      leadTimeDays: true,
      stockTrackingEnabled: true,
      type: true,
      supplier: {
        select: {
          id: true,
          name: true,
          defaultLeadTimeDays: true,
        },
      },
      variantSet: { select: { variants: true } },
    },
  },
  variantSet: { select: { variants: true } },
  shipToLocationOverride: { select: { id: true, name: true } },
  costings: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          type: true,
          stockTrackingEnabled: true,
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
  },
} as const;

export async function loadDashboardData(take: number): Promise<LoaderData> {
  const toleranceDefaults = await loadCoverageToleranceDefaults();
  const defaultLeadDays = await loadDefaultInternalTargetLeadDays(prisma);
  const assemblies = await prisma.assembly.findMany({
    where: activeAssemblyFilter,
    include: assemblyIncludes,
    orderBy: [{ job: { targetDate: "asc" } }, { id: "asc" }],
    take,
  });
  const hydrated = await hydrateAssemblies(assemblies, toleranceDefaults);
  console.log("[production.dashboard.server] load", {
    take,
    assemblies: assemblies.length,
    hydrated: Array.isArray(hydrated) ? hydrated.length : "non-array",
  });
  return {
    asOf: new Date().toISOString(),
    assemblies: hydrated,
    toleranceDefaults,
    defaultLeadDays,
  };
}

export async function fetchDashboardRows(
  targetIds: number[]
): Promise<LoaderAssembly[]> {
  if (!targetIds.length) return [];
  const toleranceDefaults = await loadCoverageToleranceDefaults();
  const assemblies = await prisma.assembly.findMany({
    where: { id: { in: targetIds }, ...activeAssemblyFilter },
    include: assemblyIncludes,
    orderBy: [{ job: { targetDate: "asc" } }, { id: "asc" }],
  });
  return await hydrateAssemblies(assemblies, toleranceDefaults);
}

async function hydrateAssemblies(
  assemblies: any[],
  toleranceDefaults: CoverageToleranceDefaults
): Promise<LoaderAssembly[]> {
  if (!assemblies.length) return [];

  const productIds = new Set<number>();
  assemblies.forEach((assembly) => {
    const topPid = assembly.product?.id;
    if (topPid) productIds.add(topPid);
    (assembly.costings || []).forEach((c: any) => {
      const pid = c.productId ?? c.product?.id;
      if (pid) productIds.add(pid);
    });
  });
  const stockSnapshots = productIds.size
    ? await getProductStockSnapshots(Array.from(productIds))
    : [];
  const stockByProduct = new Map<number, any>();
  (Array.isArray(stockSnapshots) ? stockSnapshots : []).forEach((snap: any) => {
    if (snap?.productId) stockByProduct.set(snap.productId, snap);
  });

  const assemblyIds = assemblies.map((a) => a.id);
  const jobIds = Array.from(
    new Set(assemblies.map((a) => a.job?.id).filter(Boolean) as number[])
  );
  const productAssemblyMap = new Map<number, number[]>();
  assemblies.forEach((assembly) => {
    const pid = assembly.product?.id;
    if (pid) {
      const list = productAssemblyMap.get(pid) || [];
      list.push(assembly.id);
      productAssemblyMap.set(pid, list);
    }
    (assembly.costings || []).forEach((c: any) => {
      const cp = c.productId ?? c.product?.id;
      if (!cp) return;
      const list = productAssemblyMap.get(cp) || [];
      list.push(assembly.id);
      productAssemblyMap.set(cp, list);
    });
  });
  const jobAssemblyMap = new Map<number, number[]>();
  assemblies.forEach((assembly) => {
    const jobId = assembly.job?.id;
    if (!jobId) return;
    const arr = jobAssemblyMap.get(jobId) || [];
    arr.push(assembly.id);
    jobAssemblyMap.set(jobId, arr);
  });

  const rollups = await loadAssemblyRollups(assemblyIds);

  const activities = assemblyIds.length
    ? await prisma.assemblyActivity.findMany({
        where: {
          assemblyId: { in: assemblyIds },
          OR: [
            {
              stage: {
                in: [AssemblyStage.cut, AssemblyStage.sew, AssemblyStage.finish],
              },
            },
            { externalStepType: { not: null } },
          ],
        },
        select: {
          id: true,
          assemblyId: true,
          stage: true,
          kind: true,
          action: true,
          activityDate: true,
          quantity: true,
          externalStepType: true,
          vendorCompany: { select: { id: true, name: true } },
        },
        orderBy: [{ activityDate: "desc" }, { id: "desc" }],
      })
    : [];
  const activitiesByAssembly = new Map<number, any[]>();
  activities.forEach((activity) => {
    const normalized = normalizeActivity(activity);
    const aid = normalized.assemblyId;
    if (!aid) return;
    const arr = activitiesByAssembly.get(aid) || [];
    arr.push(normalized);
    activitiesByAssembly.set(aid, arr);
  });

  const quantityByAssembly = new Map<
    number,
    { totals?: { cut?: number; sew?: number; finish?: number; pack?: number } }
  >();
  rollups.forEach((rollup, id) => {
    quantityByAssembly.set(id, {
      totals: {
        cut: rollup.cutGoodQty,
        sew: rollup.sewGoodQty,
        finish: rollup.finishGoodQty,
        pack: rollup.packedQty,
      },
    });
  });

  const externalStepsByAssembly = buildExternalStepsByAssembly({
    assemblies: assemblies as any,
    activitiesByAssembly,
    quantityByAssembly,
  });

  const materialCoverage = await loadMaterialCoverage({
    assemblies: assemblies as any,
    rollups,
    stockByProduct,
    toleranceDefaults,
  });
  const reservedByPoLine = new Map<number, number>();
  materialCoverage.forEach((coverage) => {
    coverage.materials.forEach((material) => {
      material.reservations
        .filter(
          (res) =>
            res.type === "PO" &&
            res.purchaseOrderLineId != null &&
            !res.settledAt
        )
        .forEach((res) => {
          const lineId = res.purchaseOrderLineId as number;
          reservedByPoLine.set(
            lineId,
            (reservedByPoLine.get(lineId) || 0) + Number(res.qtyReserved || 0)
          );
        });
    });
  });

  const poLinesByAssembly = new Map<number, PurchaseOrderLineSummary[]>();
  if (assemblyIds.length) {
    const whereClause =
      jobIds.length > 0 || productAssemblyMap.size > 0
        ? {
            OR: [
              { assemblyId: { in: assemblyIds } },
              { jobId: { in: jobIds } },
              {
                productId: {
                  in: Array.from(productAssemblyMap.keys()),
                },
              },
            ],
          }
        : { assemblyId: { in: assemblyIds } };
    const poLines = await prisma.purchaseOrderLine.findMany({
      where: whereClause,
      select: {
        id: true,
        assemblyId: true,
        jobId: true,
        purchaseOrderId: true,
        productId: true,
        etaDate: true,
        qtyReceived: true,
        quantityOrdered: true,
        quantity: true,
      },
    });
    const assemblyIdSet = new Set(assemblyIds);
    poLines.forEach((line) => {
      const explicitAssemblyId = line.assemblyId ?? null;
      const targets: number[] = [];
      const seen = new Set<number>();
      if (explicitAssemblyId && assemblyIdSet.has(explicitAssemblyId)) {
        targets.push(explicitAssemblyId);
        seen.add(explicitAssemblyId);
      }
      if (line.jobId) {
        const fromJob = jobAssemblyMap.get(line.jobId) || [];
        fromJob.forEach((id) => {
          if (!seen.has(id)) {
            targets.push(id);
            seen.add(id);
          }
        });
      }
      if (line.productId && productAssemblyMap.has(line.productId)) {
        const fromProduct = productAssemblyMap.get(line.productId) || [];
        fromProduct.forEach((id) => {
          if (!seen.has(id)) {
            targets.push(id);
            seen.add(id);
          }
        });
      }
      if (!targets.length) return;
      const qtyOrdered = toNumber(line.quantityOrdered);
      const qtyExpected = resolveExpectedQty(line);
      const qtyReceived = toNumber(line.qtyReceived);
      const reservedQty = reservedByPoLine.get(line.id) ?? 0;
      const availableQty = Math.max(
        qtyExpected - qtyReceived - reservedQty,
        0
      );
      targets.forEach((assemblyId) => {
        const arr = poLinesByAssembly.get(assemblyId) || [];
        arr.push({
          id: line.id,
          productId: line.productId ?? null,
          purchaseOrderId: line.purchaseOrderId ?? null,
          etaDate: line.etaDate ? new Date(line.etaDate) : null,
          qtyOrdered,
          qtyExpected,
          qtyReceived,
          reservedQty,
          availableQty,
        });
        poLinesByAssembly.set(assemblyId, arr);
      });
    });
  }

  const riskAssemblies: RiskAssemblyInput[] = assemblies.map((assembly) => ({
    id: assembly.id,
    jobId: assembly.job?.id ?? null,
    jobTargetDate:
      assembly.job?.targetDate ?? assembly.job?.dropDeadDate ?? null,
  }));
  const riskSignals = buildRiskSignals({
    assemblies: riskAssemblies,
    rollups,
    externalStepsByAssembly,
    purchaseOrdersByAssembly: poLinesByAssembly,
    materialCoverage,
  });

  return assemblies.map((assembly) => ({
    id: assembly.id,
    name: assembly.name,
    qtyOrderedBreakdown: Array.isArray(assembly.qtyOrderedBreakdown)
      ? assembly.qtyOrderedBreakdown.map((n: any) => Number(n) || 0)
      : [],
    quantity:
      assembly.quantity != null ? Number(assembly.quantity) || 0 : null,
    manualHoldOn: Boolean(assembly.manualHoldOn),
    manualHoldReason: assembly.manualHoldReason ?? null,
    manualHoldType: assembly.manualHoldType ?? null,
    internalTargetDateOverride: assembly.internalTargetDateOverride
      ? new Date(assembly.internalTargetDateOverride).toISOString()
      : null,
    customerTargetDateOverride: assembly.customerTargetDateOverride
      ? new Date(assembly.customerTargetDateOverride).toISOString()
      : null,
    dropDeadDateOverride: assembly.dropDeadDateOverride
      ? new Date(assembly.dropDeadDateOverride).toISOString()
      : null,
    shipToLocationOverride: assembly.shipToLocationOverride ?? null,
    productId: assembly.product?.id ?? null,
    variantLabels: getVariantLabels(
      assembly.variantSet?.variants ??
        assembly.product?.variantSet?.variants ??
        [],
      assembly.c_numVariants ?? null
    ),
    materialCoverageTolerancePct:
      assembly.materialCoverageTolerancePct != null
        ? Number(assembly.materialCoverageTolerancePct)
        : null,
    materialCoverageToleranceAbs:
      assembly.materialCoverageToleranceAbs != null
        ? Number(assembly.materialCoverageToleranceAbs)
        : null,
    job: assembly.job
      ? {
          id: assembly.job.id,
          state: assembly.job.state ?? null,
          createdAt: assembly.job.createdAt
            ? assembly.job.createdAt.toISOString()
            : null,
          projectCode: assembly.job.projectCode,
          name: assembly.job.name,
          targetDate: assembly.job.targetDate
            ? assembly.job.targetDate.toISOString()
            : null,
          dropDeadDate: assembly.job.dropDeadDate
            ? assembly.job.dropDeadDate.toISOString()
            : null,
          internalTargetDate: assembly.job.internalTargetDate
            ? assembly.job.internalTargetDate.toISOString()
            : null,
          customerTargetDate: assembly.job.customerTargetDate
            ? assembly.job.customerTargetDate.toISOString()
            : null,
          shipToLocation: assembly.job.shipToLocation ?? null,
          customerName: assembly.job.company?.name ?? null,
          jobHoldOn: Boolean(assembly.job.jobHoldOn),
          jobHoldReason: assembly.job.jobHoldReason ?? null,
          jobHoldType: assembly.job.jobHoldType ?? null,
        }
      : null,
    productName: assembly.product?.name ?? null,
    rollup: rollups.get(assembly.id) ?? null,
    risk:
      riskSignals.get(assembly.id) ??
      {
        assemblyId: assembly.id,
        externalEta: null,
        externalEtaSource: null,
        externalEtaStepLabel: null,
        hasExternalLate: false,
        externalDueSoon: false,
        poHold: false,
        poHoldReason: null,
        poBlockingEta: null,
        poBlockingLineId: null,
        nextActions: [],
        vendorSteps: [],
      },
    externalSteps: externalStepsByAssembly[assembly.id] ?? [],
    status: assembly.status ?? null,
    materialCoverage: materialCoverage.get(assembly.id) ?? null,
    poLines: (poLinesByAssembly.get(assembly.id) ?? []).map((line) => ({
      ...line,
      etaDate: line.etaDate ? line.etaDate.toISOString() : null,
    })),
  }));
}

function normalizeActivity(activity: any) {
  const stage = normalizeStage(activity.stage);
  const kind =
    (activity.kind as ActivityKind | null) ?? ("normal" as ActivityKind);
  const action =
    (activity.action as ActivityAction | null) ??
    (["cut", "sew", "finish"].includes(stage) ? "RECORDED" : null);
  return {
    ...activity,
    stage,
    kind,
    action,
  };
}

function normalizeStage(value?: string | null) {
  if (!value) return "other";
  const lower = value.toString().toLowerCase();
  if (lower === "make") return "finish";
  if (lower === "trim") return "sew";
  if (lower === "embroidery") return "finish";
  return lower;
}

function toNumber(value: any) {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function resolveExpectedQty(line: {
  quantity?: number | string | null;
  quantityOrdered?: number | string | null;
} | null | undefined) {
  if (!line) return 0;
  const qty = toNumber(line.quantity);
  const ordered = toNumber(line.quantityOrdered);
  if (qty > 0) return qty;
  if (ordered > 0) return ordered;
  return qty || ordered || 0;
}
