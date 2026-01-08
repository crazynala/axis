export type JobWarning = {
  code: string;
  severity: "error" | "warn" | "info";
  label: string;
};

export type JobWarningsInput = {
  assemblyCount?: number | null;
  companyId?: number | null;
};

export function buildJobWarnings(input: JobWarningsInput): JobWarning[] {
  const warnings: JobWarning[] = [];
  const assemblyCount = Number(input.assemblyCount ?? 0) || 0;
  const companyId = input.companyId ?? null;
  if (assemblyCount === 0) {
    warnings.push({
      code: "no_assemblies",
      severity: "warn",
      label: "No assemblies",
    });
  }
  if (companyId == null) {
    warnings.push({
      code: "missing_customer",
      severity: "warn",
      label: "Missing customer",
    });
  }
  const severityOrder: Record<JobWarning["severity"], number> = {
    error: 0,
    warn: 1,
    info: 2,
  };
  warnings.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.code.localeCompare(b.code);
  });
  return warnings;
}

export const jobWarnings = {
  buildJobWarnings,
};
