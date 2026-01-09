import { json, redirect } from "@remix-run/node";
import { AssemblyStage, DefectDisposition } from "@prisma/client";
import { createDefectActivity } from "~/modules/job/services/defectActivity.server";
import { normalizeBreakdown } from "../parsers/assemblyDetailFormParsers.server";
import { validateDefectBreakdown } from "../validators/validateDefectBreakdown.server";

export async function handleActivityCreateDefect(opts: {
  jobId: number;
  rawAssemblyIdParam: string;
  assemblyId: number;
  form: FormData;
}) {
  const assemblyIdRaw = Number(opts.form.get("assemblyId") ?? opts.assemblyId);
  const targetAssemblyId = Number.isFinite(assemblyIdRaw) ? assemblyIdRaw : opts.assemblyId;
  const stageRaw = String(opts.form.get("stage") || "").toLowerCase();
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
  const qty = Number(opts.form.get("quantity"));
  const qtyBreakdownRaw = opts.form.get("qtyBreakdown");
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
  const defectReasonVal = Number(opts.form.get("defectReasonId"));
  const defectReasonId = Number.isFinite(defectReasonVal) && defectReasonVal > 0 ? defectReasonVal : null;
  const dispositionRaw = String(opts.form.get("defectDisposition") || "review");
  const disposition = (
    ["review", "scrap", "offSpec", "sample", "none"] as DefectDisposition[]
  ).includes(dispositionRaw as DefectDisposition)
    ? (dispositionRaw as DefectDisposition)
    : DefectDisposition.review;
  const notes = opts.form.get("notes");
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
    try {
      await createDefectActivity({
        assemblyId: targetAssemblyId,
        jobId: opts.jobId,
        activityDate: new Date(),
        stage: stageEnum,
        quantity: qty,
        qtyBreakdown,
        defectReasonId: defectReasonId ?? undefined,
        defectDisposition: disposition,
        notes: typeof notes === "string" ? notes : undefined,
      });
    } catch (err: any) {
      const message =
        err?.message ||
        "Unable to record defect due to missing stock locations.";
      return json({ error: message }, { status: 400 });
    }
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.rawAssemblyIdParam}`);
}
