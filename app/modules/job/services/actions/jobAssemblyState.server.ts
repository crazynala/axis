import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { syncJobStateFromAssemblies } from "~/modules/job/services/JobStateService";
import { normalizeAssemblyState } from "~/modules/job/stateUtils";

export async function handleJobAssemblyState(opts: { id: number; form: FormData }) {
  const asmId = Number(opts.form.get("assemblyId"));
  if (Number.isFinite(asmId)) {
    const statusValue = normalizeAssemblyState(String(opts.form.get("status") ?? "").trim());
    const data: any = {};
    if (statusValue) data.status = statusValue;
    if (opts.form.has("statusWhiteboard")) {
      const note = String(opts.form.get("statusWhiteboard") ?? "");
      data.statusWhiteboard = note || null;
    }
    if (Object.keys(data).length) {
      await prisma.assembly.update({ where: { id: asmId }, data });
      await syncJobStateFromAssemblies(prisma, opts.id);
    }
  }
  return redirect(`/jobs/${opts.id}`);
}

