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
      leadTimeDays: true,
      customer: { select: { stockLocationId: true } },
      costGroup: {
        select: {
          costRanges: { select: { rangeFrom: true, costPrice: true } },
        },
      },
      purchaseTax: { select: { value: true } },
    },
  });
  const { getProductStockSnapshots } = await import("~/utils/prisma.server");
  const snapshots = (await getProductStockSnapshots(ids)) as
    | Array<{
        productId: number;
        totalQty: number;
        byLocation: Array<{
          locationId: number | null;
          locationName: string;
          qty: number;
        }>;
      }>
    | null;
  const snapMap = new Map<number, any>();
  if (Array.isArray(snapshots)) {
    for (const s of snapshots) {
      snapMap.set(s.productId, s);
    }
  }
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
    const snap = snapMap.get(r.id);
    if (snap) {
      enrichedRow.c_stockQty = snap.totalQty ?? 0;
      enrichedRow.c_byLocation = (snap.byLocation || []).map((loc: any) => ({
        location_id: loc.locationId ?? loc.location_id ?? null,
        location_name: loc.locationName ?? loc.location_name ?? "",
        qty: loc.qty ?? 0,
      }));
    }
    enrichedRow.customer = r.customer;
    return enrichedRow;
  });
  // console.log("Enriched rows:", enrichedRows);
  return enrichedRows;
}
