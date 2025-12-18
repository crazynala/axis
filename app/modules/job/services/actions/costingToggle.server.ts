import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";

export async function handleCostingToggle(opts: {
  jobId: number;
  assemblyId: number;
  intent: "costing.enable" | "costing.disable";
  form: FormData;
}) {
  const cid = Number(opts.form.get("id"));
  if (Number.isFinite(cid)) {
    const costing = await prisma.costing.findUnique({
      where: { id: cid },
      select: { flagDefinedInProduct: true },
    });
    if (costing) {
      if (opts.intent === "costing.enable") {
        await prisma.costing.update({
          where: { id: cid },
          data: { flagIsDisabled: false },
        });
      } else if (costing.flagDefinedInProduct) {
        await prisma.costing.update({
          where: { id: cid },
          data: { flagIsDisabled: true },
        });
      }
    }
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}

