import { prisma } from "~/utils/prisma.server";
import type { PendingCostingItem } from "./types";

export async function getCostingsPendingInvoicing(
  customerId: number | null | undefined
): Promise<PendingCostingItem[]> {
  if (!customerId) return [];
  const costings = await prisma.costing.findMany({
    where: {
      assembly: { job: { companyId: customerId } },
    },
    include: {
      product: { select: { type: true, name: true } },
      assembly: { select: { id: true, name: true, jobId: true } },
    },
  });

  const assemblyIds = Array.from(
    new Set(
      costings
        .map((c) => c.assembly?.id)
        .filter((id): id is number => Number.isFinite(id as any))
    )
  );
  const assemblies = assemblyIds.length
    ? await prisma.assembly.findMany({
        where: { id: { in: assemblyIds } },
        select: {
          id: true,
          name: true,
          jobId: true,
          status: true,
          job: {
            select: {
              projectCode: true,
              stockLocationId: true,
              company: {
                select: {
                  stockLocationId: true,
                  invoicePercentOnCut: true,
                  invoicePercentOnOrder: true,
                  invoiceBillUpon: true,
                },
              },
            },
          },
        },
      })
    : [];
  const assemblyById = new Map<number, any>();
  assemblies.forEach((a) => assemblyById.set(a.id, a));

  const results: PendingCostingItem[] = [];
  for (const costing of costings) {
    if ((costing as any).flagIsDisabled) continue;
    if (costing.flagIsInvoiceableManual === false) continue;
    const assembly = costing.assembly?.id
      ? assemblyById.get(costing.assembly.id) || costing.assembly
      : costing.assembly;
    const costingWithAssembly = { ...costing, assembly };
    const billable = await isCostingBillable(costingWithAssembly);
    if (!billable) continue;
    const { invoiceable, debug } = computeInvoiceableUnits(costingWithAssembly);
    if (!invoiceable) continue;
    const invoiced = await prisma.invoiceLine.aggregate({
      where: { costingId: costing.id },
      _sum: { quantity: true },
    });
    const unitsInvoiced = Number(invoiced._sum.quantity ?? 0) || 0;
    const unitsPending = invoiceable - unitsInvoiced;
    if (unitsPending <= 0) continue;
    const unitPriceSuggestion =
      costing.manualSalePrice ?? costing.salePricePerItem ?? null;
    results.push({
      sourceType: "costing",
      costingId: costing.id,
      jobId: assembly?.jobId ?? 0,
      assemblyId: assembly?.id ?? 0,
      jobProjectCode: assembly?.job?.projectCode ?? null,
      assemblyName:
        assembly?.name || (assembly?.id ? `Assembly ${assembly.id}` : null),
      costingName:
        costing.product?.name ||
        costing.activityUsed ||
        (costing.productId ? `Product ${costing.productId}` : `Costing ${costing.id}`),
      description:
        costing.product?.name ||
        costing.assembly?.name ||
        (costing.assembly?.id ? `Assembly ${costing.assembly.id}` : "Assembly"),
      maxQuantity: unitsPending.toString(),
      alreadyInvoicedQty: unitsInvoiced.toString(),
      defaultQuantity: unitsPending.toString(),
      defaultUnitPrice: unitPriceSuggestion
        ? unitPriceSuggestion.toString()
        : null,
      invoiceCalcDebug: debug,
    });
  }
  return results;
}

function normalizePct(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Support both 0-1 and 0-100 inputs
  return n > 1 ? n / 100 : n;
}

