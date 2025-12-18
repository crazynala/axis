import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";

export async function handleJobDetailDelete(opts: { id: number; form: FormData }) {
  const confirmText = String(opts.form.get("confirm") ?? "");
  const phrase = "THIS IS SO DANGEROUS. CALL ME CRAZY.";
  if (confirmText !== phrase) {
    return redirect(`/jobs/${opts.id}?deleteError=confirm`);
  }
  const assemblies = await prisma.assembly.findMany({
    where: { jobId: opts.id },
    select: { id: true },
  });
  const asmIds = assemblies.map((a) => a.id);
  if (asmIds.length) {
    const activityCount = await prisma.assemblyActivity.count({
      where: { assemblyId: { in: asmIds } },
    });
    if (activityCount > 0) {
      return redirect(`/jobs/${opts.id}?deleteError=activity`);
    }
    await prisma.purchaseOrderLine.updateMany({
      where: { assemblyId: { in: asmIds } },
      data: { assemblyId: null },
    });
    await prisma.shipmentLine.updateMany({
      where: { assemblyId: { in: asmIds } },
      data: { assemblyId: null },
    });
    await prisma.boxLine.updateMany({
      where: { assemblyId: { in: asmIds } },
      data: { assemblyId: null },
    });
    await prisma.costing.updateMany({
      where: { assemblyId: { in: asmIds } },
      data: { assemblyId: null },
    });
    await prisma.assembly.deleteMany({ where: { id: { in: asmIds } } });
  }
  await prisma.job.delete({ where: { id: opts.id } });
  return redirect("/jobs");
}

