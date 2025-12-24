import assert from "node:assert/strict";
import {
  resolveAssemblyTargets,
} from "../app/modules/job/services/targetOverrides.server";

const now = new Date("2025-12-22T00:00:00.000Z");

const jobBase = {
  createdAt: new Date("2025-12-01T00:00:00.000Z"),
  internalTargetDate: null,
  customerTargetDate: null,
  dropDeadDate: new Date("2025-12-28T00:00:00.000Z"),
  shipToLocation: { id: 9, name: "Warehouse" },
};

const assemblyBase = {
  internalTargetDateOverride: null,
  customerTargetDateOverride: null,
  dropDeadDateOverride: null,
  shipToLocationOverride: null,
};

const derived = resolveAssemblyTargets({
  job: jobBase,
  assembly: assemblyBase,
  defaultLeadDays: 28,
  now,
});

assert.equal(derived.internal.source, "DERIVED");
assert.equal(derived.customer.source, "DERIVED");
assert.equal(derived.dropDead.source, "JOB");
assert.equal(derived.shipTo.source, "JOB");
assert.equal(derived.internalWasClamped, false);

const override = resolveAssemblyTargets({
  job: {
    ...jobBase,
    customerTargetDate: new Date("2025-12-10T00:00:00.000Z"),
  },
  assembly: {
    ...assemblyBase,
    internalTargetDateOverride: new Date("2025-12-20T00:00:00.000Z"),
    shipToLocationOverride: { id: 11, name: "Boutique" },
  },
  defaultLeadDays: 28,
  now,
});

assert.equal(override.internal.source, "OVERRIDE");
assert.equal(override.shipTo.source, "OVERRIDE");
assert.equal(override.anyOverride, true);
assert.equal(override.internalWasClamped, true);
assert.equal(
  override.internal.value?.toISOString().slice(0, 10),
  "2025-12-10"
);

console.log("target override tests: ok");
