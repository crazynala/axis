import { calcPrice } from "~/modules/product/calc/calcPrice";

type PricingPrefs = {
  marginOverride?: number | null;
  vendorDefaultMargin?: number | null;
  globalDefaultMargin?: number | null;
  priceMultiplier?: number | null;
} | null;

export function computeLinePricing({
  product,
  qtyOrdered,
  pricingPrefs,
}: {
  product: any | null | undefined;
  qtyOrdered?: number | null;
  pricingPrefs?: PricingPrefs;
}) {
  if (!product) {
    return {
      cost: 0,
      sell: 0,
      extendedCost: 0,
      extendedSell: 0,
      taxRate: 0,
      isManualSell: false,
    };
  }
  const qty = Number(qtyOrdered || 0) || 0;
  const cost = Number(product.costPrice || 0);
  const pricingModel = String(product.pricingModel || "").toUpperCase();
  const taxRate = Number(product.purchaseTax?.value || 0);
  const hasManualSell =
    pricingModel !== "CURVE_SELL_AT_MOQ" &&
    (product.manualSalePrice != null || product.c_isSellPriceManual === true);
  if (hasManualSell) {
    const out = calcPrice({
      baseCost: cost,
      tiers: [],
      taxRate,
      qty: qty > 0 ? qty : 1,
      manualSalePrice: Number(product.manualSalePrice || 0),
      pricingModel: product.pricingModel ?? null,
      baselinePriceAtMoq:
        product.baselinePriceAtMoq != null
          ? Number(product.baselinePriceAtMoq)
          : null,
      transferPercent:
        product.transferPercent != null ? Number(product.transferPercent) : null,
      pricingSpecRanges: (product.pricingSpec?.ranges || []).map(
        (range: any) => ({
          rangeFrom: range.rangeFrom ?? null,
          rangeTo: range.rangeTo ?? null,
          multiplier: Number(range.multiplier),
        })
      ),
    });
    const sell = Number(out.unitSellPrice || product.manualSalePrice || 0);
    return {
      cost,
      sell,
      extendedCost: cost * (qty || 0),
      extendedSell: sell * (qty || 0),
      taxRate,
      isManualSell: true,
    };
  }
  const tiers = (product.costGroup?.costRanges || []).map((t: any) => ({
    minQty: Number(t.rangeFrom || 0),
    priceCost: Number(t.costPrice || 0),
  }));
  const marginPct = (() => {
    const m1 = pricingPrefs?.marginOverride;
    const m2 = pricingPrefs?.vendorDefaultMargin;
    const m3 = pricingPrefs?.globalDefaultMargin;
    const pick =
      m1 != null
        ? Number(m1)
        : m2 != null
        ? Number(m2)
        : m3 != null
        ? Number(m3)
        : null;
    return pick != null ? Number(pick) : undefined;
  })();
  const priceMultiplier = pricingPrefs?.priceMultiplier ?? undefined;
  const out = calcPrice({
    baseCost: cost,
    tiers,
    taxRate,
    qty: qty > 0 ? qty : 1,
    marginPct,
    priceMultiplier,
    pricingModel: product.pricingModel ?? null,
    baselinePriceAtMoq:
      product.baselinePriceAtMoq != null
        ? Number(product.baselinePriceAtMoq)
        : null,
    transferPercent:
      product.transferPercent != null ? Number(product.transferPercent) : null,
    pricingSpecRanges: (product.pricingSpec?.ranges || []).map((range: any) => ({
      rangeFrom: range.rangeFrom ?? null,
      rangeTo: range.rangeTo ?? null,
      multiplier: Number(range.multiplier),
    })),
  });
  const unitCost = Number((out as any)?.breakdown?.baseUnit ?? cost ?? 0);
  const unitSell = Number(out.unitSellPrice || 0);
  return {
    cost: unitCost,
    sell: unitSell,
    extendedCost: unitCost * (qty || 0),
    extendedSell: unitSell * (qty || 0),
    taxRate,
    isManualSell: false,
  };
}
