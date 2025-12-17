import type {
  DerivedExternalStep,
  ExternalLeadTimeSource,
} from "~/modules/job/types/externalSteps";
import type { AssemblyRollup } from "./rollups.server";
import type { AssemblyMaterialCoverage } from "./materialCoverage.server";

export type RiskAssemblyInput = {
  id: number;
  jobId: number | null;
  jobTargetDate: Date | null;
};

export type PurchaseOrderLineSummary = {
  id: number;
  etaDate: Date | null;
  productId?: number | null;
  purchaseOrderId?: number | null;
  qtyOrdered: number;
  qtyExpected: number;
  qtyReceived: number;
  reservedQty?: number;
  availableQty?: number;
};

export type NextAction =
  | { kind: "SEND_OUT"; label: string; detail?: string | null }
  | { kind: "FOLLOW_UP_VENDOR"; label: string; detail?: string | null }
  | { kind: "RESOLVE_PO"; label: string; detail?: string | null };

export type VendorStepInfo = {
  assemblyId: number;
  jobId: number | null;
  stepLabel: string;
  vendorName: string | null;
  etaDate: string | null;
  etaSource: ExternalLeadTimeSource | null;
};

export type AssemblyRiskSignals = {
  assemblyId: number;
  externalEta: string | null;
  externalEtaSource: ExternalLeadTimeSource | null;
  externalEtaStepLabel: string | null;
  hasExternalLate: boolean;
  externalDueSoon: boolean;
  poHold: boolean;
  poHoldReason: string | null;
  poBlockingEta: string | null;
  poBlockingLineId: number | null;
  nextActions: NextAction[];
  vendorSteps: VendorStepInfo[];
};

const DUE_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function buildRiskSignals(options: {
  assemblies: RiskAssemblyInput[];
  rollups: Map<number, AssemblyRollup>;
  externalStepsByAssembly: Record<number, DerivedExternalStep[] | undefined>;
  purchaseOrdersByAssembly: Map<number, PurchaseOrderLineSummary[]>;
  materialCoverage?: Map<number, AssemblyMaterialCoverage>;
  today?: Date;
}): Map<number, AssemblyRiskSignals> {
  const today = options.today ?? new Date();
  const todayStart = startOfDay(today);
  const result = new Map<number, AssemblyRiskSignals>();

  for (const assembly of options.assemblies) {
    const rollup = options.rollups.get(assembly.id);
    const steps = options.externalStepsByAssembly[assembly.id] || [];
    const poLines =
      options.purchaseOrdersByAssembly.get(assembly.id) || [];

    const openSteps = steps.filter(
      (step) => step.status === "NOT_STARTED" || step.status === "IN_PROGRESS"
    );
    const openStepsWithEta = openSteps
      .filter((step) => step.etaDate)
      .sort((a, b) => {
        const aTime = toDate(a.etaDate).getTime();
        const bTime = toDate(b.etaDate).getTime();
        const aValid = Number.isFinite(aTime);
        const bValid = Number.isFinite(bTime);
        if (!aValid && !bValid) return 0;
        if (!aValid) return 1;
        if (!bValid) return -1;
        return aTime - bTime;
      });
    const nearestEta = openStepsWithEta[0] || null;
    const hasExternalLate = steps.some((step) => step.isLate);
    const externalDueSoon =
      nearestEta && !nearestEta.isLate
        ? isDueSoon(toDate(nearestEta.etaDate), todayStart)
        : false;

    const nextActions: NextAction[] = [];
    if ((rollup?.cutGoodQty ?? 0) > 0) {
      steps.forEach((step) => {
        if (step.expected && step.status === "NOT_STARTED") {
          nextActions.push({
            kind: "SEND_OUT",
            label: `Send ${step.label} out`,
          });
        }
      });
    }
    steps.forEach((step) => {
      if (step.status === "IN_PROGRESS" && step.isLate) {
        nextActions.push({
          kind: "FOLLOW_UP_VENDOR",
          label: `Follow up vendor for ${step.label}`,
          detail: step.vendor?.name ?? null,
        });
      }
    });

    const coverage = options.materialCoverage?.get(assembly.id) ?? null;
    const poEval =
      coverage ??
      evaluatePoLines({
        lines: poLines,
        targetDate: assembly.jobTargetDate,
        todayStart,
      });
    if (
      "poNextActions" in poEval &&
      Array.isArray((poEval as any).poNextActions)
    ) {
      nextActions.push(...((poEval as any).poNextActions as NextAction[]));
    }
    if (coverage?.held) {
      coverage.materials.forEach((material) => {
        if (
          material.status === "PO_HOLD" &&
          (material.qtyUncoveredAfterTolerance ?? material.qtyUncovered) > 0
        ) {
          nextActions.push({
            kind: "RESOLVE_PO",
            label: `Assign PO for ${material.productName ?? "material"}`,
            detail: `Uncovered ${formatQty(
              material.qtyUncoveredAfterTolerance ?? material.qtyUncovered
            )} (raw ${formatQty(material.qtyUncovered)})`,
          });
        }
        material.reservations
          .filter((r) => r.type === "PO" && r.status === "BLOCKED")
          .forEach((r) => {
            if (!r.purchaseOrderLineId) return;
            nextActions.push({
              kind: "RESOLVE_PO",
              label: `Resolve ${formatPoLineLabel(
                r.purchaseOrderId,
                r.purchaseOrderLineId
              )}`,
              detail: r.reason,
            });
          });
      });
    }

    const vendorSteps = steps
      .filter((step) => step.status === "IN_PROGRESS")
      .map((step) => ({
        assemblyId: assembly.id,
        jobId: assembly.jobId,
        stepLabel: step.label,
        vendorName: step.vendor?.name ?? null,
        etaDate: step.etaDate,
        etaSource: step.leadTimeSource ?? null,
      }));

    result.set(assembly.id, {
      assemblyId: assembly.id,
      externalEta: nearestEta?.etaDate ?? null,
      externalEtaSource: nearestEta?.leadTimeSource ?? null,
      externalEtaStepLabel: nearestEta?.label ?? null,
      hasExternalLate,
      externalDueSoon,
      poHold:
        "held" in poEval
          ? (poEval as AssemblyMaterialCoverage).held
          : poEval.poHold,
      poHoldReason:
        "reasons" in poEval && poEval.reasons.length
          ? poEval.reasons[0]?.message ?? null
          : (poEval as any).poHoldReason ?? null,
      poBlockingEta:
        "materials" in poEval
          ? findBlockingEta(poEval as AssemblyMaterialCoverage)
          : (poEval as any).poBlockingEta ?? null,
      poBlockingLineId:
        "materials" in poEval
          ? findBlockingLineId(poEval as AssemblyMaterialCoverage)
          : (poEval as any).poBlockingLineId ?? null,
      nextActions,
      vendorSteps,
    });
  }

  return result;
}

