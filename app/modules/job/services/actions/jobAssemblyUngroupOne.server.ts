import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";

export async function handleJobAssemblyUngroupOne(opts: { id: number; form: FormData }) {
  const asmId = Number(opts.form.get("assemblyId"));
  if (Number.isFinite(asmId)) {
    await prisma.assembly.update({
      where: { id: asmId },
      data: { assemblyGroupId: null },
    });
  }
  return redirect(`/jobs/${opts.id}`);
}

