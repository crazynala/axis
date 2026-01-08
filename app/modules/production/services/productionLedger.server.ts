import { prisma } from "~/utils/prisma.server";

export type ProductionLedgerRow = {
  id: number;
  name: string | null;
  assemblyType: string | null;
  jobId: number | null;
  projectCode: string | null;
  jobName: string | null;
  customerName: string | null;
  primaryCostingName: string | null;
  ordered: number;
  cut: number;
  sew: number;
  finish: number;
  pack: number;
  attentionSignals?: Array<{
    key: string;
    tone: "warning" | "info" | "neutral";
    label: string;
    tooltip?: string | null;
  }>;
  nextActions?: Array<{
    kind: string;
    label: string;
    detail?: string | null;
  }>;
  externalStepLabel?: string | null;
  externalVendorName?: string | null;
  externalEta?: string | null;
  materialsShortCount?: number;
  materialsUncoveredTotal?: number;
};

export async function fetchProductionLedgerRows(
  ids: number[]
): Promise<ProductionLedgerRow[]> {
  if (!ids.length) return [];
  const assemblies = await prisma.assembly.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      assemblyType: true,
      qtyOrderedBreakdown: true,
      job: {
        select: {
          id: true,
          projectCode: true,
          name: true,
          company: { select: { name: true } },
        },
      },
      primaryCosting: {
        select: {
          product: { select: { name: true, sku: true } },
          notes: true,
        },
      },
    },
  });

  const activitySums = await prisma.assemblyActivity.groupBy({
    by: ["assemblyId", "stage"],
    where: {
      assemblyId: { in: ids },
      kind: { not: "defect" },
    },
    _sum: { quantity: true },
  });
  const packedSums = await prisma.boxLine.groupBy({
    by: ["assemblyId"],
    where: { assemblyId: { in: ids }, packingOnly: { not: true } },
    _sum: { quantity: true },
  });
  const sumsByAssembly = new Map<number, Record<string, number>>();
  activitySums.forEach((row) => {
    const m = sumsByAssembly.get(row.assemblyId) || {};
    m[row.stage] = Number(row._sum.quantity ?? 0) || 0;
    sumsByAssembly.set(row.assemblyId, m);
  });
  const packedByAssembly = new Map<number, number>();
  packedSums.forEach((row) => {
    if (!row.assemblyId) return;
    packedByAssembly.set(row.assemblyId, Number(row._sum.quantity ?? 0) || 0);
  });

  return assemblies.map((a) => {
    const sums = sumsByAssembly.get(a.id) || {};
    const ordered = Array.isArray(a.qtyOrderedBreakdown)
      ? a.qtyOrderedBreakdown.reduce(
          (t, n) => t + (Number(n) || 0),
          0
        )
      : 0;
    return {
      id: a.id,
      name: a.name,
      assemblyType: a.assemblyType,
      jobId: a.job?.id ?? null,
      projectCode: a.job?.projectCode ?? null,
      jobName: a.job?.name ?? null,
      customerName: a.job?.company?.name ?? null,
      primaryCostingName:
        a.primaryCosting?.product?.name ||
        a.primaryCosting?.product?.sku ||
        null,
      ordered,
      cut: Number(sums.cut ?? 0),
      sew: Number(sums.sew ?? 0),
      finish: Number(sums.finish ?? 0),
      pack: packedByAssembly.get(a.id) ?? 0,
    };
  });
}
