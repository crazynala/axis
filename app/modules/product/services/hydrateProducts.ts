import { prismaBase } from "~/utils/prisma.server";
import { calcPrice } from "../calc/calcPrice";

// Minimal shape both routes select for table hydration
export type ProductRowBase = {
  id: number;
  sku: string | null;
  name: string | null;
  type: any;
  costPrice: any;
  manualSalePrice: any;
  stockTrackingEnabled: boolean | null;
  batchTrackingEnabled: boolean | null;
};

export async function fetchAndHydrateProductsByIds(ids: number[]) {
  if (!ids.length) return [];
  const baseRows = await prismaBase.product.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      type: true,
      costPrice: true,
      manualSalePrice: true,
      stockTrackingEnabled: true,
      batchTrackingEnabled: true,
      costGroup: {
        select: {
          costRanges: { select: { rangeFrom: true, costPrice: true } },
        },
      },
      purchaseTax: { select: { value: true } },
    },
  });
  const enrichedRows = baseRows.map((r) => {
    let enrichedRow: any = {};
    const priceTiers =
      r.costGroup?.costRanges
        ?.map((t) => ({
          minQty: Number(t.rangeFrom ?? 0) || 0,
          priceCost: Number(t.costPrice ?? 0) || 0,
        }))
        .filter(
          (t) => Number.isFinite(t.minQty) && Number.isFinite(t.priceCost)
        ) || [];
    if (r.manualSalePrice) {
      enrichedRow = {
        ...r,
        c_sellPrice: r.manualSalePrice,
        c_isSellPriceManual: true,
      };
    } else {
      const sellPrice = calcPrice({
        baseCost: Number(r.costPrice ?? 0) || 0,
        tiers: priceTiers,
        taxRate: Number(r.purchaseTax?.value ?? 0) || 0,
      });
      enrichedRow = { ...r, c_sellPrice: sellPrice.unitSellPrice };
    }
    if (priceTiers.length) {
      // console.log("Has price tiers:", r.id, priceTiers);
      enrichedRow.c_hasPriceTiers = true;
    }
    return enrichedRow;
  });
  // console.log("Enriched rows:", enrichedRows);
  return enrichedRows;
}
