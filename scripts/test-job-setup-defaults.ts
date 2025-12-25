import assert from "node:assert/strict";
import { resolveJobSetupDefaults } from "../app/modules/job/services/jobSetupDefaults";
import {
  buildJobProjectCode,
  buildProjectCodeFromIncrement,
} from "../app/modules/job/services/jobProjectCode";

const defaults = resolveJobSetupDefaults({
  company: { stockLocationId: 9, defaultAddressId: 22 },
});
assert.equal(defaults.stockLocationId, 9);
assert.equal(defaults.shipToAddressId, 22);

const fallbackDefaults = resolveJobSetupDefaults({
  company: { stockLocationId: null, defaultAddressId: null },
});
assert.equal(fallbackDefaults.stockLocationId, 1);
assert.equal(fallbackDefaults.shipToAddressId, null);

const projectCode = buildJobProjectCode({
  shortCode: "AX",
  prefix: "ORD",
  nextNumber: 41,
});
assert.equal(projectCode, "AX-ORD-041");

const assigned = buildProjectCodeFromIncrement({
  shortCode: "AX",
  prefix: "ORD",
  nextNumberAfterIncrement: 42,
});
assert.equal(assigned, "AX-ORD-041");

console.log("job setup defaults tests: ok");
