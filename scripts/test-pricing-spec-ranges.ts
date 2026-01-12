import assert from "node:assert/strict";
import {
  sanitizePricingSpecRanges,
  validatePricingSpecRanges,
} from "../app/modules/pricing/utils/pricingSpecRanges";

function run() {
  const rows = sanitizePricingSpecRanges([
    { rangeFrom: 1, rangeTo: 10, multiplier: 1.0 },
    { rangeFrom: 11, rangeTo: 20, multiplier: 0.9 },
    { rangeFrom: "", rangeTo: "", multiplier: "" },
  ]);
  const ok = validatePricingSpecRanges(rows);
  assert.equal(ok.hasErrors, false, "Non-overlapping ranges should pass");

  const overlapRows = sanitizePricingSpecRanges([
    { rangeFrom: 1, rangeTo: 10, multiplier: 1.0 },
    { rangeFrom: 10, rangeTo: 20, multiplier: 0.9 },
  ]);
  const overlap = validatePricingSpecRanges(overlapRows);
  assert.equal(overlap.hasErrors, true, "Overlapping ranges should fail");

  const missingRows = sanitizePricingSpecRanges([
    { rangeFrom: 1, rangeTo: 10, multiplier: null },
  ]);
  const missing = validatePricingSpecRanges(missingRows);
  assert.equal(missing.hasErrors, true, "Missing multiplier should fail");

  console.log("pricing spec range tests: ok");
}

run();
