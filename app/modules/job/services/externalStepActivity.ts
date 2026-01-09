export type ExternalActivityKey = "wash" | "embroidery" | "dye";
export type ExternalStepKey = "WASH" | "EMBROIDERY" | "DYE";

const EXTERNAL_ACTIVITY_BY_STEP: Record<ExternalStepKey, ExternalActivityKey> = {
  WASH: "wash",
  EMBROIDERY: "embroidery",
  DYE: "dye",
};

const EXTERNAL_ACTIVITY_LABELS: Record<ExternalActivityKey, string> = {
  wash: "Wash",
  embroidery: "Embroidery",
  dye: "Dye",
};

export function mapExternalStepTypeToActivityUsed(
  type?: ExternalStepKey | string | null
): ExternalActivityKey | null {
  if (!type) return null;
  const key = String(type).toUpperCase() as ExternalStepKey;
  return EXTERNAL_ACTIVITY_BY_STEP[key] ?? null;
}

export function labelForExternalStepType(
  type?: ExternalStepKey | string | null
): string | null {
  const activity = mapExternalStepTypeToActivityUsed(type);
  return activity ? EXTERNAL_ACTIVITY_LABELS[activity] : null;
}

export function labelForExternalActivity(
  activity?: ExternalActivityKey | string | null
): string | null {
  if (!activity) return null;
  const key = String(activity).toLowerCase() as ExternalActivityKey;
  return EXTERNAL_ACTIVITY_LABELS[key] ?? null;
}
