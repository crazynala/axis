import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { syncJobStateFromAssemblies } from "~/modules/job/services/JobStateService";
import { normalizeAssemblyState } from "~/modules/job/stateUtils";

export async function handleAssemblyGroupState(opts: {
  jobId: number;
  rawAssemblyIdParam: string;
  form: FormData;
}) {
  const idsRaw = String(opts.form.get("assemblyIds") || "");
  const ids = idsRaw
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const affectedIds = Array.from(new Set(ids));
  if (affectedIds.length) {
    const data: any = {};
    let statusChanged = false;
    if (opts.form.has("status")) {
      const statusVal = normalizeAssemblyState(String(opts.form.get("status") ?? "").trim());
      if (statusVal) {
        data.status = statusVal;
        statusChanged = true;
      }
    }
    if (opts.form.has("statusWhiteboard")) {
      const noteVal = String(opts.form.get("statusWhiteboard") ?? "");
      data.statusWhiteboard = noteVal || null;
    }
    if (Object.keys(data).length) {
      await prisma.assembly.updateMany({
        where: { id: { in: affectedIds }, jobId: opts.jobId },
        data,
      });
      if (statusChanged) {
        await syncJobStateFromAssemblies(prisma, opts.jobId);
      }
    }
  }
  const returnTo = opts.form.get("returnTo");
  if (typeof returnTo === "string" && returnTo.startsWith("/")) {
    return redirect(returnTo);
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.rawAssemblyIdParam}`);
}

