export type PriceTier = { minQty: number; unitPrice: number };

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
  unitPrice: number; // in target currency, pre-tax
  unitPriceWithTax: number;
  extended: number; // unit * qty
  extendedWithTax: number;
  breakdown: Record<string, number>;
};
