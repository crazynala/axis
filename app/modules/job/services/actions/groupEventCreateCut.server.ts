import { json, redirect } from "@remix-run/node";
import { createPooledCutEvent } from "~/modules/job/services/assemblyGroupEvents.server";

export async function handleGroupEventCreateCut(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const groupId = Number(opts.form.get("groupId"));
  const fabricProductId = Number(opts.form.get("fabricProductId"));
  const qtyMeters = Number(opts.form.get("qtyMeters"));
  const locationOutIdRaw = opts.form.get("locationOutId");
  const locationOutId = Number(locationOutIdRaw);
  const perAssemblyRaw = String(opts.form.get("perAssembly") || "[]");
  const eventDateStr = String(opts.form.get("eventDate") || "");
  let perAssembly: Array<{ assemblyId: number; qtyBreakdown: number[] }> = [];
  try {
    const parsed = JSON.parse(perAssemblyRaw);
    if (Array.isArray(parsed)) {
      perAssembly = parsed.map((row) => ({
        assemblyId: Number(row?.assemblyId),
        qtyBreakdown: Array.isArray(row?.qtyBreakdown)
          ? row.qtyBreakdown.map((n: any) => (Number.isFinite(Number(n)) ? Number(n) : 0))
          : [],
      }));
    }
  } catch {
    perAssembly = [];
  }
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return json({ error: "Group is required." }, { status: 400 });
  }
  if (!Number.isFinite(fabricProductId) || fabricProductId <= 0) {
    return json({ error: "Fabric product is required." }, { status: 400 });
  }
  if (!Number.isFinite(qtyMeters) || qtyMeters <= 0) {
    return json({ error: "Meters consumed must be greater than 0." }, { status: 400 });
  }
  if (!perAssembly.length) {
    return json({ error: "Per-assembly breakdowns are required." }, { status: 400 });
  }
  const eventDate = eventDateStr ? new Date(eventDateStr) : new Date();
  await createPooledCutEvent({
    assemblyGroupId: groupId,
    eventDate,
    fabricProductId,
    locationOutId: Number.isFinite(locationOutId) ? locationOutId : null,
    qtyMeters,
    perAssembly,
    notes: null,
    userId: null,
  });
  const returnTo = opts.form.get("returnTo");
  if (typeof returnTo === "string" && returnTo.startsWith("/")) {
    return redirect(returnTo);
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}

