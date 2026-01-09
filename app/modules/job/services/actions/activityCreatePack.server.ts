import { json, redirect } from "@remix-run/node";
import { createPackActivity } from "~/modules/job/services/boxPacking.server";

export async function handleActivityCreatePack(opts: {
  request: Request;
  jobId: number;
  rawAssemblyIdParam: string;
  assemblyId: number;
  form: FormData;
}) {
  const isFetch = opts.request.headers.get("X-Remix-Fetch") === "true";
  const qtyArrStr = String(opts.form.get("qtyBreakdown") || "[]");
  const activityDateStr = String(opts.form.get("activityDate") || "");
  let qtyArr: number[] = [];
  try {
    const arr = JSON.parse(qtyArrStr);
    if (Array.isArray(arr))
      qtyArr = arr.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) | 0 : 0));
  } catch {}
  const activityDate = activityDateStr ? new Date(activityDateStr) : new Date();
  const overrideAssemblyId = Number(opts.form.get("assemblyId"));
  const targetAssemblyId = Number.isFinite(overrideAssemblyId) ? overrideAssemblyId : opts.assemblyId;
  const rawBoxMode = String(opts.form.get("boxMode") || "new").toLowerCase();
  const boxMode = rawBoxMode === "existing" ? "existing" : "new";
  const existingBoxIdStr = opts.form.get("existingBoxId");
  const warehouseNumberStr = opts.form.get("warehouseNumber");
  const parsedWarehouse = (() => {
    if (!warehouseNumberStr) return null;
    const value = Number(String(warehouseNumberStr).trim());
    return Number.isFinite(value) ? value : null;
  })();
  const boxDescription = (opts.form.get("boxDescription") as string) || null;
  const boxNotes = (opts.form.get("boxNotes") as string) || null;
  const allowOverpack = String(opts.form.get("allowOverpack") || "") === "1";
  const createShortfall = String(opts.form.get("createShortfall") || "") === "1";
  try {
    await createPackActivity({
      assemblyId: targetAssemblyId,
      jobId: opts.jobId,
      qtyBreakdown: qtyArr,
      activityDate,
      boxMode,
      existingBoxId: existingBoxIdStr ? Number(String(existingBoxIdStr)) : null,
      warehouseNumber: parsedWarehouse,
      boxDescription,
      boxNotes,
      allowOverpack,
      createShortfall,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message ? err.message : "Unable to record pack.";
    if (isFetch) {
      return json({ error: message }, { status: 400 });
    }
    throw err;
  }
  if (isFetch) {
    return json({ success: true });
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.rawAssemblyIdParam}`);
}
