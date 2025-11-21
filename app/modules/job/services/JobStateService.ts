import type { PrismaClient } from "@prisma/client";
import { assemblyStateKeys, jobStateKeys } from "~/base/state/configs";

export type AssemblyState = (typeof assemblyStateKeys)[number];
export type JobState = (typeof jobStateKeys)[number];

type AssemblySummary = { id: number; status: string | null };

const ASSEMBLY_STATE_SET = new Set<AssemblyState>(assemblyStateKeys);
const JOB_STATE_SET = new Set<JobState>(jobStateKeys);

const LEGACY_ASSEMBLY_MAP: Record<string, AssemblyState> = {
  WIP: "CUT_PLANNED",
};
const LEGACY_JOB_MAP: Record<string, JobState> = {
  ACTIVE: "IN_WORK",
  WIP: "IN_WORK",
};

const matchVariants = (state: string) => {
  const upper = state.toUpperCase();
  const human = upper
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
  return Array.from(new Set([upper, human, human.toLowerCase(), state]));
};

export class JobStateError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "JobStateError";
  }
}

export const assemblyStateOptions = assemblyStateKeys.map((key) => ({
  value: key,
  label:
    key
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase()) || key,
}));

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

const inWorkStates = new Set<AssemblyState>([
  "CUT_PLANNED",
  "PARTIAL_CUT",
  "FULLY_CUT",
]);

export function deriveJobStateFromAssemblies(
  assemblies: AssemblySummary[]
): JobState | null {
  if (!assemblies.length) return null;
  const statuses = assemblies
    .map((a) => normalizeAssemblyState(a.status))
    .filter((s): s is AssemblyState => Boolean(s));
  if (!statuses.length) return null;
  const every = (allowed: Set<AssemblyState>) =>
    statuses.every((s) => allowed.has(s));
  const some = (allowed: Set<AssemblyState>) =>
    statuses.some((s) => allowed.has(s));
  if (every(new Set<AssemblyState>(["CANCELED"]))) return "CANCELED";
  if (
    every(new Set<AssemblyState>(["NEW", "CANCELED"])) &&
    some(new Set<AssemblyState>(["NEW"]))
  ) {
    return "NEW";
  }
  if (some(inWorkStates)) return "IN_WORK";
  if (
    every(new Set<AssemblyState>(["CANCELED", "COMPLETE"])) &&
    some(new Set<AssemblyState>(["COMPLETE"]))
  ) {
    return "COMPLETE";
  }
  if (
    every(new Set<AssemblyState>(["CANCELED", "PENDING"])) &&
    some(new Set<AssemblyState>(["PENDING"]))
  ) {
    return "PENDING";
  }
  if (
    every(new Set<AssemblyState>(["CANCELED", "ON_HOLD"])) &&
    some(new Set<AssemblyState>(["ON_HOLD"]))
  ) {
    return "ON_HOLD";
  }
  return null;
}

export async function syncJobStateFromAssemblies(
  prisma: PrismaClient,
  jobId: number
) {
  const assemblies = await prisma.assembly.findMany({
    where: { jobId },
    select: { id: true, status: true },
  });
  const derived = deriveJobStateFromAssemblies(assemblies);
  if (!derived) return null;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  const current = normalizeJobState(job?.status);
  if (current === derived) return derived;
  await prisma.job.update({ where: { id: jobId }, data: { status: derived } });
  return derived;
}

const jobTransitionRules = [
  {
    match: (from: JobState | null, to: JobState) =>
      from === "DRAFT" && to === "NEW",
    effect: async (prisma: PrismaClient, jobId: number) => {
      await prisma.assembly.updateMany({
        where: { jobId, status: { in: matchVariants("DRAFT") } },
        data: { status: "NEW" },
      });
    },
  },
  {
    match: (_from: JobState | null, to: JobState) => to === "CANCELED",
    guard: async (prisma: PrismaClient, jobId: number) => {
      const hasActivity = await prisma.assemblyActivity.findFirst({
        where: { jobId },
        select: { id: true },
      });
      if (hasActivity) {
        throw new JobStateError(
          "JOB_CANCEL_BLOCKED",
          "Job cannot be canceled because at least one assembly has recorded activity."
        );
      }
    },
    effect: async (prisma: PrismaClient, jobId: number) => {
      await prisma.assembly.updateMany({
        where: { jobId },
        data: { status: "CANCELED" },
      });
    },
  },
  {
    match: (_from: JobState | null, to: JobState) => to === "ON_HOLD",
    effect: async (prisma: PrismaClient, jobId: number) => {
      await prisma.assembly.updateMany({
        where: { jobId, status: { notIn: matchVariants("CANCELED") } },
        data: { status: "ON_HOLD" },
      });
    },
  },
  {
    match: (_from: JobState | null, to: JobState) => to === "COMPLETE",
    effect: async (prisma: PrismaClient, jobId: number) => {
      await prisma.assembly.updateMany({
        where: { jobId, status: { notIn: matchVariants("CANCELED") } },
        data: { status: "COMPLETE" },
      });
    },
  },
];

export async function applyJobStateTransition(
  prisma: PrismaClient,
  jobId: number,
  toStateRaw: string | null | undefined
) {
  const toState = normalizeJobState(toStateRaw);
  if (!toState) return { updated: false };
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  const fromState = normalizeJobState(job?.status);
  if (fromState === toState) return { updated: false };
  for (const rule of jobTransitionRules) {
    if (rule.match(fromState ?? null, toState)) {
      if (rule.guard) {
        await rule.guard(prisma, jobId);
      }
      await rule.effect(prisma, jobId);
      break;
    }
  }
  await prisma.job.update({ where: { id: jobId }, data: { status: toState } });
  return { updated: true, toState };
}
