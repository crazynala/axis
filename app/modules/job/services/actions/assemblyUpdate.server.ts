import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { syncJobStateFromAssemblies } from "~/modules/job/services/JobStateService";
import { normalizeAssemblyState } from "~/modules/job/stateUtils";

export async function handleAssemblyUpdate(opts: {
  jobId: number;
  rawAssemblyIdParam: string;
  fallbackAssemblyId: number;
  form: FormData;
}) {
  const overrideId = Number(opts.form.get("assemblyId"));
  const targetAssemblyId = Number.isFinite(overrideId) ? overrideId : opts.fallbackAssemblyId;
  const data: any = {};
  if (opts.form.has("name")) {
    data.name = ((opts.form.get("name") as string) || "").trim() || null;
  }
  let statusChanged = false;
  if (opts.form.has("assemblyType")) {
    const typeVal = String(opts.form.get("assemblyType") ?? "").trim();
    data.assemblyType = typeVal || "Prod";
  }
  if (opts.form.has("status")) {
    const statusVal = normalizeAssemblyState(String(opts.form.get("status") ?? "").trim());
    data.status = statusVal || null;
    statusChanged = true;
  }
  if (opts.form.has("statusWhiteboard")) {
    const noteVal = String(opts.form.get("statusWhiteboard") ?? "");
    data.statusWhiteboard = noteVal || null;
  }
  if (Object.keys(data).length) {
    await prisma.assembly.update({ where: { id: targetAssemblyId }, data });
    if (statusChanged) {
      await syncJobStateFromAssemblies(prisma, opts.jobId);
    }
  }
  const returnTo = opts.form.get("returnTo");
  if (typeof returnTo === "string" && returnTo.startsWith("/")) {
    return redirect(returnTo);
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.rawAssemblyIdParam}`);
}

