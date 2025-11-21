import type { PrismaClient } from "@prisma/client";
import { normalizeAssemblyState } from "~/modules/job/stateUtils";

export async function duplicateAssembly(
  prisma: PrismaClient,
  jobId: number,
  sourceAssemblyId: number
): Promise<number | null> {
  if (!Number.isFinite(jobId) || !Number.isFinite(sourceAssemblyId)) {
    return null;
  }
  const source = await prisma.assembly.findFirst({
    where: { id: sourceAssemblyId, jobId },
    include: { costings: true },
  });
  if (!source) return null;

  const qtyOrderedBreakdown = Array.isArray(source.qtyOrderedBreakdown)
    ? [...source.qtyOrderedBreakdown]
    : [];
  const cloneData: any = {
    name: source.name ? `${source.name} Copy` : `Assembly ${source.id} Copy`,
    status: "DRAFT",
    quantity: source.quantity,
    qtyOrderedBreakdown,
    notes: source.notes,
    statusWhiteboard: source.statusWhiteboard,
    jobId,
    productId: source.productId,
    variantSetId: source.variantSetId,
  };
  const created = await prisma.assembly.create({ data: cloneData });

  if (Array.isArray(source.costings) && source.costings.length) {
    await prisma.costing.createMany({
      data: source.costings.map((costing) => ({
        assemblyId: created.id,
        productId: costing.productId,
        quantityPerUnit: costing.quantityPerUnit,
        unitCost: costing.unitCost,
        notes: costing.notes,
        activityUsed: costing.activityUsed,
        costPricePerItem: costing.costPricePerItem,
        salePricePerItem: costing.salePricePerItem,
        salePriceGroupId: costing.salePriceGroupId,
        manualSalePrice: costing.manualSalePrice,
        manualMargin: costing.manualMargin,
        flagAssembly: costing.flagAssembly,
        flagDefinedInProduct: costing.flagDefinedInProduct,
        flagIsBillableDefaultOrManual: costing.flagIsBillableDefaultOrManual,
        flagIsBillableManual: costing.flagIsBillableManual,
        flagIsInvoiceableManual: costing.flagIsInvoiceableManual,
      })),
    });
  }

  return created.id;
}
