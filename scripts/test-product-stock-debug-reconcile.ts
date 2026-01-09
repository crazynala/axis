import { compareLedgerToSnapshot } from "../app/modules/debug/builders/productStock.server";

const expectedByLocation = [
  { locationId: 1, locationCode: null, expectedQty: -1 },
  { locationId: 2, locationCode: null, expectedQty: 1 },
];
const expectedByLocationBatch = [
  { locationId: 1, locationCode: null, batchId: null, batchCode: null, expectedQty: -1 },
  { locationId: 2, locationCode: null, batchId: null, batchCode: null, expectedQty: 1 },
];
const snapshotByLocation = [
  { locationId: 1, qty: -1 },
  { locationId: 2, qty: 1 },
];
const snapshotByLocationBatch = [
  { locationId: 1, batchId: null, qty: -1 },
  { locationId: 2, batchId: null, qty: 1 },
];

const result = compareLedgerToSnapshot({
  expectedByLocation,
  expectedByLocationBatch,
  snapshotByLocation,
  snapshotByLocationBatch,
});

const hasDelta = result.compareByLocation.some((r) => r.delta !== 0);
if (hasDelta) {
  throw new Error("Expected zero deltas for matching ledger/snapshot data.");
}

const limitedResult = compareLedgerToSnapshot({
  expectedByLocation,
  expectedByLocationBatch,
  snapshotByLocation,
  snapshotByLocationBatch,
});

if (JSON.stringify(result) !== JSON.stringify(limitedResult)) {
  throw new Error("Reconciliation changed unexpectedly with identical inputs.");
}

console.log("OK: product stock debug reconciliation helper.");
