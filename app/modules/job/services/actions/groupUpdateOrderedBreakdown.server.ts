import { json, redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { parsePrimaryCostingId, parseStatusMap } from "../parsers/assemblyDetailFormParsers.server";
import { mapExternalStepTypeToActivityUsed } from "~/modules/job/services/externalStepActivity";
import { applyStatusUpdates } from "./applyStatusUpdates.server";

export async function handleGroupUpdateOrderedBreakdown(opts: {
  jobId: number;
  rawAssemblyIdParam: string;
  idList: number[];
  form: FormData;
}) {
  const orderedStr = String(opts.form.get("orderedArr") || "{}");
  const qpuStr = String(opts.form.get("qpu") || "{}");
  const activityStr = String(opts.form.get("activity") || "{}");
  const primaryStr = String(opts.form.get("primaryCostingIds") || "{}");
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

  for (const [aid, arr] of Object.entries(orderedByAssembly)) {
    const aId = Number(aid);
    if (!Number.isFinite(aId)) continue;
    await prisma.assembly.update({
      where: { id: aId },
      data: { qtyOrderedBreakdown: Array.isArray(arr) ? (arr as any) : [] },
    });
  }

  const entries = Object.entries(qpu)
    .filter(([id, v]) => Number.isFinite(Number(id)) && Number.isFinite(Number(v)))
    .map(([id, v]) => [Number(id), Number(v)] as const);
  for (const [cid, val] of entries) {
    await prisma.costing.update({
      where: { id: cid },
      data: { quantityPerUnit: val },
    });
  }

  const actEntries = Object.entries(activity)
    .filter(([id, v]) => Number.isFinite(Number(id)) && typeof v === "string")
    .map(([id, v]) => [Number(id), String(v).toLowerCase().trim()] as const);
  const allowed = new Set(["cut", "sew", "finish", "make"]);
  const actIds = actEntries.map(([id]) => id);
  const externalByCosting = new Map<number, string | null>();
  if (actIds.length) {
    const costings = await prisma.costing.findMany({
      where: { id: { in: actIds } },
      select: {
        id: true,
        externalStepType: true,
        product: { select: { externalStepType: true } },
      },
    });
    costings.forEach((c) => {
      externalByCosting.set(
        c.id,
        c.externalStepType ?? c.product?.externalStepType ?? null
      );
    });
  }
  for (const [cid, rawVal] of actEntries) {
    const externalType = externalByCosting.get(cid) ?? null;
    const externalActivity = mapExternalStepTypeToActivityUsed(externalType);
    const isExternal = Boolean(externalType);
    const normalized =
      rawVal === "make"
        ? "finish"
        : rawVal === "finish" || rawVal === "sew" || rawVal === "cut"
        ? rawVal
        : "";
    if (isExternal) {
      if (!externalActivity) continue;
      if (normalized && normalized !== externalActivity) {
        return json(
          {
            error:
              "External-step costings must use their external activity.",
          },
          { status: 400 }
        );
      }
      await prisma.costing.update({
        where: { id: cid },
        data: { activityUsed: externalActivity, externalStepType: externalType },
      });
      continue;
    }
    if (normalized && !allowed.has(normalized)) {
      return json(
        { error: `Invalid costing activity '${rawVal}'.` },
        { status: 400 }
      );
    }
    if (!normalized) continue;
    await prisma.costing.update({
      where: { id: cid },
      data: { activityUsed: normalized },
    });
  }

  const primaryEntries = Object.entries(primaryMap).filter(([aid]) => Number.isFinite(Number(aid)));
  for (const [aid, cidRaw] of primaryEntries) {
    const aId = Number(aid);
    if (!Number.isFinite(aId)) continue;
    const primaryId = parsePrimaryCostingId(cidRaw);
    if (primaryId == null) {
      await prisma.assembly.update({
        where: { id: aId },
        data: { primaryCostingId: null },
      });
      continue;
    }
    const exists = await prisma.costing.findFirst({
      where: { id: primaryId, assemblyId: aId },
      select: { id: true },
    });
    if (!exists) {
      return json(
        { error: `Primary costing ${primaryId} not found for assembly ${aId}.` },
        { status: 400 }
      );
    }
    await prisma.assembly.update({
      where: { id: aId },
      data: { primaryCostingId: primaryId },
    });
  }

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
      if (qpu[String(c.id)] != null && Number.isFinite(Number(qpu[String(c.id)]))) {
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
          assemblyId: { in: opts.idList },
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
        if (Object.keys(data).length) await prisma.costing.update({ where: { id: r.id }, data });
      }
    }
  }

  await applyStatusUpdates({ jobId: opts.jobId, statusMap: parseStatusMap(opts.form.get("statuses")) });
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.rawAssemblyIdParam}`);
}
