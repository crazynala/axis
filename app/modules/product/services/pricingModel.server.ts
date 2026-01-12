export type ProductPricingModel =
  | "COST_PLUS_MARGIN"
  | "COST_PLUS_FIXED_SELL"
  | "TIERED_COST_PLUS_MARGIN"
  | "CURVE_SELL_AT_MOQ"
  | "TIERED_COST_PLUS_FIXED_SELL";

export const PRODUCT_PRICING_MODEL_LABELS: Record<ProductPricingModel, string> = {
  COST_PLUS_MARGIN: "Cost + Margin",
  COST_PLUS_FIXED_SELL: "Cost + Fixed Sell",
  TIERED_COST_PLUS_MARGIN: "Tiered Cost + Margin",
  CURVE_SELL_AT_MOQ: "Curve (Sell @ MOQ)",
  TIERED_COST_PLUS_FIXED_SELL: "Tiered Cost + Fixed Sell",
};

export type PricingModelInput = {
  type?: string | null;
  pricingModel?: ProductPricingModel | string | null;
  manualSalePrice?: number | null;
  manualMargin?: number | null;
  pricingSpecId?: number | null;
  baselinePriceAtMoq?: number | null;
  salePriceGroupId?: number | null;
  costGroupId?: number | null;
  costPriceRanges?: Array<{ id?: number }>;
  costGroup?: { costRanges?: Array<{ id?: number }> } | null;
};

export function resolvePricingModelForImport(
  productLike: PricingModelInput
): ProductPricingModel {
  const explicit = productLike.pricingModel as ProductPricingModel | undefined;
  if (explicit) return explicit;
  if (productLike.pricingSpecId != null || productLike.baselinePriceAtMoq != null) {
    return "CURVE_SELL_AT_MOQ";
  }
  const hasTieredCost =
    (productLike.costPriceRanges?.length ?? 0) > 0 ||
    (productLike.costGroup?.costRanges?.length ?? 0) > 0 ||
    productLike.costGroupId != null;
  if (hasTieredCost && productLike.manualSalePrice != null) {
    return "TIERED_COST_PLUS_FIXED_SELL";
  }
  if (hasTieredCost) {
    return "TIERED_COST_PLUS_MARGIN";
  }
  if (productLike.manualSalePrice != null) return "COST_PLUS_FIXED_SELL";
  return "COST_PLUS_MARGIN";
}

export function inferPricingModelFromData(
  productLike: PricingModelInput
): ProductPricingModel {
  return resolvePricingModelForImport(productLike);
}
