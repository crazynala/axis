import assert from "node:assert/strict";
import {
  computePricingDrift,
  resolvePricingMeta,
} from "../app/utils/pricingValueMeta";

function main() {
  const noDrift = computePricingDrift(10, 10.005);
  assert.equal(noDrift, null, "drift below tolerance should be null");

  const drift = computePricingDrift(10, 10.02);
  assert.ok(drift, "drift above tolerance should be detected");
  assert.equal(
    Math.round((drift?.delta ?? 0) * 100) / 100,
    0.02,
    "drift delta should be 0.02"
  );

  const locked = resolvePricingMeta({
    isLocked: true,
    lockedValue: 10,
    currentValue: 10,
  });
  assert.equal(locked.state, "locked", "locked values should be locked state");

  const drifted = resolvePricingMeta({
    isLocked: true,
    lockedValue: 10,
    currentValue: 10.02,
  });
  assert.equal(
    drifted.state,
    "drifted",
    "locked values with drift should be drifted state"
  );

  const overridden = resolvePricingMeta({ isOverridden: true });
  assert.equal(
    overridden.state,
    "overridden",
    "manual values should be overridden state"
  );

  // eslint-disable-next-line no-console
  console.log("pricing meta tests: ok");
}

main();
