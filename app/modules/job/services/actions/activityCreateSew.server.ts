import { redirect } from "@remix-run/node";
import { createSewActivity } from "~/utils/activity.server";

export async function handleActivityCreateSew(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const qtyArrStr = String(opts.form.get("qtyBreakdown") || "[]");
  const activityDateStr = String(opts.form.get("activityDate") || "");
  let qtyArr: number[] = [];
  try {
    const arr = JSON.parse(qtyArrStr);
    if (Array.isArray(arr))
      qtyArr = arr.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0));
  } catch {}
  const activityDate = activityDateStr ? new Date(activityDateStr) : new Date();
  console.log("[assembly.activity] create.sew", {
    jobId: opts.jobId,
    assemblyId: opts.assemblyId,
    activityDate: activityDate.toISOString(),
    qtyBreakdownLen: qtyArr.length,
  });
  await createSewActivity({
    assemblyId: opts.assemblyId,
    jobId: opts.jobId,
    activityDate,
    qtyBreakdown: qtyArr,
    notes: null,
    groupKey: null,
  });
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}
