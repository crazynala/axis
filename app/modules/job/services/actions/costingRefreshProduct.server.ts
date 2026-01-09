import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { mapExternalStepTypeToActivityUsed } from "~/modules/job/services/externalStepActivity";

export async function handleCostingRefreshProduct(opts: {
  jobId: number;
  assemblyId: number;
  form: FormData;
}) {
  const cid = Number(opts.form.get("id"));
  if (Number.isFinite(cid)) {
    const costing = await prisma.costing.findUnique({
      where: { id: cid },
      select: {
        id: true,
        assemblyId: true,
        productId: true,
        flagDefinedInProduct: true,
      },
    });
    if (costing?.flagDefinedInProduct && costing.productId) {
      const assembly = costing.assemblyId
        ? await prisma.assembly.findUnique({
            where: { id: costing.assemblyId },
            select: {
              id: true,
              product: {
                select: {
                  id: true,
                  primaryProductLineId: true,
                  productLines: {
                    select: {
                      id: true,
                      childId: true,
                      quantity: true,
                      unitCost: true,
                      unitCostManual: true,
                      activityUsed: true,
                    },
                  },
                },
              },
            },
          })
        : null;
      const parentLines = assembly?.product?.productLines || [];
      const matchedLine =
        parentLines.find((ln) => Number(ln.childId) === costing.productId) || null;
      const childProduct = await prisma.product.findUnique({
        where: { id: costing.productId },
        select: {
          id: true,
          costPrice: true,
          salePriceGroupId: true,
          manualSalePrice: true,
          manualMargin: true,
          externalStepType: true,
          leadTimeDays: true,
        },
      });
      const resolvedQuantity =
        matchedLine?.quantity != null
          ? Number(matchedLine.quantity)
          : (costing as any).quantityPerUnit;
      const resolvedUnitCost = (() => {
        if (matchedLine?.unitCost != null) return Number(matchedLine.unitCost);
        if (matchedLine?.unitCostManual != null) return Number(matchedLine.unitCostManual);
        return Number(childProduct?.costPrice ?? (costing as any).unitCost ?? 0);
      })();
      const resolvedActivity = matchedLine?.activityUsed
        ? String(matchedLine.activityUsed).toLowerCase()
        : ((costing as any).activityUsed ?? null);
      const finalActivity =
        childProduct?.externalStepType != null
          ? mapExternalStepTypeToActivityUsed(childProduct.externalStepType)
          : resolvedActivity;
      const updateData: any = {
        quantityPerUnit:
          resolvedQuantity == null || Number.isNaN(Number(resolvedQuantity))
            ? null
            : resolvedQuantity,
        unitCost:
          resolvedUnitCost == null || Number.isNaN(Number(resolvedUnitCost))
            ? null
            : resolvedUnitCost,
        activityUsed: finalActivity,
        salePriceGroupId: childProduct?.salePriceGroupId ?? null,
        manualSalePrice:
          childProduct?.manualSalePrice != null ? Number(childProduct.manualSalePrice) : null,
        manualMargin:
          childProduct?.manualMargin != null ? Number(childProduct.manualMargin) : null,
        externalStepType: childProduct?.externalStepType ?? null,
        leadTimeDays:
          childProduct?.leadTimeDays != null ? Number(childProduct.leadTimeDays) : null,
      };
      await prisma.costing.update({
        where: { id: cid },
        data: updateData,
      });
    }
  }
  return redirect(`/jobs/${opts.jobId}/assembly/${opts.assemblyId}`);
}
