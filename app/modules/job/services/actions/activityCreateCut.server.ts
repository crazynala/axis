import { redirect } from "@remix-run/node";
import { createCutActivity } from "~/utils/activity.server";

export async function handleActivityCreateCut(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const qtyArrStr = String(opts.form.get("qtyBreakdown") || "[]");
  const activityDateStr = String(opts.form.get("activityDate") || "");
  const consumptionsStr = String(opts.form.get("consumptions") || "[]");
  let qtyArr: number[] = [];
  let consumptions: any[] = [];
  try {
    const arr = JSON.parse(qtyArrStr);
    if (Array.isArray(arr))
      qtyArr = arr.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0));
  } catch {}
  try {
    const c = JSON.parse(consumptionsStr);
    if (Array.isArray(c)) consumptions = c;
  } catch {}
  const activityDate = activityDateStr ? new Date(activityDateStr) : new Date();
  console.log("[assembly.activity] create.cut", {
    jobId: opts.jobId,
    assemblyId: opts.assemblyId,
    activityDate: activityDate.toISOString(),
    qtyBreakdownLen: qtyArr.length,
    consumptionsCount: consumptions.length,
  });
  await createCutActivity({
    assemblyId: opts.assemblyId,
    jobId: opts.jobId,
    activityDate,
    qtyBreakdown: qtyArr,
    consumptions,
    notes: null,
  });
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}

