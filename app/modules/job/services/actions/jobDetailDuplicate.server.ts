import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { createAssemblyFromProductAndSeedCostings } from "~/modules/job/services/assemblyFromProduct.server";

export async function handleJobDetailDuplicate(opts: { id: number }) {
  const original = await prisma.job.findUnique({
    where: { id: opts.id },
    include: { assemblies: true },
  });
  if (!original) return redirect("/jobs");
  const { assemblies, assemblyGroups, ...rest } = original as any;
  const data: any = { ...rest };
  delete data.id;
  delete data.createdAt;
  delete data.updatedAt;
  delete data.assemblies;
  delete data.assemblyGroups;
  data.projectCode = data.projectCode ? `${data.projectCode} - COPY` : "COPY";
  const newJob = await prisma.job.create({ data });
  for (const asm of assemblies || []) {
    const pid = asm.productId;
    if (!pid) continue;
    const newAsmId = await createAssemblyFromProductAndSeedCostings(newJob.id, pid);
    if (!newAsmId) continue;
    await prisma.assembly.update({
      where: { id: newAsmId },
      data: {
        name: asm.name,
        qtyOrderedBreakdown: (asm as any).qtyOrderedBreakdown ?? [],
        c_qtyOrdered: (asm as any).c_qtyOrdered ?? null,
        c_qtyCut: (asm as any).c_qtyCut ?? null,
        status: asm.status ?? null,
        statusWhiteboard: asm.statusWhiteboard ?? null,
        variantSetId: asm.variantSetId ?? null,
      },
    });
  }
  return redirect(`/jobs/${newJob.id}`);
}

