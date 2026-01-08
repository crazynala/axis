import type { LoaderAssembly } from "~/modules/production/services/production.dashboard.server";
import {
  loadDashboardData,
} from "~/modules/production/services/production.dashboard.server";
import { buildProductionAttentionRows } from "~/modules/production/services/production.attention.server";
import type { ProductionAttentionFilters } from "~/modules/production/services/production.attention.logic";
import type { ProductionLedgerRow } from "~/modules/production/services/productionLedger.server";
import type { MaterialCoverageItem } from "~/modules/production/services/materialCoverage.server";

const DEFAULT_TAKE = 50000;

type BuiltInViewId =
  | "at-risk"
  | "out-at-vendor"
  | "needs-action"
  | "materials-short";

const defaultAttentionFilters: ProductionAttentionFilters = {
  includeHeld: true,
  onlyNotStarted: false,
  onlyDueSoon: false,
  onlyBlocked: false,
};

const nextActionPriority: Record<string, number> = {
  FOLLOW_UP_VENDOR: 0,
  RESOLVE_PO: 1,
  SEND_OUT: 2,
};

export async function loadProductionLedgerBuiltInView(options: {
  viewId: BuiltInViewId;
  q?: string | null;
  take?: number;
}) {
  const { viewId, q } = options;
  const take = options.take ?? DEFAULT_TAKE;
  const data = await loadDashboardData(take);
  const assemblies = data.assemblies || [];
  const assembliesById = new Map<number, LoaderAssembly>();
  assemblies.forEach((assembly) => assembliesById.set(assembly.id, assembly));

  const attentionRows = await buildProductionAttentionRows({
    assemblies,
    filters: defaultAttentionFilters,
    sort: "priority",
    defaultLeadDays: data.defaultLeadDays,
    bufferDays: data.bufferDays,
    escalationBufferDays: data.escalationBufferDays,
  });

  let rows: ProductionLedgerRow[] = [];

  if (viewId === "at-risk") {
    rows = attentionRows
      .map((row) => {
        const assembly = assembliesById.get(row.assemblyId);
        if (!assembly) return null;
        return buildLedgerRowFromAssembly(assembly, {
          attentionSignals: row.attentionSignals,
        });
      })
      .filter(Boolean) as ProductionLedgerRow[];
  } else if (viewId === "out-at-vendor") {
    rows = assemblies
      .flatMap((assembly) =>
        (assembly.externalSteps || [])
          .filter((step) => step.status === "IN_PROGRESS")
          .map((step) => ({
            assembly,
            step,
          }))
      )
      .sort((a, b) => {
        const aTime = stepTime(a.step.etaDate);
        const bTime = stepTime(b.step.etaDate);
        if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
          return aTime - bTime;
        }
        if (Number.isFinite(aTime)) return -1;
        if (Number.isFinite(bTime)) return 1;
        return a.assembly.id - b.assembly.id;
      })
      .map(({ assembly, step }) =>
        buildLedgerRowFromAssembly(assembly, {
          externalStepLabel: step.label ?? null,
          externalVendorName: step.vendor?.name ?? null,
          externalEta: step.etaDate ?? null,
        })
      );
  } else if (viewId === "needs-action") {
    rows = assemblies
      .filter((assembly) => (assembly.risk?.nextActions || []).length > 0)
      .map((assembly) =>
        buildLedgerRowFromAssembly(assembly, {
          nextActions: assembly.risk?.nextActions || [],
        })
      )
      .sort((a, b) => {
        const aRank = actionRank(a.nextActions);
        const bRank = actionRank(b.nextActions);
        if (aRank !== bRank) return aRank - bRank;
        return a.id - b.id;
      });
  } else if (viewId === "materials-short") {
    rows = assemblies
      .map((assembly) => {
        const materials = assembly.materialCoverage?.materials || [];
        const { shortCount, uncoveredTotal, rank } =
          summarizeMaterialsShort(materials);
        if (!shortCount) return null;
        return buildLedgerRowFromAssembly(assembly, {
          materialsShortCount: shortCount,
          materialsUncoveredTotal: uncoveredTotal,
          materialsShortRank: rank,
        });
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const rankDiff = (a.materialsShortRank ?? 99) - (b.materialsShortRank ?? 99);
        if (rankDiff !== 0) return rankDiff;
        const diff =
          (b.materialsUncoveredTotal ?? 0) - (a.materialsUncoveredTotal ?? 0);
        if (diff !== 0) return diff;
        return a.id - b.id;
      })
      .map((row: any) => {
        const { materialsShortRank: _rank, ...rest } = row;
        return rest as ProductionLedgerRow;
      });
  }

  const filtered = filterRowsByQuery(rows, q);
  return {
    rows: filtered,
    idList: filtered.map((row) => row.id),
  };
}

