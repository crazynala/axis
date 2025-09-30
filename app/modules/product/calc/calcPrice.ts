import type { PriceInput, PriceOutput } from "./types";

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcPrice(i: PriceInput): PriceOutput {
  const qty = Math.max(1, i.qty ?? 1);
  const tiers = [...(i.tiers ?? [])].sort((a, b) => a.minQty - b.minQty);
  // Find the highest tier <= qty
  let tierUnit: number | undefined;
  for (const t of tiers) {
    if (qty >= t.minQty) tierUnit = t.unitPrice;
  }
  const marginPct = i.marginPct ?? 0.1;
  const baseUnit = tierUnit ?? i.baseCost * (1 + marginPct);

  // FX
  const unitInTarget = (i.currencyRate ?? 1) * baseUnit;

  // Discounts
  const discounted = (i.discounts ?? []).reduce((p, d) => {
    if (d.pct != null) return p * (1 - d.pct);
    if (d.amount != null) return Math.max(0, p - d.amount);
    return p;
  }, unitInTarget);

  const taxRate = i.taxRate ?? 0;
  const unitWithTax = discounted * (1 + taxRate);

  return {
    unitPrice: round(discounted),
    unitPriceWithTax: round(unitWithTax),
    extended: round(discounted * qty),
    extendedWithTax: round(unitWithTax * qty),
    breakdown: {
      baseUnit: round(baseUnit),
      unitInTarget: round(unitInTarget),
      discounted: round(discounted),
      taxRate,
    },
  };
}
