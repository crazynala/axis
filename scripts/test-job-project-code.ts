import assert from "node:assert/strict";
import {
  buildJobProjectCode,
  parseJobProjectCodeNumber,
} from "../app/modules/job/services/jobProjectCode";

const generated = buildJobProjectCode({
  shortCode: "TS",
  prefix: "ORD",
  nextNumber: 1,
});
assert.equal(generated, "TS-ORD-001");

const parsed = parseJobProjectCodeNumber({
  code: "TS-ORD-274",
  shortCode: "TS",
  prefix: "ORD",
});
assert.equal(parsed, 274);
const currentNextNumber = 200;
const syncedNextNumber = Math.max(currentNextNumber, (parsed ?? 0) + 1);
assert.equal(syncedNextNumber, 275);

console.log("job project code tests: ok");
