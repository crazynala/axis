import { reconcileProductStock } from "../app/modules/debug/builders/product.server";

const result = reconcileProductStock({
  snapshotByLocation: [
    { locationId: 1, locationCode: null, locationName: "MAIN", qty: -1 },
    { locationId: 2, locationCode: null, locationName: "SAMPLE", qty: 1 },
  ],
  snapshotTotalQty: 0,
  batchTracked: false,
  movements: [
    {
      id: 10,
      movementType: "DEFECT_SAMPLE",
      quantity: 1,
      locationOutId: 1,
      locationInId: 2,
      lines: [],
    },
  ],
});

const byLoc = new Map<number | null, number>();
result.explain.forEach((row) => byLoc.set(row.locationId ?? null, row.delta));

if ((byLoc.get(1) ?? 0) !== 0 || (byLoc.get(2) ?? 0) !== 0) {
  throw new Error("Expected zero deltas for transfer-like defect reconciliation.");
}

console.log("OK: reconcileProductStock transfer-like defect.");
