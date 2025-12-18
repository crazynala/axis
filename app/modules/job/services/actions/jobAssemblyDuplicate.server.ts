import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { duplicateAssembly } from "~/modules/job/services/duplicateAssembly.server";

export async function handleJobAssemblyDuplicate(opts: { id: number; form: FormData }) {
  const asmId = Number(opts.form.get("assemblyId"));
  if (Number.isFinite(asmId)) {
    const newAsmId = await duplicateAssembly(prisma, opts.id, asmId);
    if (newAsmId) {
      console.log("[jobs.$id] Duplicated assembly", {
        jobId: opts.id,
        sourceAssemblyId: asmId,
        newAssemblyId: newAsmId,
      });
    }
  }
  return redirect(`/jobs/${opts.id}`);
}

