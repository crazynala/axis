import type { PriceInput, PriceOutput, SalePriceTier } from "./types";

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcPrice(i: PriceInput): PriceOutput {
  console.log("!! calc price input", i);
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
  const saleTiers: SalePriceTier[] = [...(i.saleTiers ?? [])]
    .map((t) => ({
      minQty: toNum(t.minQty, 1),
      unitPrice: toNum(t.unitPrice, 0),
    }))
    .sort((a, b) => a.minQty - b.minQty);

  const multiplier = toNum(i.priceMultiplier, 1) || 1;
  const taxRate = toNum(i.taxRate, 0);

  // Helper to apply discounts then VAT to a pre-tax unit price
  const finalize = (preTaxUnit: number) => {
    const discounted = (i.discounts ?? []).reduce((p, d) => {
      const pct = d.pct != null ? toNum(d.pct, 0) : null;
      const amt = d.amount != null ? toNum(d.amount, 0) : null;
      if (pct != null) return p * (1 - pct);
      if (amt != null) return Math.max(0, p - amt);
      return p;
    }, preTaxUnit);
    const unitWithTax = discounted * (1 + taxRate);
    return { discounted, unitWithTax };
  };

  // 1) Manual sale price override
  if (i.manualSalePrice != null && Number.isFinite(toNum(i.manualSalePrice))) {
    const manual = toNum(i.manualSalePrice, 0);
    const { unitWithTax, discounted } = finalize(manual);
    return {
      unitSellPrice: round(unitWithTax),
      extendedSell: round(unitWithTax * qty),
      extendedCost: round(unitWithTax * qty),
      breakdown: {
        baseUnit: round(manual),
        inTarget: round(manual),
        discounted: round(discounted),
        withTax: round(unitWithTax),
        taxRate,
      },
      meta: { mode: "manual", multiplier: 1 },
    };
  }

  // 2) Sale tiers (explicit pre-tax unit prices) with optional multiplier
  if (saleTiers.length) {
    let picked: SalePriceTier | null = null;
    for (const t of saleTiers) if (qty >= t.minQty) picked = t;
    if (picked) {
      const unitPreTax = picked.unitPrice * multiplier;
      const { unitWithTax, discounted } = finalize(unitPreTax);
      return {
        unitSellPrice: round(unitWithTax),
        extendedSell: round(unitWithTax * qty),
        extendedCost: round(unitWithTax * qty),
        breakdown: {
          baseUnit: round(unitPreTax),
          inTarget: round(unitPreTax),
          discounted: round(discounted),
          withTax: round(unitWithTax),
          taxRate,
        },
        meta: {
          mode: "saleTier",
          multiplier,
          tier: { minQty: picked.minQty, unitPrice: picked.unitPrice },
        },
      };
    }
  }

  // 3) Cost + margin fallback (legacy). Currency rate applies before VAT.
  let tierCost: number | undefined;
  for (const t of tiers) if (qty >= t.minQty) tierCost = t.priceCost;
  const marginPct = i.marginPct != null ? toNum(i.marginPct, 0) : 0.1;
  const cost = tierCost != null ? toNum(tierCost, 0) : toNum(i.baseCost, 0);
  const baseUnit = cost;
  const costWithMargin = baseUnit * (1 + marginPct);
  const unitInTarget = toNum(i.currencyRate, 1) * costWithMargin;
  const { unitWithTax, discounted } = finalize(unitInTarget);

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
    meta: { mode: "cost+margin", marginUsed: marginPct, multiplier: 1 },
  };
}
