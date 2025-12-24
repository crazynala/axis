export type PricingMode =
  | "FIXED_PRICE"
  | "FIXED_MARGIN"
  | "TIERED_COST"
  | "TIERED_SELL"
  | "GENERATED";

export const PRICING_MODE_LABELS: Record<PricingMode, string> = {
  FIXED_PRICE: "Fixed Price",
  FIXED_MARGIN: "Fixed Margin",
  TIERED_COST: "Tiered Cost",
  TIERED_SELL: "Tiered Sell",
  GENERATED: "Generated",
};

export type PricingModeInput = {
  type?: string | null;
  manualSalePrice?: number | null;
  manualMargin?: number | null;
  pricingSpecId?: number | null;
  salePriceGroupId?: number | null;
  costGroupId?: number | null;
  salePriceRanges?: Array<{ id?: number }>;
  salePriceGroup?: { saleRanges?: Array<{ id?: number }> } | null;
  costGroup?: { costRanges?: Array<{ id?: number }> } | null;
  legacySellTiers?: boolean;
  legacyCostTiers?: boolean;
};

export function resolvePricingModeForImport(
  productLike: PricingModeInput
): PricingMode {
  const typeUpper = String(productLike.type || "").toUpperCase();
  if (typeUpper === "CMT") return "TIERED_SELL";
  if (productLike.pricingSpecId != null) return "GENERATED";
  const hasSellTiers =
    Boolean(productLike.legacySellTiers) ||
    Boolean(productLike.salePriceGroupId) ||
    (productLike.salePriceRanges?.length ?? 0) > 0 ||
    (productLike.salePriceGroup?.saleRanges?.length ?? 0) > 0;
  if (hasSellTiers) return "TIERED_SELL";
  const hasCostTiers =
    Boolean(productLike.legacyCostTiers) ||
    Boolean(productLike.costGroupId) ||
    (productLike.costGroup?.costRanges?.length ?? 0) > 0;
  if (hasCostTiers) return "TIERED_COST";
  if (productLike.manualSalePrice != null) return "FIXED_PRICE";
  return "FIXED_MARGIN";
}

export function inferPricingModeFromData(product: PricingModeInput): PricingMode {
  return resolvePricingModeForImport(product);
}
