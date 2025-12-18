import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";

export async function handleCostingCreate(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const compRaw = opts.form.get("productId") ?? opts.form.get("componentId");
  const compNum = compRaw == null || compRaw === "" ? null : Number(compRaw);
  const productId = Number.isFinite(compNum as any) ? (compNum as number) : null;
  const quantityPerUnit = opts.form.get("quantityPerUnit")
    ? Number(opts.form.get("quantityPerUnit"))
    : null;
  let unitCost = opts.form.get("unitCost") ? Number(opts.form.get("unitCost")) : null;
  const notes = (opts.form.get("notes") as string) || null;
  if ((unitCost == null || Number.isNaN(unitCost)) && productId) {
    const p = await prisma.product.findUnique({
      where: { id: productId },
      select: { costPrice: true },
    });
    unitCost = Number(p?.costPrice ?? 0) || 0;
  }
  await prisma.costing.create({
    data: {
      assemblyId: opts.assemblyId,
      productId: productId ?? undefined,
      quantityPerUnit,
      unitCost,
      notes,
    },
  });
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}

