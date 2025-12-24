export const ATTENTION_DUE_SOON_DAYS = 7;
export const ATTENTION_INTERNAL_TARGET_DAYS = 28;

export type AttentionChipTone = "warning" | "info" | "neutral";

export type ProductionAttentionSignal = {
  key: string;
  tone: AttentionChipTone;
  label: string;
  tooltip?: string | null;
};

export type ProductionAttentionFilters = {
  includeHeld: boolean;
  onlyNotStarted: boolean;
  onlyDueSoon: boolean;
  onlyBlocked: boolean;
};

export type ProductionAttentionSort =
  | "priority"
  | "deadline"
  | "customer"
  | "job"
  | "assembly"
  | "newest"
  | "oldest";

export type ProductionAttentionDates = {
  dropDeadDate: Date | null;
  customerTargetDate: Date | null;
  internalTargetDate: Date | null;
  daysToDropDead: number | null;
  daysToCustomer: number | null;
  daysToInternal: number | null;
};

export type AttentionSortRow = {
  assemblyId: number;
  jobId: number | null;
  jobCode: string | null;
  customerName: string | null;
  createdAt: Date | null;
  started: boolean;
  effectiveHold: boolean;
  poHold: boolean;
  externalLate: boolean;
  daysToDropDead: number | null;
  daysToCustomer: number | null;
  daysToInternal: number | null;
};

export function computeDaysTo(date: Date | null, today: Date): number | null {
  if (!date || !Number.isFinite(date.getTime())) return null;
  const start = startOfDay(today).getTime();
  const target = startOfDay(date).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.round((target - start) / (24 * 60 * 60 * 1000));
}

export function isAttentionEligible(args: {
  jobState: string | null | undefined;
  effectiveOrderedTotal: number;
  packTotal: number;
}): boolean {
  if (args.jobState !== "ACTIVE") return false;
  if (!(args.effectiveOrderedTotal > 0)) return false;
  return args.packTotal < args.effectiveOrderedTotal;
}

export function hasDueSoonOrLate(dates: ProductionAttentionDates): boolean {
  return [dates.daysToDropDead, dates.daysToCustomer, dates.daysToInternal].some(
    (value) => value != null && value <= ATTENTION_DUE_SOON_DAYS
  );
}

export function buildAttentionSignals(args: {
  dates: ProductionAttentionDates;
  started: boolean;
  jobHoldOn: boolean;
  jobHoldType?: string | null;
  jobHoldReason?: string | null;
  assemblyHoldOn: boolean;
  assemblyHoldType?: string | null;
  assemblyHoldReason?: string | null;
  poHold: boolean;
  poHoldReason?: string | null;
  externalLate: boolean;
  anyOverride?: boolean;
  internalSource?: "OVERRIDE" | "JOB" | "DERIVED" | "NONE";
}): ProductionAttentionSignal[] {
  const signals: ProductionAttentionSignal[] = [];
  if (args.anyOverride) {
    signals.push({
      key: "override",
      tone: "neutral",
      label: "Override",
      tooltip: "Assembly date override applied.",
    });
  }
  const hasHold = args.jobHoldOn || args.assemblyHoldOn;
  if (hasHold) {
    const label = args.jobHoldOn && args.assemblyHoldOn
      ? "Held (Job + Assembly)"
      : args.jobHoldOn
        ? "Held (Job)"
        : "Held (Assembly)";
    const tooltip = [
      formatHoldDetail(
        "Job",
        args.jobHoldOn,
        args.jobHoldType,
        args.jobHoldReason
      ),
      formatHoldDetail(
        "Assembly",
        args.assemblyHoldOn,
        args.assemblyHoldType,
        args.assemblyHoldReason
      ),
    ]
      .filter(Boolean)
      .join(" · ");
    signals.push({
      key: "hold",
      tone: "warning",
      label,
      tooltip: tooltip || undefined,
    });
  }

  if (args.poHold) {
    signals.push({
      key: "po-hold",
      tone: "warning",
      label: "PO HOLD",
      tooltip: args.poHoldReason || undefined,
    });
  }

  if (args.externalLate) {
    signals.push({
      key: "external-late",
      tone: "warning",
      label: "External late",
      tooltip: "External step is past due.",
    });
  }

  const dateSignals = buildDateSignals(args.dates);
  signals.push(...dateSignals);

  const hasAnyDate =
    args.dates.dropDeadDate || args.dates.customerTargetDate || args.dates.internalTargetDate;
  if (!args.started) {
    const urgentNotStarted =
      hasAnyDate && hasDueSoonOrLate(args.dates);
    signals.push({
      key: "not-started",
      tone: urgentNotStarted ? "warning" : "info",
      label: "Not started",
      tooltip: urgentNotStarted
        ? "No production activity yet and deadline is soon."
        : "No production activity yet.",
    });
  }

  if (!hasAnyDate) {
    signals.push({
      key: "no-date",
      tone: "neutral",
      label: "No target date",
      tooltip: "No drop-dead, customer, or internal target date is set.",
    });
  }

  return signals;
}

