import assert from "node:assert/strict";
import { getDefaultJobTypeValue } from "../app/modules/job/services/jobTypeDefaults";

assert.equal(getDefaultJobTypeValue([]), "Production");
assert.equal(
  getDefaultJobTypeValue([{ value: "Production", label: "Production" }]),
  "Production"
);
assert.equal(
  getDefaultJobTypeValue([
    { value: "Sample", label: "Sample" },
    { value: "Production", label: "Production" },
  ]),
  "Production"
);

console.log("job type defaults tests: ok");