function evaluatePoLines({
  lines,
  targetDate,
  todayStart,
}: {
  lines: PurchaseOrderLineSummary[];
  targetDate: Date | null;
  todayStart: Date;
}) {
  const outstanding = lines
    .map((line) => ({
      line,
      outstanding: Math.max(line.qtyExpected - line.qtyReceived, 0),
    }))
    .filter((entry) => entry.outstanding > 0);

  const blocking = outstanding
    .map(({ line }) => {
      const eta = line.etaDate;
      const missingEta = !eta;
      const pastDue = eta ? eta.getTime() < todayStart.getTime() : false;
      const afterTarget =
        eta && targetDate ? eta.getTime() > targetDate.getTime() : false;
      return { line, eta, missingEta, pastDue, afterTarget };
    })
    .filter((info) => info.missingEta || info.pastDue || info.afterTarget);

  const poHold = blocking.length > 0;
  let poHoldReason: string | null = null;
  let poBlockingEta: string | null = null;
  let poBlockingLineId: number | null = null;
  const poNextActions: NextAction[] = [];

  if (blocking.length) {
    blocking.sort((a, b) => {
      const aTime = a.eta ? a.eta.getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.eta ? b.eta.getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });
    const focus = blocking[0];
    poBlockingLineId = focus.line.id;
    if (focus.eta) {
      poBlockingEta = focus.eta.toISOString();
    }
    const focusLabel = formatPoLineLabel(
      focus.line.purchaseOrderId,
      focus.line.id
    );
    if (focus.missingEta) {
      poHoldReason = `Missing ETA on ${focusLabel}`;
    } else if (focus.pastDue) {
      poHoldReason = `${focusLabel} past ETA`;
    } else if (focus.afterTarget) {
      poHoldReason = `${focusLabel} arrives after target`;
    }
    blocking.forEach((info) => {
      let detail: string | null = null;
      if (info.missingEta) detail = "ETA missing";
      else if (info.pastDue)
        detail = `ETA ${formatShort(info.eta)} past due`;
      else if (info.afterTarget)
        detail = `ETA ${formatShort(info.eta)} after target`;
      poNextActions.push({
        kind: "RESOLVE_PO",
        label: `Resolve ${formatPoLineLabel(
          info.line.purchaseOrderId,
          info.line.id
        )}`,
        detail,
      });
    });
  }

  return {
    poHold,
    poHoldReason,
    poBlockingEta,
    poBlockingLineId,
    poNextActions,
  };
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function findBlockingEta(coverage: AssemblyMaterialCoverage): string | null {
  for (const material of coverage.materials) {
    const blocked = material.reservations.find(
      (r) => r.type === "PO" && r.status === "BLOCKED" && r.etaDate
    );
    if (blocked?.etaDate) return blocked.etaDate;
  }
  return null;
}

function findBlockingLineId(
  coverage: AssemblyMaterialCoverage
): number | null {
  for (const material of coverage.materials) {
    const blocked = material.reservations.find(
      (r) => r.type === "PO" && r.status === "BLOCKED"
    );
    if (blocked?.purchaseOrderLineId) return blocked.purchaseOrderLineId;
  }
  return null;
}

function formatQty(value: number | string | null | undefined) {
  if (value == null) return "0";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "0";
  const rounded = Math.round(num * 100) / 100;
  return `${rounded}`;
}

function toDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date(NaN);
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return date;
}

function isDueSoon(eta: Date, todayStart: Date) {
  if (!Number.isFinite(eta.getTime())) return false;
  const diff = eta.getTime() - todayStart.getTime();
  return diff >= 0 && diff <= DUE_SOON_WINDOW_MS;
}

function formatShort(date: Date | null) {
  if (!date || !Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatPoLineLabel(
  purchaseOrderId: number | null | undefined,
  lineId: number | null | undefined
) {
  if (purchaseOrderId && lineId) return `PO #${purchaseOrderId}, Line #${lineId}`;
  if (lineId) return `PO line #${lineId}`;
  if (purchaseOrderId) return `PO #${purchaseOrderId}`;
  return "PO line";
}
