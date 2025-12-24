export type FieldSource = "OVERRIDE" | "JOB" | "DERIVED" | "NONE";

export function formatSourceChip(source: FieldSource): {
  label: string;
  tone: "neutral" | "info" | "warning";
} {
  switch (source) {
    case "OVERRIDE":
      return { label: "Override", tone: "info" };
    case "JOB":
      return { label: "Job", tone: "neutral" };
    case "DERIVED":
      return { label: "Derived", tone: "info" };
    default:
      return { label: "None", tone: "neutral" };
  }
}
