import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Group, Stack } from "@mantine/core";
import { useEffect, useState, type ReactNode } from "react";
import {
  prisma,
  prismaBase,
  refreshProductStockSnapshot,
} from "~/utils/prisma.server";
import { BreadcrumbSet, getLogger } from "@aa/timber";
import { useRecordContext } from "../../../base/record/RecordContext";
import {
  createCutActivity,
  createFinishActivity,
  ensureFinishInventoryArtifacts,
} from "../../../utils/activity.server";
import { createPackActivity } from "~/modules/job/services/boxPacking.server";
import { AssembliesEditor } from "~/modules/job/components/AssembliesEditor";
import { syncJobStateFromAssemblies } from "~/modules/job/services/JobStateService";
import { normalizeAssemblyState } from "~/modules/job/stateUtils";
import { useRegisterNavLocation } from "~/hooks/useNavLocation";
import type { PackBoxSummary } from "~/modules/job/types/pack";
import {
  createDefectActivity,
  moveDefectDisposition,
} from "~/modules/job/services/defectActivity.server";
import {
  AssemblyStage,
  DefectDisposition,
  ActivityKind,
  ActivityAction,
} from "@prisma/client";
import { buildExternalStepsByAssembly } from "~/modules/job/services/externalSteps.server";

export const meta: MetaFunction = () => [{ title: "Job Assembly" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const jobId = Number(params.jobId);
  const raw = String(params.assemblyId || "");
  const idList = raw
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const isMulti = idList.length > 1;
  if (!idList.length) return redirect("/jobs");

  // Fetch all requested assemblies with consistent includes
  const assemblies = await prisma.assembly.findMany({
    where: { id: { in: idList }, jobId },
    include: {
      job: {
        include: {
          stockLocation: { select: { id: true, name: true } },
          company: { select: { id: true, priceMultiplier: true } },
        },
      },
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          leadTimeDays: true,
          supplier: {
            select: { id: true, name: true, defaultLeadTimeDays: true },
          },
        },
      },
      variantSet: true,
      primaryCosting: {
        select: { id: true, product: { select: { name: true, sku: true } } },
      },
      costings: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              leadTimeDays: true,
              stockTrackingEnabled: true,
              batchTrackingEnabled: true,
              salePriceGroup: { select: { id: true, saleRanges: true } },
              salePriceRanges: true,
              supplier: {
                select: { id: true, name: true, defaultLeadTimeDays: true },
              },
            },
          },
          salePriceGroup: { select: { id: true, saleRanges: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });
  if (!assemblies.length) return redirect("/jobs");

  const firstAssemblyJob = assemblies[0]?.job as
    | (typeof assemblies)[0]["job"]
    | undefined;
  const jobCompanyId = firstAssemblyJob?.company?.id ?? null;
  const jobStockLocationId = firstAssemblyJob?.stockLocation?.id ?? null;

  let packBoxes: PackBoxSummary[] = [];
  if (jobCompanyId && jobStockLocationId) {
    const boxes = await prisma.box.findMany({
      where: {
        companyId: jobCompanyId,
        locationId: jobStockLocationId,
        state: "open",
      },
      select: {
        id: true,
        warehouseNumber: true,
        description: true,
        notes: true,
        locationId: true,
        state: true,
        lines: { select: { quantity: true } },
      },
      orderBy: [{ warehouseNumber: "asc" }, { id: "asc" }],
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

  // If a single-assembly path actually belongs to a group, redirect to canonical group path
  if (!isMulti && (assemblies[0] as any).assemblyGroupId) {
    const grp = await prisma.assemblyGroup.findUnique({
      where: { id: Number((assemblies[0] as any).assemblyGroupId) },
      include: { assemblies: { select: { id: true }, orderBy: { id: "asc" } } },
    });
    const ids = (grp?.assemblies || []).map((a: any) => a.id);
    if (ids.length > 1) {
      return redirect(`/jobs/${jobId}/assembly/${ids.join(",")}`);
    }
  }

  // Fallback: product variant sets per assembly.productId
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
    const prods = (await prisma.product.findMany({
      where: { id: { in: prodIds } },
      select: { id: true, variantSet: { select: { variants: true } } },
    })) as Array<{ id: number; variantSet?: { variants: string[] } | null }>;
    for (const p of prods) {
      const vars = (p.variantSet?.variants as any) || [];
      if (Array.isArray(vars) && vars.length) prodVariantMap.set(p.id, vars);
    }
  }
  const assemblyTypes = await prisma.valueList.findMany({
    where: { type: "AssemblyType" },
    select: { label: true },
    orderBy: { label: "asc" },
  });
  const defectReasons = await prisma.valueList.findMany({
    where: { type: "DefectReason" },
    select: { id: true, label: true },
    orderBy: { label: "asc" },
  });

  // Minimal job info
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, name: true },
  });

  // Compute stock stats for all costings across assemblies
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
  const prodStocks = compIds.length
    ? await prisma.product.findMany({
        where: { id: { in: compIds } },
        select: { id: true },
      })
    : [];
  // We'll fetch stock metrics individually to match existing computed fields
  const stockByProduct = new Map<
    number,
    {
      allStock: number;
      byLocation: Array<{ location_id: number; qty: number }>;
    }
  >();
  for (const pid of compIds) {
    const p = await prisma.product.findUnique({ where: { id: pid } });
    const allStock = Number((p as any)?.c_stockQty ?? 0);
    const byLocation = ((p as any)?.c_byLocation || []) as Array<{
      location_id: number;
      qty: number;
    }>;
    stockByProduct.set(pid, { allStock, byLocation });
  }

  // Used quantities by costing across selected assemblies
  const usedByCosting = new Map<number, number>();
  for (const aid of idList) {
    const rows = (await prismaBase.$queryRaw`
      SELECT pml."costingId" AS cid,
             COALESCE(SUM(ABS(pml.quantity)),0)::float AS used
      FROM "ProductMovementLine" pml
      JOIN "ProductMovement" pm ON pm.id = pml."movementId"
      WHERE pm."assemblyId" = ${aid}
      GROUP BY pml."costingId"
    `) as Array<{ cid: number | null; used: number }>;
    for (const r of rows) {
      if (r.cid == null) continue;
      usedByCosting.set(
        r.cid,
        (usedByCosting.get(r.cid) || 0) + Number(r.used || 0)
      );
    }
  }

  const costingStats: Record<
    number,
    { allStock: number; locStock: number; used: number }
  > = {};
  for (const a of assemblies as any[]) {
    const jobLocId =
      a.job?.stockLocation?.id ?? (a.job as any)?.stockLocationId ?? null;
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
        (stock?.byLocation || []).find(
          (r: any) => (r.location_id ?? null) === jobLocId
        )?.qty ?? 0
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
    activities = await prisma.assemblyActivity.findMany({
      where: { assemblyId: { in: assemblyIds } },
      include: {
        job: true,
        vendorCompany: { select: { id: true, name: true } },
      },
      orderBy: [{ activityDate: "desc" }, { id: "desc" }],
    });
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
      (stage && ["cut", "sew", "finish", "pack"].includes(stage)
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
  let activityConsumptionMap:
    | Record<number, Record<number, Record<number, number>>>
    | undefined = undefined;
  if (assemblyIds.length) {
    const map: Record<number, Record<number, Record<number, number>>> = {};
    for (const aid of assemblyIds) {
      const consRows = (await prismaBase.$queryRaw`
        SELECT pm."assemblyActivityId" AS aid,
               COALESCE(pml."costingId", pm."costingId") AS cid,
               COALESCE(pml."batchId", 0) AS bid,
               COALESCE(SUM(ABS(pml.quantity)), ABS(pm.quantity), 0)::float AS qty
        FROM "ProductMovement" pm
        LEFT JOIN "ProductMovementLine" pml ON pm.id = pml."movementId"
        WHERE pm."assemblyId" = ${aid}
        GROUP BY pm.id, pm."assemblyActivityId", cid, bid
      `) as Array<{
        aid: number | null;
        cid: number | null;
        bid: number | null;
        qty: number;
      }>;
      for (const r of consRows) {
        const activityId = r.aid ?? 0;
        const cid = r.cid ?? 0;
        const bid = r.bid ?? 0; // bid=0 means no batch recorded
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

  // Legacy pack activities tied to shipment lines should surface references (read-only)
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
    const movements = await prisma.productMovement.findMany({
      where: { assemblyActivityId: { in: packActivityIds } },
      select: { assemblyActivityId: true, shippingLineId: true },
    });
    const shipmentLineIds = movements
      .map((m) => Number(m.shippingLineId))
      .filter((id) => Number.isFinite(id));
    const shipmentLines = shipmentLineIds.length
      ? await prisma.shipmentLine.findMany({
          where: { id: { in: shipmentLineIds } },
          select: {
            id: true,
            shipmentId: true,
            shipment: {
              select: {
                id: true,
                trackingNo: true,
                packingSlipCode: true,
                type: true,
              },
            },
          },
        })
      : [];
    const lineById = new Map(
      shipmentLines.map((line) => [line.id, line] as const)
    );
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
    | Array<{ id: number; sku: string | null; name: string | null }>
    | undefined = undefined;
  if (!isMulti) {
    const assembly = assemblies[0] as any;
    products = await prismaBase.product.findMany({
      select: { id: true, sku: true, name: true },
      orderBy: { id: "asc" },
      where: { flagIsDisabled: false },
    });
    if (!assembly.variantSetId && assembly.productId) {
      const p = await prisma.product.findUnique({
        where: { id: assembly.productId },
        select: {
          variantSet: { select: { id: true, name: true, variants: true } },
        },
      });
      productVariantSet = (p?.variantSet as any) || null;
    }
  }

  const computeStageStats = (
    acts: any[] | undefined,
    stage: "cut" | "sew" | "finish" | "pack",
    fallbackArr: number[],
    fallbackTotal: number
  ) => {
    if (stage === "finish") {
      console.log("[factory debug] computeStageStats finish: incoming", {
        stageActsCount: (acts || []).filter((a) => a?.stage === stage).length,
        fallbackArr,
        fallbackTotal,
      });
    }
    const goodArr: number[] = [];
    const defectArr: number[] = [];
    let goodTotal = 0;
    let defectTotal = 0;
    const stageActs = (acts || []).filter((a) => a?.stage === stage);
    if (!stageActs.length) {
      if ((acts || []).length) {
        const sampleAssemblyId = (acts?.[0] as any)?.assemblyId ?? null;
        console.log("[factory debug] missing stage acts", {
          stage,
          availableStages: Array.from(
            new Set((acts || []).map((a) => String(a?.stage || "")))
          ),
          assemblyId: sampleAssemblyId,
        });
      }
      return {
        goodArr: fallbackArr,
        defectArr: [],
        usableArr: fallbackArr,
        attemptsArr: fallbackArr,
        goodTotal: fallbackTotal,
        defectTotal: 0,
        usableTotal: fallbackTotal,
        attemptsTotal: fallbackTotal,
      };
    }
    if (stage === "finish") {
      console.log("[factory debug] computeStageStats finish", {
        stageActs: stageActs.map((a) => ({
          id: a.id,
          qty: a.quantity,
          qtyBreakdown: a.qtyBreakdown,
          stage: a.stage,
          kind: a.kind,
        })),
        fallbackArr,
        fallbackTotal,
      });
    }
    const applyArr = (target: number[], source: number[], sign: number) => {
      const len = Math.max(target.length, source.length);
      for (let i = 0; i < len; i++) {
        const curr = Number(target[i] ?? 0) || 0;
        const val = Number(source[i] ?? 0) || 0;
        target[i] = curr + sign * val;
      }
    };
    for (const act of stageActs) {
      const qty = Number(act.quantity ?? 0) || 0;
      const breakdown =
        Array.isArray(act.qtyBreakdown) && act.qtyBreakdown.length
          ? (act.qtyBreakdown as number[])
          : qty
          ? [qty]
          : [];
      if (act.kind === "defect") {
        defectTotal += qty;
        applyArr(defectArr, breakdown, 1);
      } else {
        goodTotal += qty;
        applyArr(goodArr, breakdown, 1);
      }
    }
    const usableArr: number[] = [];
    const attemptsArr: number[] = [];
    const len = Math.max(goodArr.length, defectArr.length);
    for (let i = 0; i < len; i++) {
      const good = Number(goodArr[i] ?? 0) || 0;
      const bad = Number(defectArr[i] ?? 0) || 0;
      usableArr[i] = good - bad;
      attemptsArr[i] = good; // attempts reflect good work logged; defects shown separately
    }
    return {
      goodArr,
      defectArr,
      usableArr,
      attemptsArr,
      goodTotal,
      defectTotal,
      usableTotal: goodTotal - defectTotal,
      attemptsTotal: goodTotal,
    };
  };

  const minArrays = (a: number[], b: number[]) => {
    const len = Math.max(a.length, b.length);
    const out: number[] = [];
    for (let i = 0; i < len; i++) {
      out[i] = Math.min(Number(a[i] ?? 0) || 0, Number(b[i] ?? 0) || 0);
    }
    return out;
  };

  const quantityItems = assemblies.map((a: any) => {
    let labels = (a.variantSet?.variants || []) as string[];
    if ((!labels || labels.length === 0) && (a as any).productId) {
      const fb = prodVariantMap.get(Number((a as any).productId));
      if (fb && fb.length) labels = fb as string[];
    }
    const acts = activitiesByAssembly.get(a.id) || [];
    const fallbackCutArr = ((a as any).c_qtyCut_Breakdown || []) as number[];
    const fallbackSewArr = ((a as any).c_qtySew_Breakdown || []) as number[];
    const fallbackFinishArr = ((a as any).c_qtyFinish_Breakdown ||
      []) as number[];
    const fallbackPackArr = ((a as any).c_qtyPack_Breakdown || []) as number[];
    const cutStats = computeStageStats(
      acts,
      "cut",
      fallbackCutArr,
      Number((a as any).c_qtyCut || 0) || 0
    );
    const sewStats = computeStageStats(
      acts,
      "sew",
      fallbackSewArr,
      Number((a as any).c_qtySew || 0) || 0
    );
    const finishStats = computeStageStats(
      acts,
      "finish",
      fallbackFinishArr,
      Number((a as any).c_qtyFinish || 0) || 0
    );
    const packStats = computeStageStats(
      acts,
      "pack",
      fallbackPackArr,
      Number((a as any).c_qtyPack || 0) || 0
    );
    // Pipeline usable counts: downstream stages cap upstream usable units
    const usableCutArr = cutStats.usableArr;
    const hasSewData =
      (sewStats?.attemptsTotal || 0) > 0 ||
      (fallbackSewArr || []).some((n) => Number(n) > 0);
    const hasFinishData =
      (finishStats?.attemptsTotal || 0) > 0 ||
      (fallbackFinishArr || []).some((n) => Number(n) > 0);
    const sewArrRaw = sewStats.usableArr;
    const finishArrRaw = finishStats.usableArr;
    const usableSewArr = hasSewData
      ? minArrays(sewArrRaw, usableCutArr)
      : sewArrRaw;
    const sewLimitBase = hasSewData ? usableSewArr : usableCutArr;
    const usableFinishArr = hasFinishData
      ? minArrays(finishArrRaw, sewLimitBase)
      : finishArrRaw;
    const hasPackData =
      (packStats?.attemptsTotal || 0) > 0 ||
      (Array.isArray(fallbackPackArr) &&
        fallbackPackArr.some((n) => Number(n) || 0));
    const usablePackArr = hasPackData
      ? minArrays(packStats.usableArr, usableFinishArr)
      : usableFinishArr;
    const usableCutTotal = cutStats.usableTotal;
    const usableSewTotal = hasSewData
      ? Math.min(sewStats.usableTotal, usableCutTotal)
      : sewStats.usableTotal;
    const usableFinishTotal = hasSewData
      ? Math.min(finishStats.usableTotal, usableSewTotal)
      : Math.min(finishStats.usableTotal, usableCutTotal);
    const usablePackTotal = hasPackData
      ? Math.min(packStats.usableTotal, usableFinishTotal)
      : usableFinishTotal;
    // Display values are capped by downstream throughput to reflect "usable for assembly"
    const displayCutArr = hasSewData
      ? minArrays(usableCutArr, usableSewArr)
      : usableCutArr;
    const displaySewArr = hasFinishData
      ? minArrays(usableSewArr, usableFinishArr)
      : usableSewArr;
    const displayFinishArr = hasPackData
      ? minArrays(usableFinishArr, usablePackArr)
      : usableFinishArr;
    const displayPackArr = hasPackData
      ? usablePackArr
      : Array.from({ length: usableFinishArr.length }, () => 0);
    const displayCutTotal = hasSewData
      ? Math.min(usableCutTotal, usableSewTotal)
      : usableCutTotal;
    const displaySewTotal = hasFinishData
      ? Math.min(usableSewTotal, usableFinishTotal)
      : usableSewTotal;
    const displayFinishTotal = hasPackData
      ? Math.min(usableFinishTotal, usablePackTotal)
      : usableFinishTotal;
    const displayPackTotal = hasPackData ? usablePackTotal : 0;
    return {
      assemblyId: a.id,
      label: `Assembly ${a.id}`,
      variants: {
        labels,
        numVariants:
          Number((a as any).c_numVariants || labels.length || 0) || 0,
      },
      ordered: ((a as any).qtyOrderedBreakdown || []) as number[],
      cut: displayCutArr,
      sew: displaySewArr,
      finish: displayFinishArr,
      pack: displayPackArr,
      totals: {
        cut: displayCutTotal,
        sew: displaySewTotal,
        finish: displayFinishTotal,
        pack: displayPackTotal,
      },
      stageStats: {
        cut: cutStats,
        sew: sewStats,
        finish: finishStats,
        pack: packStats,
      },
    };
  });

  const quantityByAssembly = new Map<number, { totals?: { cut?: number; sew?: number; finish?: number; pack?: number } }>();
  for (const item of quantityItems) {
    if (!item?.assemblyId) continue;
    quantityByAssembly.set(item.assemblyId, { totals: item.totals });
  }

  const externalStepsByAssembly = buildExternalStepsByAssembly({
    assemblies: assemblies as any,
    activitiesByAssembly,
    quantityByAssembly,
  });

  console.log(
    "[factory debug] make stage summary",
    quantityItems.map((q) => ({
      assemblyId: q.assemblyId,
      finish: q.finish,
      totals: q.totals,
      stageStats: q.stageStats?.finish,
    }))
  );

  console.log(
    "[assembly] quantityItems usable",
    JSON.stringify(
      {
        ids: assemblies.map((a: any) => a.id),
        items: quantityItems.map((q) => ({
          assemblyId: q.assemblyId,
          cut: q.cut,
          sew: q.sew,
          finish: q.finish,
          pack: q.pack,
          totals: q.totals,
        })),
      },
      null,
      2
    )
  );

  const primaryCostingIdByAssembly = Object.fromEntries(
    assemblies.map((a: any) => [a.id, (a as any).primaryCostingId ?? null])
  );

  return json({
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
    primaryCostingIdByAssembly,
    externalStepsByAssembly,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const jobId = Number(params.jobId);
  const raw = String(params.assemblyId || "");
  const idList = raw
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const assemblyId = idList[0];
  if (!jobId || !idList.length) return redirect(`/jobs/${jobId}`);
  const form = await request.formData();
  console.log("form", form);
  const intent = form.get("_intent");
  const sumInto = (target: number[], source: number[], sign = 1) => {
    const len = Math.max(target.length, source.length);
    for (let i = 0; i < len; i++) {
      const curr = Number(target[i] ?? 0) || 0;
      const val = Number(source[i] ?? 0) || 0;
      target[i] = curr + sign * val;
    }
  };
  const normalizeBreakdown = (arr: number[], fallbackQty: number) => {
    if (Array.isArray(arr) && arr.length) return arr.map((n) => Number(n) || 0);
    if (Number.isFinite(fallbackQty) && fallbackQty > 0) return [fallbackQty];
    return [];
  };
  const validateDefectBreakdown = async (opts: {
    assemblyId: number;
    stage: AssemblyStage;
    breakdown: number[];
    excludeActivityId?: number | null;
  }) => {
    if (!opts.breakdown.length) return null;
    const acts = await prisma.assemblyActivity.findMany({
      where: {
        assemblyId: opts.assemblyId,
        stage: {
          in: [
            AssemblyStage.cut,
            AssemblyStage.sew,
            AssemblyStage.finish,
            AssemblyStage.pack,
          ],
        },
      },
      select: {
        id: true,
        stage: true,
        kind: true,
        qtyBreakdown: true,
        quantity: true,
      },
    });
    const cutArr: number[] = [];
    const sewArr: number[] = [];
    const finishArr: number[] = [];
    const packArr: number[] = [];
    const cutDefArr: number[] = [];
    const sewDefArr: number[] = [];
    const finishDefArr: number[] = [];
    const apply = (target: number[], act: any, sign = 1) => {
      const arr = normalizeBreakdown(
        Array.isArray(act?.qtyBreakdown) ? (act.qtyBreakdown as number[]) : [],
        Number(act?.quantity ?? 0) || 0
      );
      sumInto(target, arr, sign);
    };
    acts.forEach((act) => {
      if (opts.excludeActivityId && act.id === opts.excludeActivityId) return;
      if (act.stage === AssemblyStage.cut) {
        if (act.kind === "defect") apply(cutDefArr, act, 1);
        else apply(cutArr, act, 1);
      }
      if (act.stage === AssemblyStage.sew) {
        if (act.kind === "defect") apply(sewDefArr, act, 1);
        else apply(sewArr, act, 1);
      }
      if (act.stage === AssemblyStage.finish) {
        if (act.kind === "defect") apply(finishDefArr, act, 1);
        else apply(finishArr, act, 1);
      }
      if (act.stage === AssemblyStage.pack) {
        apply(packArr, act, 1);
      }
    });
    const availableCut: number[] = [];
    const availableSew: number[] = [];
    const availableFinish: number[] = [];
    const len = Math.max(
      cutArr.length,
      cutDefArr.length,
      sewArr.length,
      sewDefArr.length,
      finishArr.length,
      finishDefArr.length,
      packArr.length,
      opts.breakdown.length
    );
    for (let i = 0; i < len; i++) {
      const cut = Number(cutArr[i] ?? 0) || 0;
      const cutDef = Number(cutDefArr[i] ?? 0) || 0;
      const sew = Number(sewArr[i] ?? 0) || 0;
      const sewDef = Number(sewDefArr[i] ?? 0) || 0;
      const finish = Number(finishArr[i] ?? 0) || 0;
      const finishDef = Number(finishDefArr[i] ?? 0) || 0;
      const pack = Number(packArr[i] ?? 0) || 0;
      availableCut[i] = cut - cutDef - sew;
      availableSew[i] = sew - sewDef - finish;
      availableFinish[i] = finish - finishDef - pack;
    }
    const errs: string[] = [];
    if (opts.stage === AssemblyStage.cut) {
      opts.breakdown.forEach((val, idx) => {
        if (val > Math.max(0, availableCut[idx] ?? 0)) {
          errs.push(`Cut defect at variant ${idx + 1} exceeds available cut (${Math.max(0, availableCut[idx] ?? 0)})`);
        }
      });
    }
    if (opts.stage === AssemblyStage.sew) {
      opts.breakdown.forEach((val, idx) => {
        if (val > Math.max(0, availableSew[idx] ?? 0)) {
          errs.push(`Sew defect at variant ${idx + 1} exceeds available sew (${Math.max(0, availableSew[idx] ?? 0)})`);
        }
      });
    }
    if (opts.stage === AssemblyStage.finish) {
      opts.breakdown.forEach((val, idx) => {
        if (val > Math.max(0, availableFinish[idx] ?? 0)) {
          errs.push(
            `Finish defect at variant ${idx + 1} exceeds available finish (${Math.max(0, availableFinish[idx] ?? 0)})`
          );
        }
      });
    }
    return errs.length ? errs.join("; ") : null;
  };
  const parseStatusMap = (
    rawValue: FormDataEntryValue | null
  ): Map<number, string> => {
    const map = new Map<number, string>();
    if (!rawValue || typeof rawValue !== "string") return map;
    if (!rawValue.trim()) return map;
    try {
      const obj = JSON.parse(rawValue);
      if (!obj || typeof obj !== "object") return map;
      for (const [key, val] of Object.entries(obj)) {
        const idNum = Number(key);
        if (!Number.isFinite(idNum)) continue;
        const normalized = normalizeAssemblyState(
          typeof val === "string" ? val : String(val ?? "")
        );
        if (!normalized) continue;
        map.set(idNum, normalized);
      }
    } catch {
      return map;
    }
    return map;
  };
  const applyStatusUpdates = async (
    statusMap: Map<number, string>
  ): Promise<boolean> => {
    if (!statusMap.size) return false;
    const targetIds = Array.from(statusMap.keys());
    const assemblies = await prisma.assembly.findMany({
      where: { id: { in: targetIds }, jobId },
      select: { id: true, status: true },
    });
    const updates = assemblies
      .map((asm) => {
        const next = statusMap.get(asm.id);
        const current = normalizeAssemblyState(asm.status as string | null);
        if (!next || next === current) return null;
        return { id: asm.id, status: next };
      })
      .filter(Boolean) as Array<{ id: number; status: string }>;
    for (const update of updates) {
      await prisma.assembly.update({
        where: { id: update.id },
        data: { status: update.status },
      });
    }
    if (updates.length) {
      await syncJobStateFromAssemblies(prisma, jobId);
      return true;
    }
    return false;
  };
  if (intent === "group.activity.create.cut") {
    const idsRaw = String(form.get("assemblyIds") || "");
    const ids = idsRaw
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
    const targetAssemblyIds = (ids.length ? ids : idList).filter((id) =>
      idList.includes(id)
    );
    if (!targetAssemblyIds.length) {
      throw new Response("No assemblies specified", { status: 400 });
    }
    const activityDateStr = String(form.get("activityDate") || "");
    const activityDate = activityDateStr
      ? new Date(activityDateStr)
      : new Date();
    const groupQtyStr = String(form.get("groupQty") || "[]");
    const qtyByAssembly = new Map<number, number[]>();
    try {
      const parsed = JSON.parse(groupQtyStr);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const aid = Number(entry?.assemblyId);
          if (!Number.isFinite(aid)) continue;
          const breakdown = Array.isArray(entry?.qtyBreakdown)
            ? entry.qtyBreakdown.map((n: any) =>
                Number.isFinite(Number(n)) ? Number(n) : 0
              )
            : [];
          qtyByAssembly.set(aid, breakdown);
        }
      }
    } catch {
      // ignore malformed payloads; fallback to empty breakdowns
    }
    const consumptionsStr = String(form.get("consumptions") || "[]");
    let consumptions: any[] = [];
    try {
      const c = JSON.parse(consumptionsStr);
      if (Array.isArray(c)) consumptions = c;
    } catch {
      consumptions = [];
    }
    console.log("[assembly.activity] group.create.cut", {
      jobId,
      assemblyIds: targetAssemblyIds,
      activityDate: activityDate.toISOString(),
      consumptionsCount: consumptions.length,
    });
    const groupKey = `cut-${jobId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    for (let index = 0; index < targetAssemblyIds.length; index++) {
      const targetId = targetAssemblyIds[index];
      const qtyBreakdown = qtyByAssembly.get(targetId) || [];
      await createCutActivity({
        assemblyId: targetId,
        jobId,
        activityDate,
        qtyBreakdown,
        consumptions: index === 0 ? consumptions : [],
        notes: null,
        groupKey,
        refreshStockSnapshot: index === targetAssemblyIds.length - 1,
      });
    }
    const returnTo = form.get("returnTo");
    if (typeof returnTo === "string" && returnTo.startsWith("/")) {
      return redirect(returnTo);
    }
    return redirect(`/jobs/${jobId}/assembly/${raw}`);
  }
  if (intent === "group.activity.create.finish") {
    const idsRaw = String(form.get("assemblyIds") || "");
    const ids = idsRaw
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
    const targetAssemblyIds = (ids.length ? ids : idList).filter((id) =>
      idList.includes(id)
    );
    if (!targetAssemblyIds.length) {
      throw new Response("No assemblies specified", { status: 400 });
    }
    const activityDateStr = String(form.get("activityDate") || "");
    const activityDate = activityDateStr
      ? new Date(activityDateStr)
      : new Date();
    const groupQtyStr = String(form.get("groupQty") || "[]");
    const qtyByAssembly = new Map<number, number[]>();
    try {
      const parsed = JSON.parse(groupQtyStr);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const aid = Number(entry?.assemblyId);
          if (!Number.isFinite(aid)) continue;
          const breakdown = Array.isArray(entry?.qtyBreakdown)
            ? entry.qtyBreakdown.map((n: any) =>
                Number.isFinite(Number(n)) ? Number(n) : 0
              )
            : [];
          qtyByAssembly.set(aid, breakdown);
        }
      }
    } catch {
      // ignore malformed payloads; fallback to empty breakdowns
    }
    console.log("[assembly.activity] group.create.finish", {
      jobId,
      assemblyIds: targetAssemblyIds,
      activityDate: activityDate.toISOString(),
    });
    const groupKey = `make-${jobId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    for (let index = 0; index < targetAssemblyIds.length; index++) {
      const targetId = targetAssemblyIds[index];
      const qtyBreakdown = qtyByAssembly.get(targetId) || [];
      await createFinishActivity({
        assemblyId: targetId,
        jobId,
        activityDate,
        qtyBreakdown,
        notes: null,
        groupKey,
        refreshStockSnapshot: index === targetAssemblyIds.length - 1,
      });
    }
    const returnTo = form.get("returnTo");
    if (typeof returnTo === "string" && returnTo.startsWith("/")) {
      return redirect(returnTo);
    }
    return redirect(`/jobs/${jobId}/assembly/${raw}`);
  }
  if (intent === "group.updateOrderedBreakdown") {
    const orderedStr = String(form.get("orderedArr") || "{}");
    const qpuStr = String(form.get("qpu") || "{}");
    const activityStr = String(form.get("activity") || "{}");
    const primaryStr = String(form.get("primaryCostingIds") || "{}");
    let orderedByAssembly: Record<string, number[]> = {};
    let qpu: Record<string, number> = {};
    let activity: Record<string, string> = {};
    let primaryMap: Record<string, number> = {};
    try {
      const obj = JSON.parse(orderedStr);
      if (obj && typeof obj === "object") orderedByAssembly = obj;
    } catch {}
    try {
      const obj = JSON.parse(qpuStr);
      if (obj && typeof obj === "object") qpu = obj;
    } catch {}
    try {
      const obj = JSON.parse(activityStr);
      if (obj && typeof obj === "object") activity = obj;
    } catch {}
    try {
      const obj = JSON.parse(primaryStr);
      if (obj && typeof obj === "object") primaryMap = obj;
    } catch {}
    // Apply ordered breakdown per assembly
    for (const [aid, arr] of Object.entries(orderedByAssembly)) {
      const aId = Number(aid);
      if (!Number.isFinite(aId)) continue;
      await prisma.assembly.update({
        where: { id: aId },
        data: { qtyOrderedBreakdown: Array.isArray(arr) ? (arr as any) : [] },
      });
    }
    // Apply Qty/Unit updates (direct targets)
    const entries = Object.entries(qpu)
      .filter(
        ([id, v]) => Number.isFinite(Number(id)) && Number.isFinite(Number(v))
      )
      .map(([id, v]) => [Number(id), Number(v)] as const);
    for (const [cid, val] of entries) {
      await prisma.costing.update({
        where: { id: cid },
        data: { quantityPerUnit: val },
      });
    }
    // Apply Activity Used updates (direct targets)
    const actEntries = Object.entries(activity)
      .filter(([id, v]) => Number.isFinite(Number(id)) && typeof v === "string")
      .map(([id, v]) => [Number(id), String(v).toLowerCase()] as const);
    const allowed = new Set(["cut", "make"]);
    for (const [cid, val] of actEntries) {
      if (!allowed.has(val)) continue;
      await prisma.costing.update({
        where: { id: cid },
        data: { activityUsed: val },
      });
    }
    // Apply primary costing updates
    const primaryEntries = Object.entries(primaryMap).filter(
      ([aid, cid]) => Number.isFinite(Number(aid)) && Number.isFinite(Number(cid))
    );
    for (const [aid, cid] of primaryEntries) {
      await prisma.assembly.update({
        where: { id: Number(aid) },
        data: { primaryCostingId: Number(cid) },
      });
    }
    // Propagate edits across shared product costings in the selected assemblies
    // Build product-level intents from any changed costing ids
    const changedCostingIds = Array.from(
      new Set([...entries.map(([id]) => id), ...actEntries.map(([id]) => id)])
    );
    if (changedCostingIds.length) {
      const changed = await prisma.costing.findMany({
        where: { id: { in: changedCostingIds } },
        select: { id: true, productId: true },
      });
      const byProduct = new Map<number, { qpu?: number; activity?: string }>();
      for (const c of changed) {
        const pid = Number(c.productId || 0) || 0;
        if (!pid) continue;
        const map = byProduct.get(pid) || {};
        if (
          qpu[String(c.id)] != null &&
          Number.isFinite(Number(qpu[String(c.id)]))
        ) {
          map.qpu = Number(qpu[String(c.id)]);
        }
        if (activity[String(c.id)]) {
          const val = String(activity[String(c.id)]).toLowerCase();
          if (allowed.has(val)) map.activity = val;
        }
        byProduct.set(pid, map);
      }
      if (byProduct.size) {
        const targetProducts = Array.from(byProduct.keys());
        const related = await prisma.costing.findMany({
          where: {
            assemblyId: { in: idList },
            productId: { in: targetProducts },
          },
          select: { id: true, productId: true },
        });
        for (const r of related) {
          const spec = byProduct.get(Number(r.productId));
          if (!spec) continue;
          const data: any = {};
          if (spec.qpu != null) data.quantityPerUnit = spec.qpu;
          if (spec.activity) data.activityUsed = spec.activity;
          if (Object.keys(data).length)
            await prisma.costing.update({ where: { id: r.id }, data });
        }
      }
    }
    await applyStatusUpdates(parseStatusMap(form.get("statuses")));
    return redirect(`/jobs/${jobId}/assembly/${raw}`);
  }
  if (intent === "assembly.update" || intent === "assembly.update.fromGroup") {
    const overrideId = Number(form.get("assemblyId"));
    const targetAssemblyId = Number.isFinite(overrideId)
      ? overrideId
      : assemblyId;
    const data: any = {};
    if (form.has("name")) {
      data.name = ((form.get("name") as string) || "").trim() || null;
    }
    let statusChanged = false;
    if (form.has("assemblyType")) {
      const typeVal = String(form.get("assemblyType") ?? "").trim();
      data.assemblyType = typeVal || "Prod";
    }
    if (form.has("status")) {
      const statusVal = normalizeAssemblyState(
        String(form.get("status") ?? "").trim()
      );
      data.status = statusVal || null;
      statusChanged = true;
    }
    if (form.has("statusWhiteboard")) {
      const noteVal = String(form.get("statusWhiteboard") ?? "");
      data.statusWhiteboard = noteVal || null;
    }
    if (Object.keys(data).length) {
      await prisma.assembly.update({ where: { id: targetAssemblyId }, data });
      if (statusChanged) {
        await syncJobStateFromAssemblies(prisma, jobId);
      }
    }
    const returnTo = form.get("returnTo");
    if (typeof returnTo === "string" && returnTo.startsWith("/")) {
      return redirect(returnTo);
    }
    return redirect(`/jobs/${jobId}/assembly/${raw}`);
  }
  if (intent === "assembly.groupState") {
    const idsRaw = String(form.get("assemblyIds") || "");
    const ids = idsRaw
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
    const affectedIds = Array.from(new Set(ids));
    if (affectedIds.length) {
      const data: any = {};
      let statusChanged = false;
      if (form.has("status")) {
        const statusVal = normalizeAssemblyState(
          String(form.get("status") ?? "").trim()
        );
        if (statusVal) {
          data.status = statusVal;
          statusChanged = true;
        }
      }
      if (form.has("statusWhiteboard")) {
        const noteVal = String(form.get("statusWhiteboard") ?? "");
        data.statusWhiteboard = noteVal || null;
      }
      if (Object.keys(data).length) {
        await prisma.assembly.updateMany({
          where: { id: { in: affectedIds }, jobId },
          data,
        });
        if (statusChanged) {
          await syncJobStateFromAssemblies(prisma, jobId);
        }
      }
    }
    const returnTo = form.get("returnTo");
    if (typeof returnTo === "string" && returnTo.startsWith("/")) {
      return redirect(returnTo);
    }
    return redirect(`/jobs/${jobId}/assembly/${raw}`);
  }
  if (intent === "costing.create") {
    const compRaw = form.get("productId") ?? form.get("componentId");
    const compNum = compRaw == null || compRaw === "" ? null : Number(compRaw);
    const productId = Number.isFinite(compNum as any)
      ? (compNum as number)
      : null;
    const quantityPerUnit = form.get("quantityPerUnit")
      ? Number(form.get("quantityPerUnit"))
      : null;
    let unitCost = form.get("unitCost") ? Number(form.get("unitCost")) : null;
    const notes = (form.get("notes") as string) || null;
    if ((unitCost == null || Number.isNaN(unitCost)) && productId) {
      const p = await prisma.product.findUnique({
        where: { id: productId },
        select: { costPrice: true },
      });
      unitCost = Number(p?.costPrice ?? 0) || 0;
    }
    await prisma.costing.create({
      data: {
        assemblyId: assemblyId,
        productId: productId ?? undefined,
        quantityPerUnit,
        unitCost,
        notes,
      },
    });
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "costing.enable" || intent === "costing.disable") {
    const cid = Number(form.get("id"));
    if (Number.isFinite(cid)) {
      const costing = await prisma.costing.findUnique({
        where: { id: cid },
        select: { flagDefinedInProduct: true },
      });
      if (costing) {
        if (intent === "costing.enable") {
          await prisma.costing.update({
            where: { id: cid },
            data: { flagIsDisabled: false },
          });
        } else if (costing.flagDefinedInProduct) {
          await prisma.costing.update({
            where: { id: cid },
            data: { flagIsDisabled: true },
          });
        }
      }
    }
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "costing.delete") {
    const cid = Number(form.get("id"));
    if (Number.isFinite(cid)) {
      const costing = await prisma.costing.findUnique({
        where: { id: cid },
        select: { flagDefinedInProduct: true },
      });
      if (costing && !costing.flagDefinedInProduct) {
        await prisma.costing.delete({ where: { id: cid } });
      }
    }
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "activity.delete") {
    const aid = Number(form.get("activityId") ?? form.get("id"));
    if (Number.isFinite(aid)) {
      await prisma.$transaction(async (tx) => {
        const movements = await tx.productMovement.findMany({
          where: { assemblyActivityId: aid },
          select: { id: true, shippingLineId: true },
        });
        const movementIds = movements.map((m) => m.id);
        const shipmentLineIds = movements
          .map((m) => Number(m.shippingLineId))
          .filter((id) => Number.isFinite(id));
        if (movementIds.length) {
          await tx.productMovementLine.deleteMany({
            where: { movementId: { in: movementIds } },
          });
          await tx.productMovement.deleteMany({
            where: { id: { in: movementIds } },
          });
        }
        if (shipmentLineIds.length) {
          await tx.boxLine.deleteMany({
            where: { shipmentLineId: { in: shipmentLineIds } },
          });
          await tx.shipmentLine.deleteMany({
            where: { id: { in: shipmentLineIds } },
          });
        }
        await tx.assemblyActivity.delete({ where: { id: aid } });
      });
      await refreshProductStockSnapshot();
    }
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "activity.create.cut") {
    const qtyArrStr = String(form.get("qtyBreakdown") || "[]");
    const activityDateStr = String(form.get("activityDate") || "");
    const consumptionsStr = String(form.get("consumptions") || "[]");
    let qtyArr: number[] = [];
    let consumptions: any[] = [];
    try {
      const arr = JSON.parse(qtyArrStr);
      if (Array.isArray(arr))
        qtyArr = arr.map((n: any) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
    } catch {}
    try {
      const c = JSON.parse(consumptionsStr);
      if (Array.isArray(c)) consumptions = c;
    } catch {}
    const activityDate = activityDateStr
      ? new Date(activityDateStr)
      : new Date();
    console.log("[assembly.activity] create.cut", {
      jobId,
      assemblyId,
      activityDate: activityDate.toISOString(),
      qtyBreakdownLen: qtyArr.length,
      consumptionsCount: consumptions.length,
    });
    await createCutActivity({
      assemblyId,
      jobId,
      activityDate,
      qtyBreakdown: qtyArr,
      consumptions,
      notes: null,
    });
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "activity.create.finish") {
    const qtyArrStr = String(form.get("qtyBreakdown") || "[]");
    const activityDateStr = String(form.get("activityDate") || "");
    let qtyArr: number[] = [];
    try {
      const arr = JSON.parse(qtyArrStr);
      if (Array.isArray(arr))
        qtyArr = arr.map((n: any) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
    } catch {}
    const activityDate = activityDateStr
      ? new Date(activityDateStr)
      : new Date();
    console.log("[assembly.activity] create.finish", {
      jobId,
      assemblyId,
      activityDate: activityDate.toISOString(),
      qtyBreakdownLen: qtyArr.length,
    });
    await createFinishActivity({
      assemblyId,
      jobId,
      activityDate,
      qtyBreakdown: qtyArr,
      notes: null,
      groupKey: null,
    });
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "activity.create.pack") {
    const qtyArrStr = String(form.get("qtyBreakdown") || "[]");
    const activityDateStr = String(form.get("activityDate") || "");
    let qtyArr: number[] = [];
    try {
      const arr = JSON.parse(qtyArrStr);
      if (Array.isArray(arr))
        qtyArr = arr.map((n: any) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
    } catch {}
    const activityDate = activityDateStr
      ? new Date(activityDateStr)
      : new Date();
    const overrideAssemblyId = Number(form.get("assemblyId"));
    const targetAssemblyId = Number.isFinite(overrideAssemblyId)
      ? overrideAssemblyId
      : assemblyId;
    const rawBoxMode = String(form.get("boxMode") || "new").toLowerCase();
    const boxMode = rawBoxMode === "existing" ? "existing" : "new";
    const existingBoxIdStr = form.get("existingBoxId");
    const warehouseNumberStr = form.get("warehouseNumber");
    const parsedWarehouse = (() => {
      if (!warehouseNumberStr) return null;
      const value = Number(String(warehouseNumberStr).trim());
      return Number.isFinite(value) ? value : null;
    })();
    const boxDescription = (form.get("boxDescription") as string) || null;
    const boxNotes = (form.get("boxNotes") as string) || null;
    await createPackActivity({
      assemblyId: targetAssemblyId,
      jobId,
      qtyBreakdown: qtyArr,
      activityDate,
      boxMode,
      existingBoxId: existingBoxIdStr ? Number(String(existingBoxIdStr)) : null,
      warehouseNumber: parsedWarehouse,
      boxDescription,
      boxNotes,
    });
    return redirect(`/jobs/${jobId}/assembly/${raw}`);
  }
  if (intent === "activity.update") {
    const activityId = Number(form.get("activityId"));
    const qtyArrStr = String(form.get("qtyBreakdown") || "[]");
    const activityDateStr = String(form.get("activityDate") || "");
    const consumptionsStr = String(form.get("consumptions") || "[]");
    const defectReasonRaw = form.get("defectReasonId");
    const defectReasonId =
      defectReasonRaw != null && defectReasonRaw !== ""
        ? Number(defectReasonRaw)
        : null;
    const defectReasonValid =
      defectReasonId != null &&
      Number.isFinite(defectReasonId) &&
      defectReasonId > 0;
    const notesRaw = form.get("notes");
    const dispositionRaw = form.get("defectDisposition");
    const dispositionVal =
      typeof dispositionRaw === "string" ? dispositionRaw.trim() : "";
    const allowedDisposition = new Set<DefectDisposition>([
      DefectDisposition.review,
      DefectDisposition.scrap,
      DefectDisposition.offSpec,
      DefectDisposition.sample,
      DefectDisposition.none,
    ]);
    const newDisposition: DefectDisposition | null = allowedDisposition.has(
      dispositionVal as DefectDisposition
    )
      ? (dispositionVal as DefectDisposition)
      : null;
    let qtyArr: number[] = [];
    let consumptions: any[] = [];
    try {
      const arr = JSON.parse(qtyArrStr);
      if (Array.isArray(arr))
        qtyArr = arr.map((n: any) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
    } catch {}
    try {
      const c = JSON.parse(consumptionsStr);
      if (Array.isArray(c)) consumptions = c;
    } catch {}
    const activityDate = activityDateStr
      ? new Date(activityDateStr)
      : new Date();
    const qtyTotal = qtyArr.reduce((t, n) => t + (Number(n) || 0), 0);
    const existingForValidation = await prisma.assemblyActivity.findUnique({
      where: { id: activityId },
      select: { assemblyId: true, stage: true, defectDisposition: true },
    });
    const validationBreakdown = normalizeBreakdown(qtyArr, qtyTotal);
    if (existingForValidation?.assemblyId) {
      const validationError = await validateDefectBreakdown({
        assemblyId: existingForValidation.assemblyId,
        stage: existingForValidation.stage as AssemblyStage,
        breakdown: validationBreakdown,
        excludeActivityId: activityId,
      });
      if (validationError) {
        return json({ error: validationError }, { status: 400 });
      }
    }
    let updatedDisposition: DefectDisposition | null = null;
    let previousDisposition: DefectDisposition | null = null;
    await prisma.$transaction(async (tx) => {
      const existingActivity = await tx.assemblyActivity.findUnique({
        where: { id: activityId },
        select: {
          defectDisposition: true,
          stage: true,
          assemblyId: true,
          action: true,
        },
      });
      previousDisposition = (existingActivity?.defectDisposition ??
        null) as DefectDisposition | null;
      const stageLower = String(existingActivity?.stage || "").toLowerCase();
      const isRecordedStage =
        stageLower === "cut" || stageLower === "make" || stageLower === "pack";
      const updateAction =
        isRecordedStage
          ? ActivityAction.RECORDED
          : existingActivity?.action ?? null;
      const updated = await tx.assemblyActivity.update({
        where: { id: activityId },
        data: {
          qtyBreakdown: qtyArr as any,
          quantity: qtyTotal,
          activityDate,
          defectDisposition: newDisposition ?? undefined,
          defectReasonId: defectReasonValid
            ? (defectReasonId as number)
            : null,
          notes:
            typeof notesRaw === "string" ? notesRaw || null : undefined,
          action: updateAction ?? undefined,
        },
        select: {
          id: true,
          assemblyId: true,
          jobId: true,
          groupKey: true,
          defectDisposition: true,
        },
      });
      updatedDisposition = updated.defectDisposition as
        | DefectDisposition
        | null;
      const existing = await tx.productMovement.findMany({
        where: { assemblyActivityId: activityId },
        select: { id: true },
      });
      const existingIds = existing.map((m) => m.id);
      if (existingIds.length) {
        await tx.productMovementLine.deleteMany({
          where: { movementId: { in: existingIds } },
        });
        await tx.productMovement.deleteMany({
          where: { id: { in: existingIds } },
        });
      }
      const targetAssemblyId = updated.assemblyId ?? assemblyId;
      const targetJobId = updated.jobId ?? jobId;
      if (normalizedType.includes("cut")) {
        for (const cons of consumptions || []) {
          const rawLines = (cons?.lines || []).filter(
            (l: any) => Number(l.qty) > 0 && Number.isFinite(Number(l.qty))
          );
          if (!rawLines.length) continue;
          const costing = await tx.costing.findUnique({
            where: { id: Number(cons.costingId) },
            select: { productId: true },
          });
          const enriched = await Promise.all(
            rawLines.map(async (line: any) => {
              const b = await tx.batch.findUnique({
                where: { id: Number(line.batchId) },
                select: { productId: true, locationId: true },
              });
              return {
                ...line,
                productId: b?.productId ?? null,
                locationId: b?.locationId ?? null,
              };
            })
          );
          const byLocation = new Map<number | null, any[]>();
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
            const headerProductId =
              costing?.productId ??
              lines.find((l) => l.productId != null)?.productId ??
              undefined;
            const movement = await tx.productMovement.create({
              data: {
                movementType: "Assembly",
                date: activityDate,
                jobId: targetJobId,
                assemblyId: targetAssemblyId,
                assemblyActivityId: activityId,
                costingId: Number(cons.costingId),
                locationOutId: locId ?? undefined,
                productId: headerProductId as number | undefined,
                quantity: totalQty,
                notes: "Cut consumption (edit)",
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
                  batchId: Number(line.batchId),
                  costingId: Number(cons.costingId),
                  quantity: -Math.abs(Number(line.qty)),
                  notes: null,
                },
              });
            }
          }
        }
      } else if (normalizedType.includes("make")) {
        await ensureFinishInventoryArtifacts(tx, {
          activityId: activityId,
          assemblyId: targetAssemblyId,
          jobId: targetJobId,
          qtyBreakdown: qtyArr,
          activityDate,
          groupKey: updated.groupKey ?? null,
        });
      }
    });
    if (
      newDisposition &&
      newDisposition !== DefectDisposition.none &&
      previousDisposition !== newDisposition
    ) {
      await moveDefectDisposition(activityId, newDisposition);
    }
    await refreshProductStockSnapshot();
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "activity.create.defect") {
    const assemblyIdRaw = Number(form.get("assemblyId") ?? assemblyId);
    const targetAssemblyId = Number.isFinite(assemblyIdRaw)
      ? assemblyIdRaw
      : assemblyId;
    const stageRaw = String(form.get("stage") || "").toLowerCase();
    let stageEnum: AssemblyStage;
    switch (stageRaw) {
      case "cut":
        stageEnum = AssemblyStage.cut;
        break;
      case "sew":
        stageEnum = AssemblyStage.sew;
        break;
      case "finish":
      case "make":
        stageEnum = AssemblyStage.finish;
        break;
      case "pack":
        stageEnum = AssemblyStage.pack;
        break;
      case "qc":
        stageEnum = AssemblyStage.qc;
        break;
      default:
        stageEnum = AssemblyStage.other;
    }
    const qty = Number(form.get("quantity"));
    const qtyBreakdownRaw = form.get("qtyBreakdown");
    let qtyBreakdown: number[] = [];
    if (typeof qtyBreakdownRaw === "string" && qtyBreakdownRaw.trim()) {
      try {
        const arr = JSON.parse(qtyBreakdownRaw);
        if (Array.isArray(arr))
          qtyBreakdown = arr
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n))
            .map((n) => n | 0);
      } catch {
        // ignore bad breakdown
      }
    }
    const defectReasonVal = Number(form.get("defectReasonId"));
    const defectReasonId =
      Number.isFinite(defectReasonVal) && defectReasonVal > 0
        ? defectReasonVal
        : null;
    const dispositionRaw = String(form.get("defectDisposition") || "review");
    const disposition = (
      ["review", "scrap", "offSpec", "sample", "none"] as DefectDisposition[]
    ).includes(dispositionRaw as DefectDisposition)
      ? (dispositionRaw as DefectDisposition)
      : DefectDisposition.review;
    const notes = form.get("notes");
    const breakdownForValidation = normalizeBreakdown(qtyBreakdown, qty);
    if (Number.isFinite(qty) && qty > 0) {
      const validationError = await validateDefectBreakdown({
        assemblyId: targetAssemblyId,
        stage: stageEnum,
        breakdown: breakdownForValidation,
      });
      if (validationError) {
        return json({ error: validationError }, { status: 400 });
      }
      await createDefectActivity({
        assemblyId: targetAssemblyId,
        jobId,
        activityDate: new Date(),
        stage: stageEnum,
        quantity: qty,
        qtyBreakdown,
        defectReasonId: defectReasonId ?? undefined,
        defectDisposition: disposition,
        notes: typeof notes === "string" ? notes : undefined,
      });
    }
    return redirect(`/jobs/${jobId}/assembly/${raw}`);
  }
  if (intent === "assembly.updateOrderedBreakdown") {
    const orderedStr = String(form.get("orderedArr") || "[]");
    const qpuStr = String(form.get("qpu") || "{}");
    const activityStr = String(form.get("activity") || "{}");
    const primaryStr = String(form.get("primaryCostingIds") || "{}");
    let ordered: number[] = [];
    let qpu: Record<string, number> = {};
    let activity: Record<string, string> = {};
    let primaryMap: Record<string, number> = {};
    try {
      const arr = JSON.parse(orderedStr);
      if (Array.isArray(arr))
        ordered = arr.map((n: any) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
    } catch {}
    try {
      const obj = JSON.parse(qpuStr);
      if (obj && typeof obj === "object") qpu = obj;
    } catch {}
    try {
      const obj = JSON.parse(activityStr);
      if (obj && typeof obj === "object") activity = obj;
    } catch {}
    try {
      const obj = JSON.parse(primaryStr);
      if (obj && typeof obj === "object") primaryMap = obj;
    } catch {}
    // Apply ordered breakdown update
    await prisma.assembly.update({
      where: { id: assemblyId },
      data: { qtyOrderedBreakdown: ordered as any },
    });
    // Apply Qty/Unit updates (if any)
    console.log("Updating QPU for costings:", qpu);
    const entries = Object.entries(qpu)
      .filter(
        ([id, v]) => Number.isFinite(Number(id)) && Number.isFinite(Number(v))
      )
      .map(([id, v]) => [Number(id), Number(v)] as const);
    console.log("mapped calues", entries);
    for (const [cid, val] of entries) {
      await prisma.costing.update({
        where: { id: cid },
        data: { quantityPerUnit: val },
      });
    }
    // Apply Activity Used updates (if any)
    console.log("Updating Activity Used for costings:", activity);
    const actEntries = Object.entries(activity)
      .filter(([id, v]) => Number.isFinite(Number(id)) && typeof v === "string")
      .map(([id, v]) => [Number(id), String(v).toLowerCase()] as const);
    const allowed = new Set(["cut", "make"]);
    for (const [cid, val] of actEntries) {
      if (!allowed.has(val)) continue;
      await prisma.costing.update({
        where: { id: cid },
        data: { activityUsed: val },
      });
    }
    // Apply primary costing if provided
    const primaryVal = primaryMap?.[String(assemblyId)];
    if (Number.isFinite(Number(primaryVal))) {
      await prisma.assembly.update({
        where: { id: assemblyId },
        data: { primaryCostingId: Number(primaryVal) },
      });
    }
    await applyStatusUpdates(parseStatusMap(form.get("statuses")));
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
}

export default function JobAssemblyRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "jobs" });
  const data = useLoaderData<typeof loader>() as any;
  const assemblies = (data.assemblies || []) as any[];
  const isGroup = (assemblies?.length || 0) > 1;

  const job = { id: data?.job?.id as number, name: data?.job?.name ?? null };
  const log = getLogger("assembly");
  const idKey = (assemblies || []).map((a: any) => a.id).join(",");
  log.debug({ assemblyId: idKey, jobId: job.id }, "Rendering assembly view");

  const {
    costingStats,
    activityConsumptionMap,
    activities,
    products,
    productVariantSet,
    assemblyTypes,
  } = data as any;

  const nav = useNavigation();
  const submit = useSubmit();
  const { setCurrentId } = useRecordContext();
  useEffect(() => {
    if (isGroup) setCurrentId(idKey);
    else if (assemblies?.[0]?.id) setCurrentId(assemblies[0].id);
  }, [isGroup, idKey, assemblies, setCurrentId]);

  // Prev/Next hotkeys handled globally in RecordProvider
  // Path building now automatic (replace last path segment with id); no custom builder needed.
  const [cutOpen, setCutOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<null | any>(null);

  const handleSubmitOrdered = (arr: number[]) => {
    const fd = new FormData();
    fd.set("_intent", "assembly.updateOrderedBreakdown");
    fd.set("orderedArr", JSON.stringify(arr));
    submit(fd, { method: "post" });
  };
  const renderGroupStatusBar = ({
    statusControls,
    whiteboardControl,
  }: {
    statusControls: ReactNode;
    whiteboardControl: ReactNode | null;
  }) => (
    <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
      <BreadcrumbSet
        breadcrumbs={[
          { label: "Jobs", href: "/jobs" },
          { label: `Job ${job.id}`, href: `/jobs/${job.id}` },
          {
            label: `Assemblies ${(assemblies || [])
              .map((a: any) => `A${a.id}`)
              .join(",")}`,
            href: `/jobs/${job.id}/assembly/${(assemblies || [])
              .map((a: any) => a.id)
              .join(",")}`,
          },
        ]}
      />
      <Group gap="sm" align="center">
        {whiteboardControl}
        {statusControls}
      </Group>
    </Group>
  );
  if (isGroup) {
    const quantityItems = (data.quantityItems || []) as any[];
    return (
      <Stack gap="lg">
        <AssembliesEditor
          job={job as any}
          assemblies={assemblies as any}
          quantityItems={quantityItems as any}
          priceMultiplier={1}
          costingStats={(costingStats || {}) as any}
          saveIntent="group.updateOrderedBreakdown"
          stateChangeIntent="assembly.update.fromGroup"
          groupContext={{ jobId: job.id, groupId: 0 }}
          products={products as any}
          activities={activities as any}
          activityConsumptionMap={activityConsumptionMap as any}
          packActivityReferences={data.packActivityReferences as any}
          assemblyTypeOptions={(assemblyTypes || []).map((t: any) => t.label || "")}
          defectReasons={data.defectReasons as any}
          renderStatusBar={renderGroupStatusBar}
          packContext={data.packContext as any}
          primaryCostingIdByAssembly={data.primaryCostingIdByAssembly as any}
          externalStepsByAssembly={data.externalStepsByAssembly as any}
        />
      </Stack>
    );
  }

  const assembly = assemblies[0] as any;
  // Single assembly view previously tried to destructure a top-level `costings` that
  // the loader never provided (loader only returns `assemblies` with nested `costings`).
  // This caused the costings table to render empty for single assembly while group view worked.
  // Treat single assembly as a degenerate group: rely on `assembly.costings` like group mode.
  const renderSingleStatusBar = ({
    statusControls,
    whiteboardControl,
  }: {
    statusControls: ReactNode;
    whiteboardControl: ReactNode | null;
  }) => (
    <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
      <BreadcrumbSet
        breadcrumbs={[
          { label: "Jobs", href: "/jobs" },
          { label: `Job ${job.id}`, href: `/jobs/${job.id}` },
          {
            label: `Assembly ${assembly.id}`,
            href: `/jobs/${job.id}/assembly/${assembly.id}`,
          },
        ]}
      />
      <Group gap="sm" align="center">
        {whiteboardControl}
        {statusControls}
      </Group>
    </Group>
  );

  return (
    <Stack gap="lg">
      <AssembliesEditor
        job={job as any}
        assemblies={
          [
            {
              ...assembly,
              // Pull nested costings directly off the assembly (loader includes them)
              costings: ((assembly as any).costings || []) as any,
              qtyOrderedBreakdown: (assembly as any).qtyOrderedBreakdown || [],
              c_qtyOrdered: (assembly as any).c_qtyOrdered ?? 0,
              c_qtyCut: (assembly as any).c_qtyCut ?? 0,
            },
          ] as any
        }
        quantityItems={data.quantityItems as any}
        priceMultiplier={
          Number((assembly.job as any)?.company?.priceMultiplier ?? 1) || 1
        }
        costingStats={costingStats as any}
        saveIntent="assembly.updateOrderedBreakdown"
        stateChangeIntent="assembly.update"
        products={products as any}
        activities={activities as any}
        activityConsumptionMap={activityConsumptionMap as any}
        packActivityReferences={data.packActivityReferences as any}
        assemblyTypeOptions={(assemblyTypes || []).map((t: any) => t.label || "")}
        activityVariantLabels={
          (assembly.variantSet?.variants?.length
            ? (assembly.variantSet.variants as any)
            : (productVariantSet?.variants as any)) || []
        }
        defectReasons={data.defectReasons as any}
        renderStatusBar={renderSingleStatusBar}
        packContext={data.packContext as any}
        primaryCostingIdByAssembly={data.primaryCostingIdByAssembly as any}
        externalStepsByAssembly={data.externalStepsByAssembly as any}
      />
    </Stack>
  );
}
