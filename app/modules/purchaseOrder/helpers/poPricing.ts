import { getProductDisplayPrice } from "~/modules/product/pricing/getProductDisplayPrice";

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
  const saleGroup = Array.isArray(product.salePriceGroup?.saleRanges)
    ? product.salePriceGroup.saleRanges
        .filter((r: any) => r && r.rangeFrom != null && r.price != null)
        .map((r: any) => ({
          minQty: Number(r.rangeFrom) || 0,
          unitPrice: Number(r.price) || 0,
        }))
        .sort((a: any, b: any) => a.minQty - b.minQty)
    : [];
  const saleProduct = Array.isArray(product.salePriceRanges)
    ? product.salePriceRanges
        .filter((r: any) => r && r.rangeFrom != null && r.price != null)
        .map((r: any) => ({
          minQty: Number(r.rangeFrom) || 0,
          unitPrice: Number(r.price) || 0,
        }))
        .sort((a: any, b: any) => a.minQty - b.minQty)
    : [];
  const saleTiers = saleGroup.length ? saleGroup : saleProduct;
  const hasManualSell =
    pricingModel !== "CURVE_SELL_AT_MOQ" &&
    (product.manualSalePrice != null || product.c_isSellPriceManual === true);
  if (hasManualSell) {
    const out = getProductDisplayPrice({
      qty: qty > 0 ? qty : 1,
      baseCost: cost,
      costTiers: [],
      taxRate,
      manualSalePrice: Number(product.manualSalePrice || 0),
      manualMargin: product.manualMargin ?? null,
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
      marginDefaults: pricingPrefs ?? null,
      saleTiers,
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
  const priceMultiplier = pricingPrefs?.priceMultiplier ?? undefined;
  const out = getProductDisplayPrice({
    qty: qty > 0 ? qty : 1,
    baseCost: cost,
    costTiers: tiers,
    taxRate,
    priceMultiplier,
    manualSalePrice: product.manualSalePrice ?? null,
    manualMargin: product.manualMargin ?? null,
    marginDefaults: pricingPrefs ?? null,
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
    saleTiers,
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
