import { json, redirect } from "@remix-run/node";
import type { Params } from "@remix-run/react";
import { requireUserId } from "~/utils/auth.server";
import { getDebugAccessForUser } from "~/modules/debug/debugAccess.server";
import {
  loadDefaultInternalTargetLeadDays,
  loadDefaultInternalTargetBufferDays,
  loadDefaultDropDeadEscalationBufferDays,
  resolveAssemblyTargets,
} from "~/modules/job/services/targetOverrides.server";
import type { PackBoxSummary } from "~/modules/job/types/pack";
import { DefectDisposition, ActivityKind, ActivityAction, ExternalStepType } from "@prisma/client";
import { buildExternalStepsByAssembly } from "~/modules/job/services/externalSteps.server";
import {
  aggregateAssemblyStages,
  buildStageRowsFromAggregation,
  type StageAggregation,
} from "~/modules/job/services/stageRows.server";
import { coerceBreakdown, sumBreakdownArrays } from "~/modules/job/quantityUtils";
import { loadCoverageToleranceDefaults } from "~/modules/materials/services/coverageTolerance.server";
import { loadAssemblyRollups } from "~/modules/production/services/rollups.server";
import { loadMaterialCoverage } from "~/modules/production/services/materialCoverage.server";
import { loadSupplierOptionsByExternalStepTypes } from "~/modules/company/services/companyOptions.server";
import type { AssemblyDetailVM } from "~/modules/job/types/assemblyDetailVM";
import { getCompanyAddressOptions } from "~/utils/addressOwnership.server";
import {
  getActivitiesForAssemblies,
  getActiveProductsList,
  getAssembliesForJob,
  getAssemblyGroupInfo,
  getAssemblyTypes,
  getBoxLinesForAssemblies,
  getConsumptionRowsForAssembly,
  getDefectReasons,
  getJobMinimal,
  getOpenBoxes,
  getProductForStockSnapshot,
  getProductMovementsForActivities,
  getProductsForCostingStocks,
  getProductVariantSetsForProducts,
  getShipmentLinesWithShipment,
  getUsedByCostingForAssembly,
  getVariantSetForProduct,
} from "./assemblyDetailQueries.server";

