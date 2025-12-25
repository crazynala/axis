import assert from "node:assert/strict";
import { buildEndCustomerOptions } from "../app/modules/job/services/endCustomerOptions";

const contacts = [
  { id: 1, firstName: "Ada", lastName: "Lovelace", companyId: 10 },
  { id: 2, firstName: "Grace", lastName: "Hopper", companyId: 11 },
  { id: 3, firstName: "Alan", lastName: "Turing", companyId: 10 },
];

const options = buildEndCustomerOptions(contacts, 10);
assert.deepEqual(options, [
  { value: "1", label: "Ada Lovelace" },
  { value: "3", label: "Alan Turing" },
]);

console.log("end customer options tests: ok");
