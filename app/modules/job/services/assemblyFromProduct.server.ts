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
      primaryProductLineId: true,
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
    status: "DRAFT",
  };
  if (prod.variantSetId != null) asmData.variantSetId = prod.variantSetId;

  const created = await prisma.assembly.create({ data: asmData });

  const lines = (prod as any).productLines || [];
  console.log("[assemblyFromProduct] Product loaded", {
    productId: prod.id,
    name: prod.name,
    hasLines: Array.isArray(lines),
    linesCount: lines.length,
    lines: lines.map((l: any) => ({
      id: l.id,
      quantity: l.quantity,
      childId: l.child?.id,
      childName: l.child?.name,
      activityUsed: l.activityUsed,
    })),
  });

  if (Array.isArray(lines) && lines.length) {
    const filtered = lines.filter((ln: any) => ln?.child?.id != null);
    console.log("[assemblyFromProduct] Filtered lines", {
      originalCount: lines.length,
      filteredCount: filtered.length,
      filtered: filtered.map((l: any) => ({ id: l.id, childId: l.child.id })),
    });

    const payloads = filtered.map((ln: any) => {
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
      console.log("[assemblyFromProduct] Creating costings", {
        assemblyId: created.id,
        payloads: payloads.map((p) => ({
          productId: p.productId,
          quantityPerUnit: p.quantityPerUnit,
          unitCost: p.unitCost,
          activityUsed: p.activityUsed,
        })),
      });
      let primaryCostingId: number | null = null;
      for (let idx = 0; idx < filtered.length; idx++) {
        const pl = filtered[idx];
        const payload = payloads[idx];
        const createdCosting = await prisma.costing.create({ data: payload });
        if (
          primaryCostingId == null &&
          prod.primaryProductLineId != null &&
          pl.id === prod.primaryProductLineId
        ) {
          primaryCostingId = createdCosting.id;
        }
      }
      if (primaryCostingId != null) {
        await prisma.assembly.update({
          where: { id: created.id },
          data: { primaryCostingId },
        });
      }
      console.log("[assemblyFromProduct] Seeded costings", {
        assemblyId: created.id,
        productId: prod.id,
        lineCount: lines.length,
        payloadCount: payloads.length,
      });
    } else {
      console.log("[assemblyFromProduct] No valid payloads to create");
    }
  } else {
    console.log("[assemblyFromProduct] No productLines to seed", {
      productId: prod.id,
      variantSetId: prod.variantSetId,
      linesType: typeof lines,
      linesLength: Array.isArray(lines) ? lines.length : "not array",
    });
  }

  return created.id;
}
