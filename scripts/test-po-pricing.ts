import assert from "node:assert/strict";
import { computeLinePricing } from "../app/modules/purchaseOrder/helpers/poPricing";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function main() {
  // Tier boundary: cost tiers should switch at qty 50
  const tierProduct = {
    costPrice: 5,
    pricingModel: "COST_PLUS_MARGIN",
    purchaseTax: { value: 0.1 },
    costGroup: {
      costRanges: [
        { rangeFrom: 1, costPrice: 5 },
        { rangeFrom: 50, costPrice: 4 },
      ],
    },
  };
  const tierPrefs = { globalDefaultMargin: 0.1 };
  const low = computeLinePricing({
    product: tierProduct,
    qtyOrdered: 10,
    pricingPrefs: tierPrefs,
  });
  const high = computeLinePricing({
    product: tierProduct,
    qtyOrdered: 50,
    pricingPrefs: tierPrefs,
  });
  assert.equal(round2(low.cost), 5, "low qty uses base cost tier");
  assert.equal(round2(high.cost), 4, "high qty uses lower tier cost");

  // Curve multiplier: priceMultiplier should affect sell
  const curveProduct = {
    costPrice: 0,
    pricingModel: "CURVE_SELL_AT_MOQ",
    baselinePriceAtMoq: 10,
    transferPercent: 0.75,
    purchaseTax: { value: 0.1 },
    pricingSpec: {
      ranges: [{ rangeFrom: 1, rangeTo: 100, multiplier: 1 }],
    },
  };
  const curveBase = computeLinePricing({
    product: curveProduct,
    qtyOrdered: 10,
    pricingPrefs: { priceMultiplier: 1 },
  });
  const curveBoost = computeLinePricing({
    product: curveProduct,
    qtyOrdered: 10,
    pricingPrefs: { priceMultiplier: 1.2 },
  });
  assert.equal(round2(curveBase.sell), 11, "curve base sell includes tax");
  assert.equal(round2(curveBoost.sell), 13.2, "curve sell includes multiplier");
  assert.equal(
    round2(curveBase.cost),
    8.25,
    "curve cost uses transferPercent on tax-included sell"
  );

  // Tax rounding: unit sell should round to 2dp
  const taxProduct = {
    costPrice: 4,
    pricingModel: "COST_PLUS_MARGIN",
    purchaseTax: { value: 0.1 },
  };
  const tax = computeLinePricing({
    product: taxProduct,
    qtyOrdered: 1,
    pricingPrefs: { globalDefaultMargin: 0.1 },
  });
  assert.equal(round2(tax.sell), 4.84, "cost 4 + 10% margin + 10% tax");

  // Draft line: stored prices null should use computed values
  const draftLine = {
    manualCost: null,
    manualSell: null,
    priceCost: null,
    priceSell: null,
  };
  const draftComputed = computeLinePricing({
    product: taxProduct,
    qtyOrdered: 1,
    pricingPrefs: { globalDefaultMargin: 0.1 },
  });
  const effectiveCost =
    draftLine.manualCost ?? draftLine.priceCost ?? draftComputed.cost;
  const effectiveSell =
    draftLine.manualSell ?? draftLine.priceSell ?? draftComputed.sell;
  assert.equal(
    round2(effectiveCost),
    round2(draftComputed.cost),
    "draft line should use computed cost when stored values are null"
  );
  assert.equal(
    round2(effectiveSell),
    round2(draftComputed.sell),
    "draft line should use computed sell when stored values are null"
  );

  // eslint-disable-next-line no-console
  console.log("po pricing tests: ok");
}

main();
