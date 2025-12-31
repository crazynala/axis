import type { DebugExplainPayload } from "~/modules/debug/types";
import { prisma, getProductStockSnapshots } from "~/utils/prisma.server";
import { getDebugVersion, capArray } from "~/modules/debug/debugUtils.server";
import {
  loadCoverageToleranceDefaults,
} from "~/modules/materials/services/coverageTolerance.server";
import { loadMaterialCoverage } from "~/modules/production/services/materialCoverage.server";
import { loadAssemblyRollups } from "~/modules/production/services/rollups.server";
import { buildExternalStepsByAssembly } from "~/modules/job/services/externalSteps.server";
import { AssemblyStage } from "@prisma/client";
import { resolveAssemblyOrderQty } from "~/modules/materials/services/materialDemand.server";

export async function buildAssemblyDebug(
  assemblyId: number
): Promise<DebugExplainPayload | null> {
  const assembly = await prisma.assembly.findUnique({
    where: { id: assemblyId },
    include: {
      job: {
        select: {
          id: true,
          status: true,
          state: true,
          targetDate: true,
          internalTargetDate: true,
          customerTargetDate: true,
          dropDeadDate: true,
          shipToAddressId: true,
          stockLocationId: true,
        },
      },
      product: { select: { id: true, name: true } },
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
                select: { id: true, name: true, defaultLeadTimeDays: true },
              },
            },
          },
        },
      },
    },
  });
  if (!assembly) return null;

  const rollups = await loadAssemblyRollups([assemblyId]);
  const rollup = rollups.get(assemblyId) ?? null;

  const productIds = new Set<number>();
  (assembly.costings || []).forEach((costing) => {
    const pid = costing.productId ?? costing.product?.id;
    if (pid) productIds.add(pid);
  });
  const stockSnapshots = productIds.size
    ? await getProductStockSnapshots(Array.from(productIds))
    : [];
  const stockByProduct = new Map<number, any>();
  (Array.isArray(stockSnapshots) ? stockSnapshots : []).forEach((snap: any) => {
    if (snap?.productId) stockByProduct.set(snap.productId, snap);
  });

  const toleranceDefaults = await loadCoverageToleranceDefaults();
  const materialCoverage = await loadMaterialCoverage({
    assemblies: [assembly as any],
    rollups,
    stockByProduct,
    toleranceDefaults,
  });
  const coverage = materialCoverage.get(assemblyId) ?? null;

  const activities = await prisma.assemblyActivity.findMany({
    where: {
      assemblyId,
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
      stage: true,
      kind: true,
      action: true,
      activityDate: true,
      quantity: true,
      externalStepType: true,
      vendorCompany: { select: { id: true, name: true } },
    },
    orderBy: [{ activityDate: "desc" }, { id: "desc" }],
  });
  const activitiesByAssembly = new Map<number, any[]>();
  activitiesByAssembly.set(assemblyId, activities);
  const quantityByAssembly = new Map<number, { totals?: any }>();
  quantityByAssembly.set(assemblyId, {
    totals: {
      cut: rollup?.cutGoodQty ?? 0,
      sew: rollup?.sewGoodQty ?? 0,
      finish: rollup?.finishGoodQty ?? 0,
      pack: rollup?.packedQty ?? 0,
    },
  });
  const externalSteps = buildExternalStepsByAssembly({
    assemblies: [assembly as any],
    activitiesByAssembly,
    quantityByAssembly,
  })[assemblyId] ?? [];

  const activityTotals = summarizeActivities(activities);
  const boxLines = await prisma.boxLine.findMany({
    where: { assemblyId },
    select: { id: true, quantity: true, packingOnly: true, boxId: true },
  });
  const boxSummary = summarizeBoxLines(boxLines);

  const materialSummaries = (coverage?.materials || []).map((material) => ({
    productId: material.productId,
    productName: material.productName,
    productType: material.productType,
    qtyRequired: material.qtyRequired,
    qtyUncovered: material.qtyUncovered,
    qtyUncoveredAfterTolerance: material.qtyUncoveredAfterTolerance,
    tolerance: material.tolerance,
    status: material.status,
    calc: material.calc,
    reservations: material.reservations.map((res) => ({
      id: res.id,
      type: res.type,
      purchaseOrderId: res.purchaseOrderId,
      purchaseOrderLineId: res.purchaseOrderLineId,
      inventoryBatchId: res.inventoryBatchId,
      qtyReserved: res.qtyReserved,
      qtyExpected: res.qtyExpected,
      reservedTotal: res.reservedTotal,
      unreceivedExpected: res.unreceivedExpected,
      overReserved: res.overReserved,
      status: res.status,
      dueSoon: res.dueSoon,
      reason: res.reason,
      etaDate: res.etaDate,
      settledAt: res.settledAt,
    })),
  }));
  const { items: cappedMaterials, truncated } = capArray(materialSummaries);

  const neededDate = assembly.job?.targetDate ?? assembly.job?.dropDeadDate ?? null;
  const orderQtyResolution = resolveAssemblyOrderQty(assembly as any);

  const jobId = assembly.job?.id ?? null;
  return {
    context: {
      module: "assembly",
      entity: { type: "Assembly", id: assembly.id },
      generatedAt: new Date().toISOString(),
      version: getDebugVersion(),
    },
    rollups: {
      cutGoodQty: rollup?.cutGoodQty ?? null,
      sewGoodQty: rollup?.sewGoodQty ?? null,
      finishGoodQty: rollup?.finishGoodQty ?? null,
      packedQty: rollup?.packedQty ?? null,
      readyToPackQty: rollup?.readyToPackQty ?? null,
    },
    inputs: {
      jobId: assembly.job?.id ?? null,
      jobStatus: assembly.job?.status ?? null,
      assemblyStatus: assembly.status ?? null,
      targetDate: assembly.job?.targetDate ?? null,
      jobState: assembly.job?.state ?? null,
      jobInternalTargetDate: assembly.job?.internalTargetDate ?? null,
      jobCustomerTargetDate: assembly.job?.customerTargetDate ?? null,
      dropDeadDate: assembly.job?.dropDeadDate ?? null,
      jobShipToAddressId: assembly.job?.shipToAddressId ?? null,
      internalTargetDateOverride: assembly.internalTargetDateOverride ?? null,
      customerTargetDateOverride: assembly.customerTargetDateOverride ?? null,
      dropDeadDateOverride: assembly.dropDeadDateOverride ?? null,
      shipToAddressIdOverride: assembly.shipToAddressIdOverride ?? null,
      neededDate,
      quantityOrdered: assembly.quantity ?? null,
      quantityOrderedBreakdown: Array.isArray(assembly.qtyOrderedBreakdown)
        ? assembly.qtyOrderedBreakdown
        : null,
      orderQtyResolved: orderQtyResolution,
      costings: (assembly.costings || []).map((costing) => ({
        id: costing.id,
        productId: costing.productId,
        qtyPerUnit: costing.quantityPerUnit,
        enabled: costing.flagIsDisabled !== true,
        externalStepType: costing.externalStepType ?? null,
        activityUsed: costing.activityUsed ?? null,
        productType: costing.product?.type ?? null,
        stockTracked: costing.product?.stockTrackingEnabled ?? null,
      })),
    },
    derived: {
      materialCoverageHeld: coverage?.held ?? false,
      coverageReasons: coverage?.reasons ?? [],
      materials: cappedMaterials,
      materialsTruncated: truncated,
      externalSteps,
      activityTotals,
      boxSummary,
    },
    reasoning: coverage?.reasons?.map((reason) => ({
      code: reason.status ?? "PO_HOLD",
      label: reason.status ?? "PO hold",
      why: reason.message,
      evidence: {
        productId: reason.productId,
        qtyUncovered: reason.qtyUncovered,
        effectiveQty: reason.effectiveQty,
        toleranceQty: reason.toleranceQty,
        earliestEta: reason.earliestEta,
      },
    })),
    links: jobId
      ? [
          {
            label: `Assembly A${assembly.id}`,
            href: `/jobs/${jobId}/assembly/${assembly.id}`,
          },
          { label: `Job ${jobId}`, href: `/jobs/${jobId}` },
        ]
      : [],
  };
}

function summarizeActivities(activities: any[]) {
  const summary: Record<string, { count: number; qty: number }> = {};
  activities.forEach((activity) => {
    const key = `${activity.stage || "other"}:${activity.action || "unknown"}`;
    const curr = summary[key] || { count: 0, qty: 0 };
    curr.count += 1;
    curr.qty += Number(activity.quantity || 0) || 0;
    summary[key] = curr;
  });
  return summary;
}

function summarizeBoxLines(lines: any[]) {
  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity || 0) || 0),
    0
  );
  const packedOnlyTotal = lines.reduce((sum, line) => {
    if (line.packingOnly) return sum + (Number(line.quantity || 0) || 0);
    return sum;
  }, 0);
  return {
    totalQty: total,
    packingOnlyQty: packedOnlyTotal,
    includedQty: total - packedOnlyTotal,
    lines: lines.map((line) => ({
      id: line.id,
      boxId: line.boxId,
      quantity: line.quantity,
      packingOnly: line.packingOnly,
    })),
  };
}
