import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";

export async function handleJobAssemblyDelete(opts: { id: number; form: FormData }) {
  const asmId = Number(opts.form.get("assemblyId"));
  if (Number.isFinite(asmId)) {
    const actCount = await prisma.assemblyActivity.count({
      where: { assemblyId: asmId },
    });
    if (actCount > 0) {
      return redirect(`/jobs/${opts.id}?asmDeleteErr=hasActivity&asmId=${asmId}`);
    }
    const asm = await prisma.assembly.findUnique({
      where: { id: asmId },
      select: { assemblyGroupId: true },
    });
    await prisma.assembly.delete({ where: { id: asmId } });
    if (asm?.assemblyGroupId) {
      const remaining = await prisma.assembly.count({
        where: { assemblyGroupId: asm.assemblyGroupId },
      });
      if (remaining < 2) {
        await prisma.assembly.updateMany({
          where: { assemblyGroupId: asm.assemblyGroupId },
          data: { assemblyGroupId: null },
        });
        await prisma.assemblyGroup.delete({
          where: { id: asm.assemblyGroupId },
        });
      }
    }
  }
  return redirect(`/jobs/${opts.id}`);
}

