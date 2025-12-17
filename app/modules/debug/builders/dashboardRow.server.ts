import type { DebugExplainPayload } from "~/modules/debug/types";
import {
  fetchDashboardRows,
  type LoaderAssembly,
} from "~/modules/production/services/production.dashboard.server";
import { getDebugVersion, capArray } from "~/modules/debug/debugUtils.server";

export async function buildDashboardRowDebug(
  assemblyId: number
): Promise<DebugExplainPayload | null> {
  const rows = await fetchDashboardRows([assemblyId]);
  const assembly = rows[0];
  if (!assembly) return null;

  const coverage = assembly.materialCoverage;
  const materials = coverage?.materials ?? [];
  const [overReservedLines, blockedLines] = collectReservationIssues(materials);
  const materialSummaries = materials.map((material) => ({
    productId: material.productId,
    productName: material.productName,
    productType: material.productType,
    qtyRequired: material.qtyRequired,
    qtyUncovered: material.qtyUncovered,
    qtyUncoveredAfterTolerance: material.qtyUncoveredAfterTolerance,
    tolerance: material.tolerance,
    status: material.status,
    calc: material.calc,
    reservations: material.reservations.map((res) => ({
      id: res.id,
      type: res.type,
      purchaseOrderLineId: res.purchaseOrderLineId,
      inventoryBatchId: res.inventoryBatchId,
      qtyReserved: res.qtyReserved,
      qtyExpected: res.qtyExpected,
      reservedTotal: res.reservedTotal,
      unreceivedExpected: res.unreceivedExpected,
      overReserved: res.overReserved,
      status: res.status,
      dueSoon: res.dueSoon,
      reason: res.reason,
      etaDate: res.etaDate,
      settledAt: res.settledAt,
    })),
  }));

  const { items: cappedMaterials, truncated } = capArray(materialSummaries);

  const reasoning: DebugExplainPayload["reasoning"] = [];
  if (overReservedLines.length) {
    reasoning.push({
      code: "OVER_RESERVED",
      label: "Over-reserved",
      why: "Reserved exceeds expected on at least one PO line.",
      evidence: { lines: overReservedLines },
    });
  }
  if (blockedLines.length) {
    reasoning.push({
      code: "ETA_BLOCKED",
      label: "ETA blocked",
      why: "Expected supply is missing or late relative to the needed date.",
      evidence: { lines: blockedLines },
    });
  }
  if (coverage?.held) {
    reasoning.push({
      code: "PO_HOLD",
      label: "PO hold",
      why:
        coverage.reasons?.[0]?.message ??
        "Coverage logic marked this assembly as held.",
      evidence: { reasons: coverage.reasons ?? [] },
    });
  }
  const hasDueSoon = materials.some((m) => m.status === "DUE_SOON");
  if (hasDueSoon) {
    reasoning.push({
      code: "DUE_SOON",
      label: "Due soon",
      why: "Coverage is blocked by an ETA that is within the due-soon window.",
    });
  }
  const hasUndercut = materials.some((m) => m.status === "POTENTIAL_UNDERCUT");
  if (hasUndercut) {
    reasoning.push({
      code: "POTENTIAL_UNDERCUT",
      label: "Within tolerance",
      why: "Uncovered qty is fully covered by tolerance.",
    });
  }
  if (assembly.risk.hasExternalLate) {
    reasoning.push({
      code: "EXTERNAL_LATE",
      label: "External step late",
      why: "At least one external step has passed its ETA without receipt.",
    });
  } else if (assembly.risk.externalDueSoon) {
    reasoning.push({
      code: "EXTERNAL_DUE_SOON",
      label: "External step due soon",
      why: "Nearest external ETA is within the due-soon window.",
    });
  }

  const targetDate = assembly.job?.targetDate ?? assembly.job?.dropDeadDate ?? null;

  const jobId = assembly.job?.id ?? null;

  return {
    context: {
      module: "dashboard",
      entity: { type: "Assembly", id: assembly.id },
      generatedAt: new Date().toISOString(),
      version: getDebugVersion(),
    },
    rollups: {
      cutGoodQty: assembly.rollup?.cutGoodQty ?? null,
      sewGoodQty: assembly.rollup?.sewGoodQty ?? null,
      finishGoodQty: assembly.rollup?.finishGoodQty ?? null,
      packedQty: assembly.rollup?.packedQty ?? null,
      readyToPackQty: assembly.rollup?.readyToPackQty ?? null,
    },
    inputs: {
      jobId: assembly.job?.id ?? null,
      jobTargetDate: targetDate,
      jobStatus: assembly.status ?? null,
      productName: assembly.productName ?? null,
      poLines: assembly.poLines.map((line) => ({
        id: line.id,
        purchaseOrderId: line.purchaseOrderId,
        productId: line.productId,
        etaDate: line.etaDate,
        qtyOrdered: line.qtyOrdered,
        qtyExpected: line.qtyExpected,
        qtyReceived: line.qtyReceived,
        reservedQty: line.reservedQty,
        availableQty: line.availableQty,
      })),
      materialCount: materials.length,
    },
    derived: {
      risk: assembly.risk,
      externalSteps: assembly.externalSteps,
      coverageHeld: coverage?.held ?? false,
      coverageReasons: coverage?.reasons ?? [],
      materials: cappedMaterials,
      materialsTruncated: truncated,
    },
    reasoning,
    links: jobId
      ? [
          {
            label: `Assembly A${assembly.id}`,
            href: `/jobs/${jobId}/assembly/${assembly.id}`,
          },
          { label: `Job ${jobId}`, href: `/jobs/${jobId}` },
        ]
      : [],
  };
}

function collectReservationIssues(
  materials: NonNullable<LoaderAssembly["materialCoverage"]>["materials"]
) {
  const overReservedMap = new Map<number, any>();
  const blockedMap = new Map<number, any>();
  materials.forEach((material) => {
    material.reservations.forEach((res) => {
      if (res.type !== "PO" || !res.purchaseOrderLineId || res.settledAt) return;
      const lineId = res.purchaseOrderLineId;
      if (res.overReserved != null && res.overReserved > 0) {
        const prior = overReservedMap.get(lineId);
        if (!prior || res.overReserved > prior.overReserved) {
          overReservedMap.set(lineId, {
            lineId,
            expected: res.qtyExpected ?? null,
            reserved: res.reservedTotal ?? null,
            overReserved: res.overReserved,
          });
        }
      }
      if (res.status === "BLOCKED") {
        if (!blockedMap.has(lineId)) {
          blockedMap.set(lineId, {
            lineId,
            reason: res.reason ?? null,
            etaDate: res.etaDate ?? null,
            unreceivedExpected: res.unreceivedExpected ?? null,
          });
        }
      }
    });
  });
  return [Array.from(overReservedMap.values()), Array.from(blockedMap.values())];
}
