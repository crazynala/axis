import assert from "node:assert/strict";
import { isCompanyImmutableViolation } from "../app/modules/job/services/jobUpdateRules";

assert.equal(
  isCompanyImmutableViolation({ existingCompanyId: 10, nextCompanyId: 10 }),
  false
);
assert.equal(
  isCompanyImmutableViolation({ existingCompanyId: 10, nextCompanyId: 12 }),
  true
);
assert.equal(
  isCompanyImmutableViolation({ existingCompanyId: null, nextCompanyId: null }),
  false
);

console.log("job company immutability tests: ok");
