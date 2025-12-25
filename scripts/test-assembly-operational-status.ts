import assert from "node:assert/strict";
import {
  ASSEMBLY_OPERATIONAL_STATUS_LABELS,
  deriveAssemblyHoldOverlay,
  deriveAssemblyOperationalStatus,
} from "../app/modules/assembly/derived/assemblyOperationalStatus";

type Case = {
  name: string;
  args: Parameters<typeof deriveAssemblyOperationalStatus>[0];
  expected: keyof typeof ASSEMBLY_OPERATIONAL_STATUS_LABELS;
};

const cases: Case[] = [
  {
    name: "no activity",
    args: { orderedBySize: [10], qtyCut: 0, qtySew: 0, qtyFinish: 0, qtyPack: 0 },
    expected: "NOT_STARTED",
  },
  {
    name: "partial cut",
    args: { orderedBySize: [10], qtyCut: 3, qtySew: 0, qtyFinish: 0, qtyPack: 0 },
    expected: "CUT_IN_PROGRESS",
  },
  {
    name: "cut complete, no make",
    args: { orderedBySize: [10], qtyCut: 10, qtySew: 0, qtyFinish: 0, qtyPack: 0 },
    expected: "READY_FOR_MAKE",
  },
  {
    name: "make in progress after cut",
    args: { orderedBySize: [10], qtyCut: 10, qtySew: 4, qtyFinish: 0, qtyPack: 0 },
    expected: "MAKE_IN_PROGRESS",
  },
  {
    name: "make in progress before cut complete",
    args: { orderedBySize: [10], qtyCut: 3, qtySew: 2, qtyFinish: 0, qtyPack: 0 },
    expected: "MAKE_IN_PROGRESS",
  },
  {
    name: "complete when make totals meet order",
    args: { orderedBySize: [10], qtyCut: 10, qtySew: 10, qtyFinish: 10, qtyPack: 10 },
    expected: "COMPLETE",
  },
  {
    name: "canceled order treated as not started",
    args: { orderedBySize: [10], canceledBySize: [10], qtyCut: 10, qtySew: 10 },
    expected: "NOT_STARTED",
  },
];

for (const testCase of cases) {
  const result = deriveAssemblyOperationalStatus(testCase.args);
  assert.equal(result.status, testCase.expected, testCase.name);
}

const holdOverlay = deriveAssemblyHoldOverlay({
  jobHoldOn: true,
  jobHoldType: "CLIENT",
  jobHoldReason: "Waiting on approval",
  manualHoldOn: true,
  manualHoldType: "INTERNAL",
  manualHoldReason: "Capacity",
});
assert.equal(holdOverlay.hasHold, true);
assert.equal(holdOverlay.labels.length, 2);
assert.equal(holdOverlay.labels[0].label, "Client hold (Job)");
assert.equal(holdOverlay.labels[1].label, "Internal hold (Assembly)");

console.log("assembly operational status tests: ok");
