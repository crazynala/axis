import { json, redirect } from "@remix-run/node";
import { createRetainActivity } from "~/modules/job/services/retainActivity.server";

export async function handleActivityCreateRetain(opts: {
  request: Request;
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const accept = opts.request.headers.get("Accept") || "";
  const isFetch =
    opts.request.headers.get("X-Remix-Fetch") === "true" ||
    opts.request.headers.get("x-remix-fetch") === "true" ||
    accept.includes("application/json") ||
    accept.includes("text/vnd.turbo-stream");
  const assemblyId = Number(opts.form.get("assemblyId") ?? opts.assemblyId);
  if (!Number.isFinite(assemblyId)) {
    const error = "Missing assembly id for retain.";
    return json({ error }, { status: 400 });
  }
  const activityDateRaw = String(opts.form.get("activityDate") || "");
  const activityDate = activityDateRaw ? new Date(activityDateRaw) : new Date();
  const breakdownRaw = String(opts.form.get("qtyBreakdown") || "[]");
  let breakdown: number[] = [];
  try {
    const parsed = JSON.parse(breakdownRaw);
    if (Array.isArray(parsed)) {
      breakdown = parsed.map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0));
    }
  } catch {
    breakdown = [];
  }
  const total = breakdown.reduce((sum, n) => sum + (Number(n) || 0), 0);
  if (!total || total <= 0) {
    const error = "Retain quantity must be greater than zero.";
    return json({ error }, { status: 400 });
  }
  const notes = String(opts.form.get("notes") || "").trim();
  try {
    await createRetainActivity({
      assemblyId,
      jobId: opts.jobId,
      activityDate,
      qtyBreakdown: breakdown,
      quantity: total,
      notes: notes.length ? notes : null,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message ? err.message : "Unable to record retain.";
    return json({ error: message }, { status: 400 });
  }
  if (isFetch) return json({ success: true });
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}