function buildLedgerRowFromAssembly(
  assembly: LoaderAssembly,
  extras?: Partial<ProductionLedgerRow> & { materialsShortRank?: number }
): ProductionLedgerRow & { materialsShortRank?: number } {
  const ordered = Array.isArray(assembly.qtyOrderedBreakdown)
    ? assembly.qtyOrderedBreakdown.reduce(
        (t, n) => t + (Number(n) || 0),
        0
      )
    : Number(assembly.quantity ?? 0) || 0;
  const rollup = assembly.rollup;
  return {
    id: assembly.id,
    name: assembly.name ?? null,
    assemblyType: assembly.assemblyType ?? null,
    jobId: assembly.job?.id ?? null,
    projectCode: assembly.job?.projectCode ?? null,
    jobName: assembly.job?.name ?? null,
    customerName: assembly.job?.customerName ?? null,
    primaryCostingName: assembly.productName ?? null,
    ordered,
    cut: Number(rollup?.cutGoodQty ?? 0) || 0,
    sew: Number(rollup?.sewGoodQty ?? 0) || 0,
    finish: Number(rollup?.finishGoodQty ?? 0) || 0,
    pack: Number(rollup?.packedQty ?? 0) || 0,
    attentionSignals: extras?.attentionSignals,
    nextActions: extras?.nextActions ?? assembly.risk?.nextActions ?? [],
    externalStepLabel: extras?.externalStepLabel ?? null,
    externalVendorName: extras?.externalVendorName ?? null,
    externalEta: extras?.externalEta ?? null,
    materialsShortCount: extras?.materialsShortCount,
    materialsUncoveredTotal: extras?.materialsUncoveredTotal,
    materialsShortRank: extras?.materialsShortRank,
  };
}

function actionRank(actions?: ProductionLedgerRow["nextActions"]) {
  if (!actions?.length) return 99;
  let min = 99;
  actions.forEach((action) => {
    const rank = nextActionPriority[action.kind] ?? 50;
    if (rank < min) min = rank;
  });
  return min;
}

function filterRowsByQuery(rows: ProductionLedgerRow[], q?: string | null) {
  if (!q) return rows;
  const value = q.trim().toLowerCase();
  if (!value) return rows;
  return rows.filter((row) => {
    const hay = [
      row.name,
      row.projectCode,
      row.jobName,
      row.customerName,
      row.primaryCostingName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(value);
  });
}

function stepTime(eta: string | null | undefined) {
  if (!eta) return Number.NaN;
  const parsed = new Date(eta).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function summarizeMaterialsShort(materials: MaterialCoverageItem[]) {
  let shortCount = 0;
  let uncoveredTotal = 0;
  let rank = 6;
  let poHoldCount = 0;
  let dueSoonCount = 0;
  let withinToleranceCount = 0;
  let hasDemand = false;
  materials.forEach((material) => {
    const required = material.qtyRequired ?? 0;
    if (required > 0) {
      hasDemand = true;
      if (material.status === "PO_HOLD") poHoldCount += 1;
      else if (material.status === "DUE_SOON") dueSoonCount += 1;
      else if (material.status === "POTENTIAL_UNDERCUT")
        withinToleranceCount += 1;
    }
    const uncovered = Number(material.qtyUncovered ?? 0) || 0;
    if (uncovered > 0) {
      shortCount += 1;
      uncoveredTotal += uncovered;
    }
  });
  if (poHoldCount > 0) rank = 2;
  else if (dueSoonCount > 0) rank = 3;
  else if (withinToleranceCount > 0) rank = 4;
  else if (hasDemand) rank = 5;
  return { shortCount, uncoveredTotal, rank };
}
