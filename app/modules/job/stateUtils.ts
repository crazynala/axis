import { assemblyStateKeys, jobStateKeys } from "~/base/state/configs";

export type AssemblyState = (typeof assemblyStateKeys)[number];
export type JobState = (typeof jobStateKeys)[number];

export type JobPrimaryState =
  | "DRAFT"
  | "NEW"
  | "ACTIVE"
  | "COMPLETE"
  | "CANCELED";

const ASSEMBLY_STATE_SET = new Set<AssemblyState>(assemblyStateKeys);
const JOB_STATE_SET = new Set<JobState>(jobStateKeys);

const LEGACY_ASSEMBLY_MAP: Record<string, AssemblyState> = {
  WIP: "CUT_PLANNED",
};

const LEGACY_JOB_MAP: Record<string, JobState> = {
  ACTIVE: "IN_WORK",
  WIP: "IN_WORK",
};

export const assemblyStateOptions = assemblyStateKeys.map((key) => ({
  value: key,
  label:
    key
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase()) || key,
}));

export const matchVariants = (state: string) => {
  const upper = state.toUpperCase();
  const human = upper
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
  return Array.from(new Set([upper, human, human.toLowerCase(), state]));
};

export function normalizeAssemblyState(value: string | null | undefined) {
  if (!value) return null;
  const upper = value.toUpperCase().replace(/\s+/g, "_");
  if (LEGACY_ASSEMBLY_MAP[upper]) return LEGACY_ASSEMBLY_MAP[upper];
  if (ASSEMBLY_STATE_SET.has(upper as AssemblyState)) {
    return upper as AssemblyState;
  }
  return null;
}

export function normalizeJobState(value: string | null | undefined) {
  if (!value) return null;
  const upper = value.toUpperCase().replace(/\s+/g, "_");
  if (LEGACY_JOB_MAP[upper]) return LEGACY_JOB_MAP[upper];
  if (JOB_STATE_SET.has(upper as JobState)) return upper as JobState;
  return null;
}

export function computeEffectiveAssemblyHold(args: {
  jobHoldOn?: boolean | null;
  manualHoldOn?: boolean | null;
}): boolean {
  return Boolean(args.jobHoldOn || args.manualHoldOn);
}

export function mapLegacyJobStatusToState(
  statusRaw: string | null | undefined
): JobPrimaryState {
  const upper = (statusRaw || "").toString().trim().toUpperCase().replace(/\s+/g, "_");
  if (!upper) return "DRAFT";
  if (upper === "DRAFT") return "DRAFT";
  if (upper === "NEW") return "NEW";
  if (upper === "COMPLETE") return "COMPLETE";
  if (upper === "CANCELED" || upper === "CANCELLED") return "CANCELED";
  if (upper === "ON_HOLD") return "ACTIVE";
  if (["PENDING", "IN_WORK", "ACTIVE", "WIP"].includes(upper))
    return "ACTIVE";
  return "ACTIVE";
}

export function mapLegacyJobStatusToHold(statusRaw: string | null | undefined): {
  jobHoldOn: boolean;
  jobHoldReason: string | null;
} {
  const upper = (statusRaw || "").toString().trim().toUpperCase().replace(/\s+/g, "_");
  if (upper === "ON_HOLD") {
    return { jobHoldOn: true, jobHoldReason: "Imported hold" };
  }
  return { jobHoldOn: false, jobHoldReason: null };
}

export function mapLegacyAssemblyStatusToHoldAndIntent(
  statusRaw: string | null | undefined
): {
  manualHoldOn: boolean;
  manualHoldReason: string | null;
} {
  const upper = (statusRaw || "").toString().trim().toUpperCase().replace(/\s+/g, "_");
  if (upper === "ON_HOLD") {
    return { manualHoldOn: true, manualHoldReason: "Imported hold" };
  }
  return { manualHoldOn: false, manualHoldReason: null };
}

export function normalizeJobPrimaryState(
  value: string | null | undefined
): JobPrimaryState | null {
  if (!value) return null;
  const upper = value.toUpperCase().replace(/\s+/g, "_");
  if (
    upper === "DRAFT" ||
    upper === "NEW" ||
    upper === "ACTIVE" ||
    upper === "COMPLETE" ||
    upper === "CANCELED"
  ) {
    return upper as JobPrimaryState;
  }
  return null;
}
