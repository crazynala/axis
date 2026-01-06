export type PriceTier = { minQty: number; priceCost: number };
export type SalePriceTier = { minQty: number; unitPrice: number };

export type PriceInput = {
  baseCost: number;
  marginPct?: number; // decimal (0.20 => 20%) optional policy
  taxRate?: number; // decimal (0.18)
  qty?: number;
  tiers?: PriceTier[]; // sorted ascending by minQty (optional)
  // New: explicit sale tiers (pre-tax unit prices). If provided and no manualSalePrice, these take precedence over cost+margin.
  saleTiers?: SalePriceTier[];
  // New: multiplier applied to sale tier prices (e.g., vendor/customer mapping). Defaults to 1.
  priceMultiplier?: number;
  // New: manual sale price override (pre-tax) takes absolute precedence when set.
  manualSalePrice?: number;
  pricingModel?: string | null;
  pricingSpecRanges?: Array<{
    rangeFrom: number | null;
    rangeTo: number | null;
    multiplier: number;
  }>;
  baselinePriceAtMoq?: number | null;
  transferPercent?: number | null;
  currencyRate?: number; // e.g., TRY per USD
  discounts?: { code: string; pct?: number; amount?: number }[];
};

export type PriceOutput = {
  unitSellPrice?: number;
  extendedSell?: number;
  extendedCost?: number;
  breakdown: Record<string, number>;
  // Additional metadata about how price was derived
  meta?: {
    mode: "manual" | "saleTier" | "cost+margin" | "curve";
    marginUsed?: number; // decimal (0.20)
    multiplier?: number; // e.g., 1.1
    tier?: { minQty: number; unitPrice: number };
  };
};
