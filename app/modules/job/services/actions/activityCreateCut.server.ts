import { redirect } from "@remix-run/node";
import { AssemblyStage } from "@prisma/client";
import { createCutActivity } from "~/utils/activity.server";
import {
  createReconcileActivity,
  validateReconcileBreakdown,
} from "~/modules/job/services/reconcileStage.server";

export async function handleActivityCreateCut(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const qtyArrStr = String(opts.form.get("qtyBreakdown") || "[]");
  const activityDateStr = String(opts.form.get("activityDate") || "");
  const consumptionsStr = String(opts.form.get("consumptions") || "[]");
  const activityMode = String(opts.form.get("activityMode") || "record");
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
    activityMode,
  });
  if (activityMode === "reconcile") {
    const error = await validateReconcileBreakdown({
      assemblyId: opts.assemblyId,
      stage: AssemblyStage.cut,
      breakdown: qtyArr,
    });
    if (error) {
      throw new Error(error);
    }
    const defectDisposition = String(opts.form.get("defectDisposition") || "");
    const defectReasonId = String(opts.form.get("defectReasonId") || "");
    const notes = String(opts.form.get("notes") || "");
    await createReconcileActivity({
      assemblyId: opts.assemblyId,
      jobId: opts.jobId,
      stage: AssemblyStage.cut,
      qtyBreakdown: qtyArr,
      activityDate,
      defectDisposition: defectDisposition.length ? defectDisposition : null,
      defectReasonId: defectReasonId.length ? Number(defectReasonId) : null,
      notes: notes.length ? notes : null,
    });
    return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
  }
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
