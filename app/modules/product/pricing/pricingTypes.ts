export type Margin = number | null | undefined;

export type PriceTier = {
  minQty: number;
  unitPrice: number; // pre-tax, in target currency
};

export type PricingContext = {
  // inputs
  qty: number;
  product: {
    id: number;
    manualSalePrice?: number | null;
    manualMargin?: number | null;
    costCurrency?: string | null;
    // optional default tax rate for purchase VAT
    purchaseTaxRate?: number | null;
    salePriceTiers?: PriceTier[] | null; // if using sale price groups
    costPriceTiers?: { minQty: number; unitCost: number }[] | null; // optional cost tiers
    costPrice?: number | null; // fallback base cost
    groupCostPrice?: number | null; // fallback group cost
  };
  supplier?: { id: number } | null; // vendor
  customer?: { id: number } | null;
  // lookups
  settings: { defaultMargin?: number | null };
  vendorDefaultMargin?: number | null;
  vendorCustomerMapping?: {
    marginOverride?: number | null;
    priceMultiplier?: number | null; // default 1 if null
  } | null;
  // currency and tax
  currencyRate?: number | null; // cost->target rate
};

export type PricingResult = {
  unitSellPrice: number; // final sell price (incl tax if provided)
  extendedSell: number;
  extendedCost: number;
  applied: {
    mode: "manualSalePrice" | "tierMultiplier" | "costMargin";
    marginUsed?: number | null;
    priceMultiplier?: number | null;
    tier?: PriceTier | null;
    // intermediate values
    baseUnit: number;
    inTarget: number;
    discounted: number;
    withTax: number;
  };
};
