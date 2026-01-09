import { redirect } from "@remix-run/node";
import { AssemblyStage } from "@prisma/client";
import { createFinishActivity } from "~/utils/activity.server";
import {
  createReconcileActivity,
  validateReconcileBreakdown,
} from "~/modules/job/services/reconcileStage.server";

export async function handleActivityCreateFinish(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const qtyArrStr = String(opts.form.get("qtyBreakdown") || "[]");
  const activityDateStr = String(opts.form.get("activityDate") || "");
  const activityMode = String(opts.form.get("activityMode") || "record");
  let qtyArr: number[] = [];
  try {
    const arr = JSON.parse(qtyArrStr);
    if (Array.isArray(arr))
      qtyArr = arr.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0));
  } catch {}
  const activityDate = activityDateStr ? new Date(activityDateStr) : new Date();
  console.log("[assembly.activity] create.finish", {
    jobId: opts.jobId,
    assemblyId: opts.assemblyId,
    activityDate: activityDate.toISOString(),
    qtyBreakdownLen: qtyArr.length,
    activityMode,
  });
  if (activityMode === "reconcile") {
    const error = await validateReconcileBreakdown({
      assemblyId: opts.assemblyId,
      stage: AssemblyStage.finish,
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
      stage: AssemblyStage.finish,
      qtyBreakdown: qtyArr,
      activityDate,
      defectDisposition: defectDisposition.length ? defectDisposition : null,
      defectReasonId: defectReasonId.length ? Number(defectReasonId) : null,
      notes: notes.length ? notes : null,
    });
    return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
  }
  await createFinishActivity({
    assemblyId: opts.assemblyId,
    jobId: opts.jobId,
    activityDate,
    qtyBreakdown: qtyArr,
    notes: null,
    groupKey: null,
  });
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}
