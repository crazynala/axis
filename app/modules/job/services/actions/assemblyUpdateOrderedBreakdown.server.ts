import { json, redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { parsePrimaryCostingId, parseStatusMap } from "../parsers/assemblyDetailFormParsers.server";
import { mapExternalStepTypeToActivityUsed } from "~/modules/job/services/externalStepActivity";
import { applyStatusUpdates } from "./applyStatusUpdates.server";

export async function handleAssemblyUpdateOrderedBreakdown(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const orderedStr = String(opts.form.get("orderedArr") || "[]");
  const qpuStr = String(opts.form.get("qpu") || "{}");
  const activityStr = String(opts.form.get("activity") || "{}");
  const primaryStr = String(opts.form.get("primaryCostingIds") || "{}");
  let ordered: number[] = [];
  let qpu: Record<string, number> = {};
  let activity: Record<string, string> = {};
  let primaryMap: Record<string, number> = {};
  try {
    const arr = JSON.parse(orderedStr);
    if (Array.isArray(arr))
      ordered = arr.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0));
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
  await prisma.assembly.update({
    where: { id: opts.assemblyId },
    data: { qtyOrderedBreakdown: ordered as any },
  });
  console.log("Updating QPU for costings:", qpu);
  const entries = Object.entries(qpu)
    .filter(([id, v]) => Number.isFinite(Number(id)) && Number.isFinite(Number(v)))
    .map(([id, v]) => [Number(id), Number(v)] as const);
  console.log("mapped calues", entries);
  for (const [cid, val] of entries) {
    await prisma.costing.update({
      where: { id: cid },
      data: { quantityPerUnit: val },
    });
  }
  console.log("Updating Activity Used for costings:", activity);
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
  if (Object.prototype.hasOwnProperty.call(primaryMap || {}, String(opts.assemblyId))) {
    const primaryVal = primaryMap?.[String(opts.assemblyId)];
    const primaryId = parsePrimaryCostingId(primaryVal);
    if (primaryId == null) {
      await prisma.assembly.update({
        where: { id: opts.assemblyId },
        data: { primaryCostingId: null },
      });
    } else {
      const exists = await prisma.costing.findFirst({
        where: { id: primaryId, assemblyId: opts.assemblyId },
        select: { id: true },
      });
      if (!exists) {
        return json(
          { error: `Primary costing ${primaryId} not found for assembly ${opts.assemblyId}.` },
          { status: 400 }
        );
      }
      await prisma.assembly.update({
        where: { id: opts.assemblyId },
        data: { primaryCostingId: primaryId },
      });
    }
  }
  await applyStatusUpdates({ jobId: opts.jobId, statusMap: parseStatusMap(opts.form.get("statuses")) });
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}
