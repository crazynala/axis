import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Group, Stack, Grid } from "@mantine/core";
import { useEffect, useState } from "react";
import { prisma, prismaBase } from "../../../utils/prisma.server";
import { BreadcrumbSet, getLogger } from "@aa/timber";
import { useRecordContext } from "../../../base/record/RecordContext";
import { createCutActivity } from "../../../utils/activity.server";
import { AssembliesEditor } from "~/modules/job/components/AssembliesEditor";
import { syncJobStateFromAssemblies } from "~/modules/job/services/JobStateService";

export const meta: MetaFunction = () => [{ title: "Job Assembly" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const jobId = Number(params.jobId);
  const raw = String(params.assemblyId || "");
  const idList = raw
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const isMulti = idList.length > 1;
  if (!idList.length) throw new Response("Not Found", { status: 404 });

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
      product: { select: { id: true, sku: true, name: true } },
      variantSet: true,
      costings: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              stockTrackingEnabled: true,
              batchTrackingEnabled: true,
              salePriceGroup: { select: { id: true, saleRanges: true } },
              salePriceRanges: true,
            },
          },
          salePriceGroup: { select: { id: true, saleRanges: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });
  if (!assemblies.length) throw new Response("Not Found", { status: 404 });

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

  const quantityItems = assemblies.map((a: any) => {
    let labels = (a.variantSet?.variants || []) as string[];
    if ((!labels || labels.length === 0) && (a as any).productId) {
      const fb = prodVariantMap.get(Number((a as any).productId));
      if (fb && fb.length) labels = fb as string[];
    }
    return {
      assemblyId: a.id,
      label: `Assembly ${a.id}`,
      variants: {
        labels,
        numVariants:
          Number((a as any).c_numVariants || labels.length || 0) || 0,
      },
      ordered: ((a as any).qtyOrderedBreakdown || []) as number[],
      cut: ((a as any).c_qtyCut_Breakdown || []) as number[],
      make: ((a as any).c_qtyMake_Breakdown || []) as number[],
      pack: ((a as any).c_qtyPack_Breakdown || []) as number[],
      totals: {
        cut: Number((a as any).c_qtyCut || 0),
        make: Number((a as any).c_qtyMake || 0),
        pack: Number((a as any).c_qtyPack || 0),
      },
    };
  });

  // Recent movements across the selected assemblies
  const groupMovements = await prisma.productMovement.findMany({
    where: { assemblyId: { in: idList } },
    orderBy: { date: "desc" },
    take: 50,
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

  // Single-assembly extras: activities, products, and activity consumption map
  let activities: any[] | undefined = undefined;
  let activityConsumptionMap:
    | Record<number, Record<number, Record<number, number>>>
    | undefined = undefined;
  let productVariantSet:
    | { id: number; name: string | null; variants: string[] }
    | null
    | undefined = undefined;
  let products:
    | Array<{ id: number; sku: string | null; name: string | null }>
    | undefined = undefined;
  if (!isMulti) {
    const assembly = assemblies[0] as any;
    activities = await prisma.assemblyActivity.findMany({
      where: { assemblyId: assembly.id },
      include: { job: true },
    });
    products = await prismaBase.product.findMany({
      select: { id: true, sku: true, name: true },
      orderBy: { id: "asc" },
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
    const consRows = (await prismaBase.$queryRaw`
      SELECT pm."assemblyActivityId" AS aid, pml."costingId" AS cid, pml."batchId" AS bid,
             COALESCE(SUM(ABS(pml.quantity)),0)::float AS qty
      FROM "ProductMovementLine" pml
      JOIN "ProductMovement" pm ON pm.id = pml."movementId"
      WHERE pm."assemblyId" = ${assembly.id}
      GROUP BY pm."assemblyActivityId", pml."costingId", pml."batchId"
    `) as Array<{
      aid: number | null;
      cid: number | null;
      bid: number | null;
      qty: number;
    }>;
    activityConsumptionMap = {} as any;
    for (const r of consRows) {
      const aid = r.aid ?? 0;
      const cid = r.cid ?? 0;
      const bid = r.bid ?? 0;
      if (!aid || !cid || !bid) continue;
      (activityConsumptionMap as any)[aid] =
        (activityConsumptionMap as any)[aid] || {};
      (activityConsumptionMap as any)[aid][cid] =
        (activityConsumptionMap as any)[aid][cid] || {};
      (activityConsumptionMap as any)[aid][cid][bid] = Number(r.qty || 0);
    }
  }

  return json({
    job,
    assemblies,
    quantityItems,
    costingStats,
    groupMovements,
    activities,
    products,
    productVariantSet,
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
  if (intent === "group.updateOrderedBreakdown") {
    const orderedStr = String(form.get("orderedArr") || "{}");
    const qpuStr = String(form.get("qpu") || "{}");
    const activityStr = String(form.get("activity") || "{}");
    let orderedByAssembly: Record<string, number[]> = {};
    let qpu: Record<string, number> = {};
    let activity: Record<string, string> = {};
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
    if (form.has("status")) {
      const statusVal = String(form.get("status") ?? "").trim();
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
  if (intent === "costing.create") {
    // Accept both productId (new) and componentId (legacy) keys
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
    // Default cost/price inputs from the product when not explicitly provided
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
  if (intent === "costing.delete") {
    const cid = Number(form.get("id"));
    if (cid) await prisma.costing.delete({ where: { id: cid } });
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "activity.delete") {
    const aid = Number(form.get("id"));
    if (aid) await prisma.assemblyActivity.delete({ where: { id: aid } });
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
  if (intent === "activity.update") {
    const activityId = Number(form.get("activityId"));
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
    // Update activity basics
    await prisma.assemblyActivity.update({
      where: { id: activityId },
      data: {
        qtyBreakdown: qtyArr as any,
        quantity: qtyArr.reduce((t, n) => t + (Number(n) || 0), 0),
        activityDate,
      },
    });
    // Remove existing movements for this activity and recreate from submitted consumptions
    const existing = await prisma.productMovement.findMany({
      where: { assemblyActivityId: activityId },
      select: { id: true },
    });
    const existingIds = existing.map((m) => m.id);
    if (existingIds.length) {
      await prisma.productMovementLine.deleteMany({
        where: { movementId: { in: existingIds } },
      });
      await prisma.productMovement.deleteMany({
        where: { id: { in: existingIds } },
      });
    }
    for (const cons of consumptions || []) {
      const rawLines = (cons?.lines || []).filter(
        (l: any) => Number(l.qty) > 0 && Number.isFinite(Number(l.qty))
      );
      if (!rawLines.length) continue;
      // Resolve header product from costing component
      const costing = await prisma.costing.findUnique({
        where: { id: Number(cons.costingId) },
        select: { productId: true },
      });
      // Enrich with batch product/location and group by location
      const enriched = await Promise.all(
        rawLines.map(async (line: any) => {
          const b = await prisma.batch.findUnique({
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
        const movement = await prisma.productMovement.create({
          data: {
            movementType: "Assembly",
            date: activityDate,
            jobId,
            assemblyId,
            assemblyActivityId: activityId,
            costingId: Number(cons.costingId),
            locationOutId: locId ?? undefined,
            productId: headerProductId as number | undefined,
            quantity: totalQty,
            notes: "Cut consumption (edit)",
          },
        });
        for (const line of lines) {
          await prisma.productMovementLine.create({
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
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "assembly.updateOrderedBreakdown") {
    const orderedStr = String(form.get("orderedArr") || "[]");
    const qpuStr = String(form.get("qpu") || "{}");
    const activityStr = String(form.get("activity") || "{}");
    let ordered: number[] = [];
    let qpu: Record<string, number> = {};
    let activity: Record<string, string> = {};
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
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
}

export default function JobAssemblyRoute() {
  const data = useLoaderData<typeof loader>() as any;
  const assemblies = (data.assemblies || []) as any[];
  const isGroup = (assemblies?.length || 0) > 1;

  const job = { id: data?.job?.id as number, name: data?.job?.name ?? null };
  const log = getLogger("assembly");
  const idKey = (assemblies || []).map((a: any) => a.id).join(",");
  log.debug({ assemblyId: idKey, jobId: job.id }, "Rendering assembly view");

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
  if (isGroup) {
    const quantityItems = (data.quantityItems || []) as any[];
    return (
      <Stack gap="lg">
        <Group justify="space-between" align="center">
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
        </Group>
        <Grid>
          <Grid.Col span={12}>
            <AssembliesEditor
              mode="group"
              job={job as any}
              assemblies={assemblies as any}
              quantityItems={quantityItems as any}
              priceMultiplier={1}
              costingStats={(data.costingStats || {}) as any}
              saveIntent="group.updateOrderedBreakdown"
              stateChangeIntent="assembly.update.fromGroup"
              groupMovements={(data.groupMovements || []) as any}
              groupContext={{ jobId: job.id, groupId: 0 }}
            />
          </Grid.Col>
        </Grid>
      </Stack>
    );
  }

  const assembly = assemblies[0] as any;
  // Single assembly view previously tried to destructure a top-level `costings` that
  // the loader never provided (loader only returns `assemblies` with nested `costings`).
  // This caused the costings table to render empty for single assembly while group view worked.
  // Treat single assembly as a degenerate group: rely on `assembly.costings` like group mode.
  const {
    costingStats,
    activityConsumptionMap,
    activities,
    products,
    productVariantSet,
  } = data as any;
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
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
      </Group>

      <AssembliesEditor
        mode="assembly"
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
        quantityItems={
          [
            {
              assemblyId: assembly.id,
              variants: {
                labels:
                  (assembly.variantSet?.variants?.length
                    ? assembly.variantSet.variants
                    : productVariantSet?.variants) || [],
                numVariants: Number((assembly as any).c_numVariants || 0) || 0,
              },
              ordered: ((assembly as any).qtyOrderedBreakdown ||
                []) as number[],
              cut: ((assembly as any).c_qtyCut_Breakdown || []) as number[],
              make: ((assembly as any).c_qtyMake_Breakdown || []) as number[],
              pack: ((assembly as any).c_qtyPack_Breakdown || []) as number[],
              totals: {
                cut: Number((assembly as any).c_qtyCut || 0),
                make: Number((assembly as any).c_qtyMake || 0),
                pack: Number((assembly as any).c_qtyPack || 0),
              },
            },
          ] as any
        }
        priceMultiplier={
          Number((assembly.job as any)?.company?.priceMultiplier ?? 1) || 1
        }
        costingStats={costingStats as any}
        saveIntent="assembly.updateOrderedBreakdown"
        stateChangeIntent="assembly.update"
        products={products as any}
        activities={activities as any}
        activityConsumptionMap={activityConsumptionMap as any}
        activityVariantLabels={
          (assembly.variantSet?.variants?.length
            ? (assembly.variantSet.variants as any)
            : (productVariantSet?.variants as any)) || []
        }
      />
    </Stack>
  );
}
