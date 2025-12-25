import assert from "node:assert/strict";
import { buildOptionPool, getSelectOptions, resolveOptionLabel } from "../app/base/forms/fieldOptions";

const field = {
  name: "customerId",
  label: "Customer",
  widget: "select",
  optionsKey: "customer",
  allOptionsKey: "customerAll",
} as any;

const ctx = {
  fieldOptions: {
    customer: [
      { value: "1", label: "Alpha" },
      { value: "2", label: "Beta" },
    ],
    customerAll: [{ value: "3", label: "Gamma" }],
  },
};

const options = getSelectOptions(field, ctx);
const pool = buildOptionPool(options);

assert.equal(resolveOptionLabel("2", pool), "Beta");
assert.equal(resolveOptionLabel("9", pool), "9");
assert.equal(resolveOptionLabel(null, pool), "");
assert.deepEqual(pool, [
  { value: "1", label: "Alpha" },
  { value: "2", label: "Beta" },
  { value: "3", label: "Gamma" },
]);

console.log("field options tests: ok");
