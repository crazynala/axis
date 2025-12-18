import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";

export async function handleCostingDelete(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const cid = Number(opts.form.get("id"));
  if (Number.isFinite(cid)) {
    const costing = await prisma.costing.findUnique({
      where: { id: cid },
      select: { flagDefinedInProduct: true },
    });
    if (costing && !costing.flagDefinedInProduct) {
      await prisma.costing.delete({ where: { id: cid } });
    }
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}

