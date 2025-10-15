import type { PriceInput, PriceOutput } from "./types";

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcPrice(i: PriceInput): PriceOutput {
  // Defensive numeric coercions: callers may pass strings (e.g., from forms/JSON)
  const toNum = (v: any, def = 0) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : def;
  };
  const qty = Math.max(1, toNum(i.qty, 1));
  const tiers = [...(i.tiers ?? [])]
    .map((t) => ({
      minQty: toNum(t.minQty, 1),
      priceCost: toNum((t as any).priceCost ?? (t as any).unitPrice, 0),
    }))
    .sort((a, b) => a.minQty - b.minQty);
  // Find the highest tier <= qty
  let tierCost: number | undefined;
  for (const t of tiers) {
    if (qty >= t.minQty) tierCost = t.priceCost;
  }
  const marginPct = i.marginPct != null ? toNum(i.marginPct, 0) : 0.1;
  const cost = tierCost != null ? toNum(tierCost, 0) : toNum(i.baseCost, 0);

  // baseUnit: pre-margin, pre-VAT (raw cost in source currency)
  const baseUnit = cost;

  // Apply margin to cost, then convert currency
  const costWithMargin = baseUnit * (1 + marginPct);
  const unitInTarget = toNum(i.currencyRate, 1) * costWithMargin;

  // Discounts on target currency price (pre-VAT)
  const discounted = (i.discounts ?? []).reduce((p, d) => {
    const pct = d.pct != null ? toNum(d.pct, 0) : null;
    const amt = d.amount != null ? toNum(d.amount, 0) : null;
    if (pct != null) return p * (1 - pct);
    if (amt != null) return Math.max(0, p - amt);
    return p;
  }, unitInTarget);

  // Purchase VAT (applied after discount)
  const taxRate = toNum(i.taxRate, 0);
  const unitWithTax = discounted * (1 + taxRate);

  return {
    unitSellPrice: round(unitWithTax),
    extendedSell: round(unitWithTax * qty),
    extendedCost: round(unitWithTax * qty), // same as sell for POs
    breakdown: {
      baseUnit: round(baseUnit), // pre-margin, pre-VAT cost
      inTarget: round(unitInTarget), // after margin + FX, pre-discount, pre-VAT
      discounted: round(discounted), // after discounts, pre-VAT
      withTax: round(unitWithTax), // final after VAT
      taxRate,
    },
  };
}