export function compareAttentionRows(
  a: AttentionSortRow,
  b: AttentionSortRow,
  sort: ProductionAttentionSort
): number {
  if (sort === "priority") {
    const aKey = priorityKey(a);
    const bKey = priorityKey(b);
    if (aKey.rank !== bKey.rank) return aKey.rank - bKey.rank;
    if (aKey.days !== bKey.days) return aKey.days - bKey.days;
    return (a.jobId ?? 0) - (b.jobId ?? 0) || a.assemblyId - b.assemblyId;
  }
  if (sort === "deadline") {
    const aNearest = nearestDays(a);
    const bNearest = nearestDays(b);
    if (aNearest !== bNearest) return aNearest - bNearest;
    return a.assemblyId - b.assemblyId;
  }
  if (sort === "customer") {
    const aName = (a.customerName || "").toLowerCase();
    const bName = (b.customerName || "").toLowerCase();
    if (aName !== bName) return aName.localeCompare(bName);
    return a.assemblyId - b.assemblyId;
  }
  if (sort === "job") {
    const aCode = (a.jobCode || "").toLowerCase();
    const bCode = (b.jobCode || "").toLowerCase();
    if (aCode !== bCode) return aCode.localeCompare(bCode);
    return a.assemblyId - b.assemblyId;
  }
  if (sort === "newest") {
    const aTime = a.createdAt ? a.createdAt.getTime() : 0;
    const bTime = b.createdAt ? b.createdAt.getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.assemblyId - b.assemblyId;
  }
  if (sort === "oldest") {
    const aTime = a.createdAt ? a.createdAt.getTime() : 0;
    const bTime = b.createdAt ? b.createdAt.getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.assemblyId - b.assemblyId;
  }
  return a.assemblyId - b.assemblyId;
}

function priorityKey(row: AttentionSortRow): { rank: number; days: number } {
  const steps: Array<{ days: number | null; overdueRank: number; dueRank: number }> = [
    { days: row.daysToDropDead, overdueRank: 0, dueRank: 1 },
    { days: row.daysToCustomer, overdueRank: 2, dueRank: 3 },
    { days: row.daysToInternal, overdueRank: 4, dueRank: 5 },
  ];
  for (const step of steps) {
    if (step.days == null) continue;
    if (step.days < 0) return { rank: step.overdueRank, days: step.days };
    if (step.days <= ATTENTION_DUE_SOON_DAYS) return { rank: step.dueRank, days: step.days };
  }
  if (!row.started) {
    return { rank: 6, days: nearestDays(row) };
  }
  return { rank: 7, days: nearestDays(row) };
}

function nearestDays(row: AttentionSortRow): number {
  const values = [row.daysToDropDead, row.daysToCustomer, row.daysToInternal].filter(
    (value): value is number => value != null && Number.isFinite(value)
  );
  if (!values.length) return 9999;
  return Math.min(...values);
}

function buildDateSignals(dates: ProductionAttentionDates): ProductionAttentionSignal[] {
  const signals: ProductionAttentionSignal[] = [];
  const entries: Array<{
    key: string;
    label: string;
    date: Date | null;
    days: number | null;
  }> = [
    {
      key: "drop-dead",
      label: "Drop-dead",
      date: dates.dropDeadDate,
      days: dates.daysToDropDead,
    },
    {
      key: "customer-target",
      label: "Customer target",
      date: dates.customerTargetDate,
      days: dates.daysToCustomer,
    },
    {
      key: "internal-target",
      label: "Internal target",
      date: dates.internalTargetDate,
      days: dates.daysToInternal,
    },
  ];
  entries.forEach((entry) => {
    if (!entry.date || entry.days == null) return;
    if (entry.days < 0) {
      signals.push({
        key: `${entry.key}-overdue`,
        tone: "warning",
        label: `${entry.label} overdue`,
        tooltip: formatDateTooltip(entry.date, entry.days),
      });
    } else if (entry.days <= ATTENTION_DUE_SOON_DAYS) {
      signals.push({
        key: `${entry.key}-soon`,
        tone: "info",
        label: `${entry.label} due soon`,
        tooltip: formatDateTooltip(entry.date, entry.days),
      });
    }
  });
  return signals;
}

function formatHoldDetail(
  scope: string,
  isOn: boolean,
  type?: string | null,
  reason?: string | null
): string | null {
  if (!isOn) return null;
  const cleanType = type ? String(type).toUpperCase() : null;
  const cleanReason = reason ? String(reason).trim() : "";
  if (cleanType && cleanReason) return `${scope} hold: ${cleanType} — ${cleanReason}`;
  if (cleanType) return `${scope} hold: ${cleanType}`;
  if (cleanReason) return `${scope} hold: ${cleanReason}`;
  return `${scope} hold`;
}

function formatDateTooltip(date: Date, days: number) {
  const label = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const suffix =
    days === 0 ? "today" : days === 1 ? "in 1 day" : days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`;
  return `${label} (${suffix})`;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
