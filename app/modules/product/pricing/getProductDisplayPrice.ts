import { calcPrice } from "../calc/calcPrice";
import type { PriceOutput, PriceTier, SalePriceTier } from "../calc/types";

export type PricingMarginDefaults = {
  marginOverride?: number | null;
  vendorDefaultMargin?: number | null;
  globalDefaultMargin?: number | null;
} | null;

export type ProductDisplayPriceInput = {
  qty?: number | null;
  priceMultiplier?: number | null;
  taxRate?: number | null;
  baseCost?: number | null;
  manualSalePrice?: number | null;
  manualMargin?: number | null;
  pricingModel?: string | null;
  baselinePriceAtMoq?: number | null;
  transferPercent?: number | null;
  pricingSpecRanges?: Array<{
    rangeFrom: number | null;
    rangeTo: number | null;
    multiplier: number;
  }>;
  costTiers?: PriceTier[];
  saleTiers?: SalePriceTier[];
  marginDefaults?: PricingMarginDefaults;
  debug?: boolean;
  debugLabel?: string;
};

const toNum = (v: any, def = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
};

const resolveMarginPct = (
  manualMargin: number | null | undefined,
  defaults: PricingMarginDefaults
) => {
  const manual =
    manualMargin != null && Number.isFinite(Number(manualMargin))
      ? Number(manualMargin)
      : null;
  // Treat 0 as "unset" to match defaultOverride behavior in product forms.
  if (manual != null && manual !== 0) return manual;
  const m1 = defaults?.marginOverride;
  if (m1 != null && Number.isFinite(Number(m1))) return Number(m1);
  const m2 = defaults?.vendorDefaultMargin;
  if (m2 != null && Number.isFinite(Number(m2))) return Number(m2);
  const m3 = defaults?.globalDefaultMargin;
  if (m3 != null && Number.isFinite(Number(m3))) return Number(m3);
  return undefined;
};

export function getProductDisplayPrice(
  input: ProductDisplayPriceInput
): (PriceOutput & {
  trace?: {
    label?: string;
    qty: number;
    taxRate: number;
    marginPct?: number;
    priceMultiplier: number;
    pricingModel: string | null;
  };
}) {
  const qty = Math.max(1, toNum(input.qty, 1));
  const taxRate = toNum(input.taxRate, 0);
  const priceMultiplier = toNum(input.priceMultiplier, 1) || 1;
  const marginPct = resolveMarginPct(input.manualMargin, input.marginDefaults);
  const pricingModel = input.pricingModel ?? null;
  const manualSalePrice =
    input.manualSalePrice != null && Number.isFinite(Number(input.manualSalePrice))
      ? Number(input.manualSalePrice)
      : undefined;
  const out = calcPrice({
    baseCost: toNum(input.baseCost, 0),
    qty,
    taxRate,
    priceMultiplier,
    manualSalePrice,
    marginPct,
    pricingModel,
    baselinePriceAtMoq:
      input.baselinePriceAtMoq != null
        ? toNum(input.baselinePriceAtMoq, undefined as any)
        : null,
    transferPercent:
      input.transferPercent != null
        ? toNum(input.transferPercent, undefined as any)
        : null,
    pricingSpecRanges: input.pricingSpecRanges || [],
    tiers: input.costTiers || [],
    saleTiers: input.saleTiers || [],
  });
  if (input.debug) {
    const trace = {
      label: input.debugLabel,
      qty,
      taxRate,
      marginPct,
      priceMultiplier,
      pricingModel,
    };
    // eslint-disable-next-line no-console
    console.debug("[pricing.trace]", trace, out);
    return { ...out, trace };
  }
  return out;
}
