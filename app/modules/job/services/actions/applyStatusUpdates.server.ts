import { prisma } from "~/utils/prisma.server";
import { syncJobStateFromAssemblies } from "~/modules/job/services/JobStateService";
import { normalizeAssemblyState } from "~/modules/job/stateUtils";

export async function applyStatusUpdates(opts: {
  jobId: number;
  statusMap: Map<number, string>;
}): Promise<boolean> {
  if (!opts.statusMap.size) return false;
  const targetIds = Array.from(opts.statusMap.keys());
  const assemblies = await prisma.assembly.findMany({
    where: { id: { in: targetIds }, jobId: opts.jobId },
    select: { id: true, status: true },
  });
  const updates = assemblies
    .map((asm) => {
      const next = opts.statusMap.get(asm.id);
      const current = normalizeAssemblyState(asm.status as string | null);
      if (!next || next === current) return null;
      return { id: asm.id, status: next };
    })
    .filter(Boolean) as Array<{ id: number; status: string }>;
  for (const update of updates) {
    await prisma.assembly.update({
      where: { id: update.id },
      data: { status: update.status },
    });
  }
  if (updates.length) {
    await syncJobStateFromAssemblies(prisma, opts.jobId);
    return true;
  }
  return false;
}

