import { prismaBase } from "../../../utils/prisma.server";
import { calcPrice } from "../calc/calcPrice";
import type { PriceTier } from "../calc/types";

function toNumber(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? (n as number) : null;
}

export class ProductPricingService {
  static async getAutoSellPrice(productId: number, qty?: number | null) {
    const p = await prismaBase.product.findUnique({
      where: { id: productId },
      select: {
        costPrice: true,
        defaultCostQty: true,
        purchaseTaxId: true,
        manualSalePrice: true,
        costGroupId: true,
        supplierId: true,
      },
    });
    if (!p) return null;
    if (p.manualSalePrice != null) return p.manualSalePrice;

    const q = Math.max(1, qty ?? p.defaultCostQty ?? 60);

    // Load tax rate
    let taxRate = 0;
    if (p.purchaseTaxId) {
      const tax = await prismaBase.valueList.findUnique({
        where: { id: p.purchaseTaxId },
        select: { value: true },
      });
      taxRate = Number(tax?.value ?? 0) || 0;
    }

    // Resolve tiers: prefer product-specific; then product's group; then supplier's group
    const tiers: PriceTier[] = [];
    const pushRange = (from: number | null, price: number | null) => {
      if (price == null) return;
      const minQty = Math.max(1, toNumber(from) ?? 1);
      tiers.push({ minQty, priceCost: price });
    };

    // product ranges
    const productRanges = await prismaBase.productCostRange.findMany({
      where: { productId },
      orderBy: [{ rangeFrom: "asc" }, { id: "asc" }],
      select: { rangeFrom: true, costPrice: true },
    });
    for (const r of productRanges)
      pushRange(r.rangeFrom as any, toNumber(r.costPrice));

    // group ranges
    let groupId: number | null = p.costGroupId ?? null;
    if (!groupId && p.supplierId) {
      const g = await prismaBase.productCostGroup.findFirst({
        where: { supplierId: p.supplierId },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      groupId = g?.id ?? null;
    }
    if (groupId) {
      const group = await prismaBase.productCostGroup.findUnique({
        where: { id: groupId },
        select: { costPrice: true },
      });
      if (group?.costPrice != null) pushRange(1, toNumber(group.costPrice));
      const ranges = await prismaBase.productCostRange.findMany({
        where: { costGroupId: groupId },
        orderBy: [{ rangeFrom: "asc" }, { id: "asc" }],
        select: { rangeFrom: true, costPrice: true },
      });
      for (const r of ranges)
        pushRange(r.rangeFrom as any, toNumber(r.costPrice));
    }

    // Base cost fallback when no tiers
    const baseCost = toNumber(p.costPrice) ?? 0;
    const out = calcPrice({ baseCost, qty: q, tiers, taxRate });
    return out.unitSellPrice;
  }
}
