import {
  assertBatchLinePresence,
  assertTransferLocations,
} from "../app/utils/stockMovementGuards";

const failures: string[] = [];

try {
  assertTransferLocations({
    movementType: "DEFECT_SAMPLE",
    locationInId: 1,
    locationOutId: 2,
  });
} catch (err) {
  failures.push("Unexpected transfer guard failure");
}

try {
  assertTransferLocations({
    movementType: "DEFECT_SAMPLE",
    locationInId: null,
    locationOutId: 2,
  });
  failures.push("Expected transfer guard to throw for missing locationInId");
} catch {}

try {
  assertBatchLinePresence({
    movementType: "DEFECT_SAMPLE",
    batchTrackingEnabled: true,
    hasBatchId: true,
  });
} catch {
  failures.push("Unexpected batch guard failure");
}

try {
  assertBatchLinePresence({
    movementType: "DEFECT_SAMPLE",
    batchTrackingEnabled: true,
    hasBatchId: false,
  });
  failures.push("Expected batch guard to throw for missing batchId");
} catch {}

if (failures.length) {
  throw new Error(failures.join("; "));
}

console.log("OK: stock movement guards.");