export async function loadAssemblyDetailVM(opts: {
  request: Request;
  params: Params;
}): Promise<Response> {
  const userId = await requireUserId(opts.request);
  const jobId = Number(opts.params.jobId);
  const raw = String(opts.params.assemblyId || "");
  const idList = raw
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const isMulti = idList.length > 1;
  if (!idList.length) return redirect("/jobs");

  const assemblies = await getAssembliesForJob({ jobId, assemblyIds: idList });
  if (!assemblies.length) return redirect("/jobs");

  const firstAssemblyJob = assemblies[0]?.job as
    | (typeof assemblies)[0]["job"]
    | undefined;
  const jobCompanyId = firstAssemblyJob?.company?.id ?? null;
  const jobStockLocationId = firstAssemblyJob?.stockLocation?.id ?? null;

  let packBoxes: PackBoxSummary[] = [];
  if (jobCompanyId && jobStockLocationId) {
    const boxes = await getOpenBoxes({
      companyId: jobCompanyId,
      locationId: jobStockLocationId,
    });
    packBoxes = boxes.map((box) => ({
      id: box.id,
      warehouseNumber: box.warehouseNumber ?? null,
      description: box.description ?? null,
      notes: box.notes ?? null,
      locationId: box.locationId ?? null,
      state: box.state ?? null,
      totalQuantity: (box.lines || []).reduce(
        (total, line) => total + (Number(line.quantity) || 0),
        0
      ),
    }));
  }

  if (isMulti) {
    return redirect(`/jobs/${jobId}/assembly/${idList[0]}`);
  }

  const prodIds = Array.from(
    new Set(
      (assemblies as any[])
        .map((a) => (a as any).productId)
        .filter((id) => Number.isFinite(Number(id)))
        .map((n) => Number(n))
    )
  );
  const prodVariantMap = new Map<number, string[]>();
  if (prodIds.length) {
    const prods = await getProductVariantSetsForProducts({ productIds: prodIds });
    for (const p of prods) {
      const vars = (p.variantSet?.variants as any) || [];
      if (Array.isArray(vars) && vars.length) prodVariantMap.set(p.id, vars);
    }
  }

  const assemblyTypes = await getAssemblyTypes();
  const defectReasons = await getDefectReasons();

  const groupInfo =
    !isMulti && (assemblies[0] as any)?.assemblyGroupId
      ? await getAssemblyGroupInfo({ id: Number((assemblies[0] as any).assemblyGroupId) })
      : null;

  const job = await getJobMinimal({ jobId });

  const boxLines = await getBoxLinesForAssemblies({ assemblyIds: idList });
  const packedByAssembly = new Map<number, { breakdown: number[]; total: number }>();
  const addPackBreakdown = (assemblyId: number, breakdown: number[]) => {
    const current = packedByAssembly.get(assemblyId) || {
      breakdown: [],
      total: 0,
    };
    const next = [...current.breakdown];
    const len = Math.max(next.length, breakdown.length);
    for (let i = 0; i < len; i++) {
      const prev = Number(next[i] ?? 0) || 0;
      const val = Number(breakdown[i] ?? 0) || 0;
      next[i] = prev + val;
    }
    const total = next.reduce((sum, n) => sum + (Number(n) || 0), 0);
    packedByAssembly.set(assemblyId, { breakdown: next, total });
  };
  boxLines.forEach((line) => {
    if (!line?.assemblyId) return;
    const rawBreakdown = Array.isArray(line.qtyBreakdown)
      ? (line.qtyBreakdown as number[])
      : [];
    const fallback =
      rawBreakdown.length === 0 && line.quantity != null
        ? [Number(line.quantity) || 0]
        : [];
    const breakdown = rawBreakdown.length ? rawBreakdown : fallback;
    if (!breakdown.length) return;
    addPackBreakdown(line.assemblyId, breakdown);
  });

  const allCostings: any[] = (assemblies as any[]).flatMap(
    (a: any) => (a.costings || []) as any[]
  );
  const compIds = Array.from(
    new Set(
      allCostings
        .map((c) => c.product?.id || (c as any).productId || null)
        .filter((x): x is number => Number.isFinite(Number(x)))
        .map((x) => Number(x))
    )
  );
  const prodStocks = await getProductsForCostingStocks({ productIds: compIds });
  const stockByProduct = new Map<
    number,
    {
      allStock: number;
      byLocation: Array<{ location_id: number; qty: number }>;
    }
  >();
  for (const pid of compIds) {
    const p = await getProductForStockSnapshot({ productId: pid });
    const allStock = Number((p as any)?.c_stockQty ?? 0);
    const byLocation = ((p as any)?.c_byLocation || []) as Array<{
      location_id: number;
      qty: number;
    }>;
    stockByProduct.set(pid, { allStock, byLocation });
  }

  const usedByCosting = new Map<number, number>();
  for (const aid of idList) {
    const rows = await getUsedByCostingForAssembly({ assemblyId: aid });
    for (const r of rows) {
      if (r.cid == null) continue;
      usedByCosting.set(r.cid, (usedByCosting.get(r.cid) || 0) + Number(r.used || 0));
    }
  }

  const costingStats: Record<number, { allStock: number; locStock: number; used: number }> = {};
  for (const a of assemblies as any[]) {
    const jobLocId = a.job?.stockLocation?.id ?? (a.job as any)?.stockLocationId ?? null;
    for (const c of (a.costings || []) as any[]) {
      const pid = c.product?.id || (c as any).productId || null;
      if (!pid) {
        costingStats[c.id] = {
          allStock: 0,
          locStock: 0,
          used: usedByCosting.get(c.id) ?? 0,
        };
        continue;
      }
      const stock = stockByProduct.get(Number(pid));
      const allStock = stock?.allStock ?? 0;
      const locStock = Number(
        (stock?.byLocation || []).find((r: any) => (r.location_id ?? null) === jobLocId)?.qty ??
          0
      );
      costingStats[c.id] = {
        allStock,
        locStock,
        used: usedByCosting.get(c.id) ?? 0,
      };
    }
  }

  const assemblyIds = assemblies.map((a: any) => a.id);
  let activities: any[] = [];
  if (assemblyIds.length) {
    activities = await getActivitiesForAssemblies({ assemblyIds });
  }
  const normalizeActivity = (act: any) => {
    let stage = (act?.stage as string | null) ?? null;
    let kind = (act?.kind as string | null) ?? null;
    let disp =
      (act?.defectDisposition as string | null) ?? (DefectDisposition.none as any);
    if (stage) stage = stage.toString().toLowerCase();
    if (!stage) {
      const name = String(act?.name || "").toLowerCase();
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
    if (kind) kind = kind.toString().toLowerCase();
    if (!kind) {
      kind = ActivityKind.normal;
    }
    const action =
      act?.action ||
      (stage && ["cut", "sew", "finish", "pack", "cancel"].includes(stage)
        ? ActivityAction.RECORDED
        : null);
    return { ...act, stage, kind, defectDisposition: disp, action };
  };
  activities = (activities || []).map(normalizeActivity);
  const activitiesByAssembly = new Map<number, any[]>();
  for (const act of activities) {
    const aid = Number((act as any).assemblyId || 0);
    if (!aid) continue;
    const arr = activitiesByAssembly.get(aid) || [];
    arr.push(act);
    activitiesByAssembly.set(aid, arr);
  }

  const canceledByAssembly = new Map<number, number[]>();
  for (const [aid, acts] of activitiesByAssembly.entries()) {
    const breakdowns = (acts || [])
      .filter((act) => String(act?.stage || "").toLowerCase() === "cancel")
      .map((act) => coerceBreakdown(act?.qtyBreakdown, act?.quantity));
    const canceled = sumBreakdownArrays(breakdowns);
    canceledByAssembly.set(aid, canceled);
  }
  for (const assembly of assemblies as any[]) {
    (assembly as any).c_canceled_Breakdown =
      canceledByAssembly.get(assembly.id) || [];
  }

  let activityConsumptionMap:
    | Record<number, Record<number, Record<number, number>>>
    | undefined = undefined;
  if (assemblyIds.length) {
    const map: Record<number, Record<number, Record<number, number>>> = {};
    for (const aid of assemblyIds) {
      const consRows = await getConsumptionRowsForAssembly({ assemblyId: aid });
      for (const r of consRows) {
        const activityId = r.aid ?? 0;
        const cid = r.cid ?? 0;
        const bid = r.bid ?? 0;
        if (!activityId || !cid) continue;
        map[activityId] = map[activityId] || {};
        map[activityId][cid] = map[activityId][cid] || {};
        map[activityId][cid][bid] = Number(r.qty || 0);
      }
    }
    if (Object.keys(map).length) {
      activityConsumptionMap = map;
    }
  }

  let packActivityReferences:
    | Record<
        number,
        {
          kind: "shipment";
          shipmentLineId: number;
          shipmentId: number | null;
          trackingNo?: string | null;
          packingSlipCode?: string | null;
          shipmentType?: string | null;
        }
      >
    | undefined = undefined;
  const packActivityIds = activities
    .map((a: any) => {
      const stage = String(a?.stage || "").toLowerCase();
      const name = String(a?.name || "").toLowerCase();
      if (stage === "pack" || name.includes("pack")) return Number(a?.id);
      return null;
    })
    .filter((id: any) => Number.isFinite(id)) as number[];
  if (packActivityIds.length) {
    const movements = await getProductMovementsForActivities({ activityIds: packActivityIds });
    const shipmentLineIds = movements
      .map((m) => Number(m.shippingLineId))
      .filter((id) => Number.isFinite(id));
    const shipmentLines = await getShipmentLinesWithShipment({ shipmentLineIds });
    const lineById = new Map(shipmentLines.map((line) => [line.id, line] as const));
    for (const mv of movements) {
      const aid = mv.assemblyActivityId ?? null;
      const lineId = Number(mv.shippingLineId);
      if (!aid || !Number.isFinite(lineId)) continue;
      const line = lineById.get(lineId);
      if (!line) continue;
      packActivityReferences = packActivityReferences || {};
      packActivityReferences[aid] = {
        kind: "shipment",
        shipmentLineId: line.id,
        shipmentId: line.shipmentId ?? null,
        trackingNo: line.shipment?.trackingNo ?? null,
        packingSlipCode: line.shipment?.packingSlipCode ?? null,
        shipmentType: line.shipment?.type ?? null,
      };
    }
  }

  let productVariantSet:
    | { id: number; name: string | null; variants: string[] }
    | null
    | undefined = undefined;
  let products:
    | Array<{
        id: number;
        sku: string | null;
        name: string | null;
        productStage?: string | null;
      }>
    | undefined = undefined;
  if (!isMulti) {
    const assembly = assemblies[0] as any;
    products = await getActiveProductsList();
    if (!assembly.variantSetId && assembly.productId) {
      productVariantSet = await getVariantSetForProduct({ productId: assembly.productId });
    }
  }

  const stageAggregations = new Map<number, StageAggregation>();
  const quantityItems = assemblies.map((a: any) => {
    let labels = (a.variantSet?.variants || []) as string[];
    if ((!labels || labels.length === 0) && (a as any).productId) {
      const fb = prodVariantMap.get(Number((a as any).productId));
      if (fb && fb.length) labels = fb as string[];
    }
    const aggregation = aggregateAssemblyStages({
      assemblyId: a.id,
      orderedBreakdown: (a as any).qtyOrderedBreakdown || [],
      fallbackBreakdowns: {
        cut: (a as any).c_qtyCut_Breakdown || [],
        sew: (a as any).c_qtySew_Breakdown || [],
        finish: (a as any).c_qtyFinish_Breakdown || [],
      },
      fallbackTotals: {
        cut: (a as any).c_qtyCut ?? 0,
        sew: (a as any).c_qtySew ?? 0,
        finish: (a as any).c_qtyFinish ?? 0,
      },
      packSnapshot: packedByAssembly.get(a.id) || { breakdown: [], total: 0 },
      activities: activitiesByAssembly.get(a.id) || [],
    });
    stageAggregations.set(a.id, aggregation);
    return {
      assemblyId: a.id,
      label: `Assembly ${a.id}`,
      variants: {
        labels,
        numVariants: Number((a as any).c_numVariants || labels.length || 0) || 0,
      },
      orderedRaw: aggregation.orderedRaw,
      canceled: aggregation.canceled,
      ordered: aggregation.ordered,
      cut: aggregation.displayArrays.cut,
      sew: aggregation.displayArrays.sew,
      finish: aggregation.displayArrays.finish,
      pack: aggregation.displayArrays.pack,
      totals: {
        cut: aggregation.totals.cut,
        sew: aggregation.totals.sew,
        finish: aggregation.totals.finish,
        pack: aggregation.totals.pack,
      },
      stageStats: aggregation.stageStats,
      stageRows: [],
      finishInput: { breakdown: [], total: 0 },
    };
  });

  const quantityByAssembly = new Map<
    number,
    { totals?: { cut?: number; sew?: number; finish?: number; pack?: number } }
  >();
  for (const [assemblyId, aggregation] of stageAggregations.entries()) {
    quantityByAssembly.set(assemblyId, {
      totals: {
        cut: aggregation.totals.cut,
        sew: aggregation.totals.sew,
        finish: aggregation.totals.finish,
        pack: aggregation.totals.pack,
      },
    });
  }

  const externalStepsByAssembly = buildExternalStepsByAssembly({
    assemblies: assemblies as any,
    activitiesByAssembly,
    quantityByAssembly,
  });
  for (const item of quantityItems) {
    if (!item?.assemblyId) continue;
    const aggregation = stageAggregations.get(item.assemblyId);
    if (!aggregation) continue;
    const derivedSteps = externalStepsByAssembly[item.assemblyId] || [];
    const { rows, finishInput } = buildStageRowsFromAggregation({
      aggregation,
      derivedExternalSteps: derivedSteps,
    });
    item.stageRows = rows;
    item.finishInput = finishInput;
  }

  const toleranceDefaults = await loadCoverageToleranceDefaults();
  const rollups = assemblyIds.length ? await loadAssemblyRollups(assemblyIds) : new Map<number, any>();
  const rollupsByAssembly = Object.fromEntries(
    Array.from(rollups.entries()).map(([id, rollup]) => [id, rollup])
  );
  const materialCoverage = await loadMaterialCoverage({
    assemblies: assemblies as any,
    rollups,
    stockByProduct,
    toleranceDefaults,
  });
  const stepTypeSet = new Set<ExternalStepType>();
  Object.values(externalStepsByAssembly).forEach((steps) => {
    (steps || []).forEach((step) => stepTypeSet.add(step.type));
  });
  const vendorOptionsByStep = await loadSupplierOptionsByExternalStepTypes(Array.from(stepTypeSet));
  const locations = await prisma.location.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const shipToAddresses = jobCompanyId
    ? await getCompanyAddressOptions(jobCompanyId)
    : [];
  const [defaultLeadDays, bufferDays, escalationBufferDays] = await Promise.all([
    loadDefaultInternalTargetLeadDays(prisma),
    loadDefaultInternalTargetBufferDays(prisma),
    loadDefaultDropDeadEscalationBufferDays(prisma),
  ]);
  const assemblyTargetsById: Record<number, any> = Object.fromEntries(
    assemblies.map((assembly: any) => {
      const resolved = resolveAssemblyTargets({
        job: {
          createdAt: assembly.job?.createdAt ?? null,
          customerOrderDate: assembly.job?.customerOrderDate ?? null,
          internalTargetDate: assembly.job?.internalTargetDate ?? null,
          customerTargetDate: assembly.job?.customerTargetDate ?? null,
          dropDeadDate: assembly.job?.dropDeadDate ?? null,
          shipToLocation: assembly.job?.shipToLocation ?? null,
          shipToAddress: assembly.job?.shipToAddress ?? null,
        },
        assembly: {
          internalTargetDateOverride: assembly.internalTargetDateOverride,
          customerTargetDateOverride: assembly.customerTargetDateOverride,
          dropDeadDateOverride: assembly.dropDeadDateOverride,
          shipToLocationOverride: assembly.shipToLocationOverride ?? null,
          shipToAddressOverride: assembly.shipToAddressOverride ?? null,
        },
        defaultLeadDays,
        bufferDays,
        escalationBufferDays,
      });
      return [assembly.id, resolved];
    })
  );

  const primaryCostingIdByAssembly = Object.fromEntries(
    assemblies.map((a: any) => [a.id, (a as any).primaryCostingId ?? null])
  );

  const debugAccess = await getDebugAccessForUser(userId);

  const vm: AssemblyDetailVM = {
    job,
    assemblies,
    quantityItems,
    costingStats,
    activities,
    activityConsumptionMap,
    products,
    productVariantSet,
    packContext: {
      openBoxes: packBoxes,
      stockLocation: firstAssemblyJob?.stockLocation ?? null,
    },
    packActivityReferences: packActivityReferences || null,
    assemblyTypes,
    defectReasons,
    groupInfo,
    primaryCostingIdByAssembly,
    toleranceDefaults,
    rollupsByAssembly,
    vendorOptionsByStep,
    materialCoverageByAssembly: assemblies.map((assembly: any) => ({
      assemblyId: assembly.id,
      coverage: materialCoverage.get(assembly.id) ?? null,
    })),
    locations,
    shipToAddresses,
    defaultLeadDays,
    assemblyTargetsById,
    canDebug: debugAccess.canDebug,
  };

  // Preserve legacy behavior: prodStocks is computed but not returned (kept for side-effect parity).
  void prodStocks;

  return json(vm as any);
}
