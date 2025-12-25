import assert from "node:assert/strict";
import { resolveAssemblyTargets } from "../app/modules/job/services/targetOverrides.server";
import { normalizeOrderDate } from "../app/modules/job/services/jobTargetDefaults";

const now = new Date("2025-01-01T00:00:00.000Z");
const defaultOrder = normalizeOrderDate(null, now);
assert.equal(defaultOrder.toISOString().slice(0, 10), "2025-01-01");

const caseNoCustomer = resolveAssemblyTargets({
  job: {
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    customerOrderDate: new Date("2025-01-02T00:00:00.000Z"),
    internalTargetDate: null,
    customerTargetDate: null,
    dropDeadDate: null,
    shipToLocation: null,
    shipToAddress: null,
  },
  assembly: null,
  defaultLeadDays: 10,
  bufferDays: 3,
  escalationBufferDays: 5,
  now,
});

assert.equal(
  caseNoCustomer.internal.value?.toISOString().slice(0, 10),
  "2025-01-12"
);
assert.equal(caseNoCustomer.customer.value, null);
assert.equal(
  caseNoCustomer.dropDead.value?.toISOString().slice(0, 10),
  "2025-01-17"
);

const caseWithCustomer = resolveAssemblyTargets({
  job: {
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    customerOrderDate: new Date("2025-01-02T00:00:00.000Z"),
    internalTargetDate: null,
    customerTargetDate: new Date("2025-01-20T00:00:00.000Z"),
    dropDeadDate: null,
    shipToLocation: null,
    shipToAddress: null,
  },
  assembly: null,
  defaultLeadDays: 10,
  bufferDays: 4,
  escalationBufferDays: 6,
  now,
});

assert.equal(
  caseWithCustomer.internal.value?.toISOString().slice(0, 10),
  "2025-01-16"
);
assert.equal(
  caseWithCustomer.dropDead.value?.toISOString().slice(0, 10),
  "2025-01-26"
);

console.log("job date defaults tests: ok");
