import assert from "node:assert/strict";
import { getProductDisplayPrice } from "../app/modules/product/pricing/getProductDisplayPrice";

function round2(n: number | undefined) {
  if (n == null) return null;
  return Math.round(n * 100) / 100;
}

function main() {
  const pricing = getProductDisplayPrice({
    qty: 60,
    baseCost: 4,
    taxRate: 0.1,
    pricingModel: "COST_PLUS_MARGIN",
    marginDefaults: { globalDefaultMargin: 0.1 },
  });
  assert.equal(
    round2(pricing.unitSellPrice),
    4.84,
    "cost 4 + 10% margin + 10% tax should be 4.84"
  );

  const indexLike = getProductDisplayPrice({
    qty: 60,
    baseCost: 4,
    taxRate: 0.1,
    pricingModel: "COST_PLUS_MARGIN",
    marginDefaults: { globalDefaultMargin: 0.1 },
  });
  const detailLike = getProductDisplayPrice({
    qty: 60,
    baseCost: 4,
    taxRate: 0.1,
    pricingModel: "COST_PLUS_MARGIN",
    manualMargin: null,
    marginDefaults: { globalDefaultMargin: 0.1 },
  });
  assert.equal(
    round2(indexLike.unitSellPrice),
    round2(detailLike.unitSellPrice),
    "index and detail display prices should match for identical inputs"
  );

  const tiered = getProductDisplayPrice({
    qty: 10,
    baseCost: 0,
    taxRate: 0,
    pricingModel: "TIERED_COST_PLUS_MARGIN",
    costTiers: [
      { minQty: 1, priceCost: 5 },
      { minQty: 10, priceCost: 4 },
    ],
    marginDefaults: { globalDefaultMargin: 0.1 },
  });
  assert.equal(
    round2((tiered as any)?.breakdown?.baseUnit),
    4,
    "tiered cost model should derive cost from tier range"
  );

  const tieredFixed = getProductDisplayPrice({
    qty: 10,
    baseCost: 0,
    taxRate: 0,
    pricingModel: "TIERED_COST_PLUS_FIXED_SELL",
    manualSalePrice: 7.5,
    costTiers: [
      { minQty: 1, priceCost: 6 },
      { minQty: 10, priceCost: 4 },
    ],
  });
  assert.equal(
    round2(tieredFixed.unitSellPrice),
    7.5,
    "tiered fixed sell should keep fixed sell price"
  );
  assert.equal(
    round2((tieredFixed as any)?.breakdown?.baseUnit),
    4,
    "tiered fixed sell should derive cost from tier range"
  );

  const curve = getProductDisplayPrice({
    qty: 60,
    baseCost: 0,
    taxRate: 0.1,
    pricingModel: "CURVE_SELL_AT_MOQ",
    baselinePriceAtMoq: 5,
    pricingSpecRanges: [{ rangeFrom: 1, rangeTo: null, multiplier: 1 }],
    transferPercent: 0.5,
  });
  assert.ok(
    (curve.unitSellPrice ?? 0) > 0,
    "curve pricing should derive sell even when cost is 0"
  );

  // eslint-disable-next-line no-console
  console.log("product display price tests: ok");
}

main();
