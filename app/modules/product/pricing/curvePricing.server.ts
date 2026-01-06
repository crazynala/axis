import type { PricingSpecRange } from "@prisma/client";

type CurveRange = Pick<
  PricingSpecRange,
  "rangeFrom" | "rangeTo" | "multiplier"
>;

const MAX_RANGE_WIDTH = Number.MAX_SAFE_INTEGER;

function resolveRangeWidth(range: CurveRange) {
  const min = range.rangeFrom ?? 1;
  const max = range.rangeTo ?? MAX_RANGE_WIDTH;
  return max - min;
}

export function getCurveSellUnitPrice(opts: {
  qty: number;
  baselinePriceAtMoq: number;
  specRanges: CurveRange[];
}) {
  const qty = Math.max(1, Math.floor(opts.qty));
  const base = opts.baselinePriceAtMoq;
  const ranges = opts.specRanges || [];
  if (!ranges.length) {
    throw new Error("Curve has no ranges");
  }
  const matches = ranges.filter((range) => {
    const min = range.rangeFrom ?? 1;
    const max = range.rangeTo ?? MAX_RANGE_WIDTH;
    return qty >= min && qty <= max;
  });
  if (!matches.length) {
    throw new Error(`Curve does not define price for qty ${qty}`);
  }
  if (matches.length > 1) {
    const rangesLabel = matches
      .map((r) => `${r.rangeFrom ?? 1}-${r.rangeTo ?? "∞"}`)
      .join(", ");
    console.warn(
      `[pricing] curve overlap for qty ${qty}; ranges=${rangesLabel}`
    );
  }
  const picked = matches.sort(
    (a, b) => resolveRangeWidth(a) - resolveRangeWidth(b)
  )[0];
  const multiplier = Number(picked.multiplier);
  if (!Number.isFinite(multiplier)) {
    throw new Error("Curve multiplier is invalid");
  }
  return base * multiplier;
}
