import { getMovementLabel, DEFECT_MOVEMENT_LABELS } from "../app/utils/movementLabels";

const cases: Array<[string, string]> = [
  ["DEFECT_SAMPLE", "Defect → Sample"],
  ["DEFECT_REVIEW", "Defect → Review"],
  ["DEFECT_SCRAP", "Defect → Scrap"],
  ["DEFECT_OFF_SPEC", "Defect → Off-spec"],
];

for (const [input, expected] of cases) {
  const actual = getMovementLabel(input);
  if (actual !== expected) {
    throw new Error(`Expected ${input} -> ${expected}, got ${actual}`);
  }
}

const passThrough = getMovementLabel("PO (Receive)");
if (passThrough !== "PO (Receive)") {
  throw new Error(`Expected pass-through label, got ${passThrough}`);
}

Object.keys(DEFECT_MOVEMENT_LABELS).forEach((key) => {
  const value = getMovementLabel(key);
  if (!value) throw new Error(`Missing label for ${key}`);
});

console.log("OK: movement label mapping.");
