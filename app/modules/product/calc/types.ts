export type PriceTier = { minQty: number; priceCost: number };

export type PriceInput = {
  baseCost: number;
  marginPct?: number; // decimal (0.20 => 20%) optional policy
  taxRate?: number; // decimal (0.18)
  qty?: number;
  tiers?: PriceTier[]; // sorted ascending by minQty (optional)
  currencyRate?: number; // e.g., TRY per USD
  discounts?: { code: string; pct?: number; amount?: number }[];
};

export type PriceOutput = {
  unitSellPrice?: number;
  extendedSell?: number;
  extendedCost?: number;
  breakdown: Record<string, number>;
};