function computeInvoiceableUnits(costing: {
  assembly: {
    quantity?: any;
    c_qtyCut?: number | null;
    c_qtyMake?: number | null;
    c_qtyPack?: number | null;
    c_qtyKeep?: number | null;
    job?: {
      company?: {
        invoicePercentOnCut?: any;
        invoicePercentOnOrder?: any;
        invoiceBillUpon?: any;
      } | null;
    } | null;
  } | null;
}) {
  const rules = costing.assembly?.job?.company;
  const billUpon =
    (rules?.invoiceBillUpon as string | null) === "Make" ? "Make" : "Ship";
  const qtyOrdered = Number(costing.assembly?.quantity ?? 0) || 0;
  const qtyCut = Number((costing.assembly as any)?.c_qtyCut ?? 0) || 0;
  const qtyMake = Number((costing.assembly as any)?.c_qtyMake ?? 0) || 0;
  const qtyPack = Number((costing.assembly as any)?.c_qtyPack ?? 0) || 0;
  const qtyKeep = Number((costing.assembly as any)?.c_qtyKeep ?? 0) || 0;
  const status = ((costing.assembly as any)?.status || "").toString().toUpperCase();
  const flagCutComplete =
    status.includes("FULLY_CUT") || status.includes("COMPLETE") || status.includes("CANCELED");
  const flagComplete = status.includes("COMPLETE") || status.includes("CANCELED");
  const flagShipped = status.includes("SHIP") || qtyPack > 0;

  // FM-aligned logic
  const fullQty =
    !flagShipped && billUpon === "Make"
      ? Math.max(0, qtyMake - qtyKeep)
      : qtyPack;

  let invoiceable = fullQty;

  // Shipped or complete: full qty
  if (!flagShipped && !flagComplete) {
    const pctCut = normalizePct(rules?.invoicePercentOnCut);
    if (pctCut > 0 && qtyCut > 0) {
      const trigger =
        flagCutComplete || fullQty < 0.8 * qtyCut
          ? fullQty + Math.floor(Math.max(0, qtyCut - fullQty) * pctCut)
          : fullQty;
      invoiceable = Math.max(invoiceable, trigger);
    }
    // Percent on order (optional early billing)
    const pctOrder = normalizePct(rules?.invoicePercentOnOrder);
    if (pctOrder > 0 && qtyOrdered > 0) {
      const depositQty = Math.floor(qtyOrdered * pctOrder);
      invoiceable = Math.max(invoiceable, depositQty);
    }
  }

  return {
    invoiceable,
    debug: {
      billUpon,
      qtyOrdered,
      qtyCut,
      qtyMake,
      qtyPack,
      qtyKeep,
      pctCut: normalizePct(rules?.invoicePercentOnCut),
      pctOrder: normalizePct(rules?.invoicePercentOnOrder),
      baseQty: fullQty,
      addFromCut: Math.max(0, invoiceable - fullQty),
      minFromOrder: Math.floor(qtyOrdered * normalizePct(rules?.invoicePercentOnOrder)),
      invoiceable,
      flagCutComplete,
      flagComplete,
      flagShipped,
    },
  };
}

async function isCostingBillable(costing: {
  id: number;
  productId: number | null;
  product?: { type: string | null } | null;
  assembly: {
    id: number | null;
    jobId: number | null;
    job: {
      stockLocationId: number | null;
      company: {
        stockLocationId: number | null;
        invoicePercentOnCut?: any;
        invoicePercentOnOrder?: any;
        invoiceBillUpon?: any;
      } | null;
    } | null;
    c_qtyCut?: number | null;
    c_qtyMake?: number | null;
    c_qtyPack?: number | null;
  } | null;
}): Promise<boolean> {
  const productType = costing.product?.type;
  if (productType === "CMT") return true;

  // Load product type if not already present
  if (!productType && costing.productId) {
    const prod = await prisma.product.findUnique({
      where: { id: costing.productId },
      select: { type: true },
    });
    if (prod?.type === "CMT") return true;
  }

  const customerDepotId =
    costing.assembly?.job?.company?.stockLocationId ?? null;

  // Prefer actual consumption data if present
  const movements = await prisma.productMovementLine.findMany({
    where: { costingId: costing.id },
    select: { batch: { select: { locationId: true } } },
  });

  if (movements.length > 0) {
    const allFromDepot = movements.every((m) => {
      const locId = m.batch?.locationId ?? null;
      return locId != null && customerDepotId != null && locId === customerDepotId;
    });
    return !allFromDepot;
  }

  // Fallback: legacy FM shortcut
  const jobLocationId = costing.assembly?.job?.stockLocationId ?? null;
  if (customerDepotId != null && jobLocationId != null) {
    return jobLocationId !== customerDepotId;
  }

  // Default to billable when in doubt
  return true;
}
