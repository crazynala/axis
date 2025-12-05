import { prisma } from "~/utils/prisma.server";

export type PendingCostingItem = {
  sourceType: "costing";
  costingId: number;
  jobId: number;
  assemblyId: number;
  jobProjectCode?: string | null;
  description: string;
  maxQuantity: string;
  alreadyInvoicedQty: string;
  defaultQuantity: string;
  defaultUnitPrice: string | null;
};

export async function getCostingsPendingInvoicing(
  customerId: number | null | undefined
): Promise<PendingCostingItem[]> {
  if (!customerId) return [];
  const costings = await prisma.costing.findMany({
    where: {
      assembly: { job: { companyId: customerId } },
    },
    include: {
      assembly: {
        select: {
          id: true,
          name: true,
          quantity: true,
          jobId: true,
          job: { select: { projectCode: true } },
        },
      },
    },
  });

  const results: PendingCostingItem[] = [];
  for (const costing of costings) {
    const assemblyUnits = Number(costing.assembly?.quantity ?? 0) || 0;
    if (!assemblyUnits) continue;
    const invoiced = await prisma.invoiceLine.aggregate({
      where: { costingId: costing.id },
      _sum: { quantity: true },
    });
    const unitsInvoiced = Number(invoiced._sum.quantity ?? 0) || 0;
    const unitsPending = assemblyUnits - unitsInvoiced;
    if (unitsPending <= 0) continue;
    const unitPriceSuggestion =
      costing.manualSalePrice ?? costing.salePricePerItem ?? null;
    results.push({
      sourceType: "costing",
      costingId: costing.id,
      jobId: costing.assembly?.jobId ?? 0,
      assemblyId: costing.assembly?.id ?? 0,
      jobProjectCode: costing.assembly?.job?.projectCode ?? null,
      description:
        costing.assembly?.name ||
        (costing.assembly?.id ? `Assembly ${costing.assembly.id}` : "Assembly"),
      maxQuantity: unitsPending.toString(),
      alreadyInvoicedQty: unitsInvoiced.toString(),
      defaultQuantity: unitsPending.toString(),
      defaultUnitPrice: unitPriceSuggestion
        ? unitPriceSuggestion.toString()
        : null,
    });
  }
  return results;
}
