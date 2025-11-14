import { prisma } from "~/utils/prisma.server";

/**
 * Create an Assembly from a source Product and seed Costings from its BOM (productLines).
 * Also carries dynamic pricing context (salePriceGroupId, manualSalePrice, manualMargin) to Costing.
 *
 * Inputs:
 * - jobId: target Job id to attach the new Assembly
 * - productId: source Product id to clone name/variantSet and BOM lines from
 *
 * Returns: created Assembly id
 */
export async function createAssemblyFromProductAndSeedCostings(
  jobId: number,
  productId: number
): Promise<number | null> {
  if (!Number.isFinite(jobId) || !Number.isFinite(productId)) return null;

  const prod = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      variantSetId: true,
      variantSet: { select: { variants: true } },
      productLines: {
        include: {
          child: {
            select: {
              id: true,
              sku: true,
              name: true,
              costPrice: true,
              defaultCostQty: true,
              salePriceGroupId: true,
              manualSalePrice: true,
              manualMargin: true,
            },
          },
        },
      },
    },
  });
  if (!prod) return null;

  const vsLen = prod.variantSet?.variants?.length || 0;
  const ordered: number[] =
    vsLen > 0 ? Array.from({ length: vsLen }, () => 0) : [];
  const asmData: any = {
    name: prod.name || `Assembly ${productId}`,
    productId: prod.id,
    jobId,
    qtyOrderedBreakdown: ordered as any,
    status: "new",
  };
  if (prod.variantSetId != null) asmData.variantSetId = prod.variantSetId;

  const created = await prisma.assembly.create({ data: asmData });

  const lines = (prod as any).productLines || [];
  if (Array.isArray(lines) && lines.length) {
    const payloads = lines
      .filter((ln: any) => ln?.child?.id != null)
      .map((ln: any) => {
        const child = ln.child;
        const qty = Number(ln.quantity ?? 1) || 1;
        const unitCost = Number(ln.unitCost ?? child.costPrice ?? 0) || 0;
        const act = String(ln.activityUsed || "").toLowerCase();
        return {
          assemblyId: created.id,
          productId: child.id,
          quantityPerUnit: qty,
          unitCost,
          activityUsed: act ? act : null,
          salePriceGroupId: child.salePriceGroupId ?? null,
          manualSalePrice: child.manualSalePrice ?? null,
          manualMargin: child.manualMargin ?? null,
          notes: null as string | null,
          flagDefinedInProduct: true,
        } as any;
      });
    if (payloads.length) {
      const res = await prisma.costing.createMany({ data: payloads });
      console.log("[assemblyFromProduct] Seeded costings", {
        assemblyId: created.id,
        productId: prod.id,
        lineCount: lines.length,
        payloadCount: payloads.length,
        createdCount: res.count,
      });
    }
  } else {
    console.log("[assemblyFromProduct] No productLines to seed", {
      productId: prod.id,
      variantSetId: prod.variantSetId,
    });
  }

  return created.id;
}
