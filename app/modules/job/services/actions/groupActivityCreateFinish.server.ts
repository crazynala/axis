import { redirect } from "@remix-run/node";
import { createFinishActivity } from "~/utils/activity.server";

export async function handleGroupActivityCreateFinish(opts: {
  jobId: number;
  rawAssemblyIdParam: string;
  idList: number[];
  form: FormData;
}) {
  const idsRaw = String(opts.form.get("assemblyIds") || "");
  const ids = idsRaw
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const targetAssemblyIds = (ids.length ? ids : opts.idList).filter((id) =>
    opts.idList.includes(id)
  );
  if (!targetAssemblyIds.length) {
    throw new Response("No assemblies specified", { status: 400 });
  }
  const activityDateStr = String(opts.form.get("activityDate") || "");
  const activityDate = activityDateStr ? new Date(activityDateStr) : new Date();
  const groupQtyStr = String(opts.form.get("groupQty") || "[]");
  const qtyByAssembly = new Map<number, number[]>();
  try {
    const parsed = JSON.parse(groupQtyStr);
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        const aid = Number(entry?.assemblyId);
        if (!Number.isFinite(aid)) continue;
        const breakdown = Array.isArray(entry?.qtyBreakdown)
          ? entry.qtyBreakdown.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) : 0))
          : [];
        qtyByAssembly.set(aid, breakdown);
      }
    }
  } catch {
    // ignore malformed payloads; fallback to empty breakdowns
  }
  console.log("[assembly.activity] group.create.finish", {
    jobId: opts.jobId,
    assemblyIds: targetAssemblyIds,
    activityDate: activityDate.toISOString(),
  });
  const groupKey = `make-${opts.jobId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  for (let index = 0; index < targetAssemblyIds.length; index++) {
    const targetId = targetAssemblyIds[index];
    const qtyBreakdown = qtyByAssembly.get(targetId) || [];
    await createFinishActivity({
      assemblyId: targetId,
      jobId: opts.jobId,
      activityDate,
      qtyBreakdown,
      notes: null,
      groupKey,
      refreshStockSnapshot: index === targetAssemblyIds.length - 1,
    });
  }
  const returnTo = opts.form.get("returnTo");
  if (typeof returnTo === "string" && returnTo.startsWith("/")) {
    return redirect(returnTo);
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.rawAssemblyIdParam}`);
}

