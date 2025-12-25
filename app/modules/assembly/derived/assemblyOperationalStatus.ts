import {
  computeEffectiveOrderedBreakdown,
  computeOrderedTotal,
} from "~/modules/job/quantityUtils";

export type AssemblyOperationalStatus =
  | "NOT_STARTED"
  | "CUT_IN_PROGRESS"
  | "READY_FOR_MAKE"
  | "MAKE_IN_PROGRESS"
  | "COMPLETE";

export const ASSEMBLY_OPERATIONAL_STATUS_LABELS: Record<
  AssemblyOperationalStatus,
  string
> = {
  NOT_STARTED: "Not started",
  CUT_IN_PROGRESS: "Cut in progress",
  READY_FOR_MAKE: "Ready for make",
  MAKE_IN_PROGRESS: "Make in progress",
  COMPLETE: "Complete",
};

export type AssemblyOperationalStatusResult = {
  status: AssemblyOperationalStatus;
  effectiveOrdered: number;
  orderedTotal: number;
  canceledTotal: number;
  cutQty: number;
  makeQty: number;
};

export function deriveAssemblyOperationalStatus(args: {
  orderedBySize?: number[] | null;
  canceledBySize?: number[] | null;
  qtyCut?: number | null;
  qtySew?: number | null;
  qtyFinish?: number | null;
  qtyPack?: number | null;
}): AssemblyOperationalStatusResult {
  const orderedBySize = Array.isArray(args.orderedBySize)
    ? args.orderedBySize
    : [];
  const canceledBySize = Array.isArray(args.canceledBySize)
    ? args.canceledBySize
    : [];
  const { effective, canceled, total } = computeEffectiveOrderedBreakdown({
    orderedBySize,
    canceledBySize,
  });
  const orderedTotal = computeOrderedTotal(orderedBySize);
  const canceledTotal = canceled.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const cutQty = Number(args.qtyCut ?? 0) || 0;
  const makeQty = Math.max(
    Number(args.qtySew ?? 0) || 0,
    Number(args.qtyFinish ?? 0) || 0,
    Number(args.qtyPack ?? 0) || 0
  );
  const effectiveOrdered = total;

  let status: AssemblyOperationalStatus = "NOT_STARTED";
  if (effectiveOrdered > 0 && makeQty >= effectiveOrdered) {
    status = "COMPLETE";
  } else if (makeQty > 0) {
    status = "MAKE_IN_PROGRESS";
  } else if (effectiveOrdered > 0 && cutQty >= effectiveOrdered) {
    status = "READY_FOR_MAKE";
  } else if (cutQty > 0) {
    status = "CUT_IN_PROGRESS";
  }

  return {
    status,
    effectiveOrdered,
    orderedTotal,
    canceledTotal,
    cutQty,
    makeQty,
  };
}

export type AssemblyHoldOverlay = {
  labels: Array<{ label: string; reason: string | null }>;
  hasHold: boolean;
};

export function deriveAssemblyHoldOverlay(args: {
  jobHoldOn?: boolean | null;
  jobHoldType?: string | null;
  jobHoldReason?: string | null;
  manualHoldOn?: boolean | null;
  manualHoldType?: string | null;
  manualHoldReason?: string | null;
}): AssemblyHoldOverlay {
  const labels: Array<{ label: string; reason: string | null }> = [];
  const jobHoldOn = Boolean(args.jobHoldOn);
  const manualHoldOn = Boolean(args.manualHoldOn);
  if (jobHoldOn) {
    const type = (args.jobHoldType || "").toUpperCase();
    const label =
      type === "CLIENT"
        ? "Client hold (Job)"
        : type === "INTERNAL"
        ? "Internal hold (Job)"
        : "Job hold";
    labels.push({ label, reason: args.jobHoldReason ?? null });
  }
  if (manualHoldOn) {
    const type = (args.manualHoldType || "").toUpperCase();
    const label =
      type === "CLIENT"
        ? "Client hold (Assembly)"
        : type === "INTERNAL"
        ? "Internal hold (Assembly)"
        : "Assembly hold";
    labels.push({ label, reason: args.manualHoldReason ?? null });
  }
  return { labels, hasHold: labels.length > 0 };
}
