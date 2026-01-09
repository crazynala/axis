const MOVEMENT_LABELS: Record<string, string> = {
  DEFECT_SAMPLE: "Defect → Sample",
  DEFECT_REVIEW: "Defect → Review",
  DEFECT_SCRAP: "Defect → Scrap",
  DEFECT_OFF_SPEC: "Defect → Off-spec",
  DEFECT_NONE: "Defect → None",
};

export function getMovementLabel(raw: string | null | undefined): string {
  const value = (raw ?? "").toString().trim();
  if (!value) return "";
  const key = value.toUpperCase();
  return MOVEMENT_LABELS[key] ?? value;
}

export const DEFECT_MOVEMENT_LABELS = MOVEMENT_LABELS;
