import type { MaterialDemandSource, ProductType } from "@prisma/client";
import type { AssemblyRollup } from "~/modules/production/services/rollups.server";

export type MaterialDemandRow = {
  id: number;
  assemblyId: number;
  productId: number;
  productName: string | null;
  productType?: ProductType | string | null;
  costingId: number | null;
  qtyRequired: number | null;
  uom: string | null;
  source: MaterialDemandSource | null;
  calc?: {
    orderQty?: number | null;
    orderQtySource?: string | null;
    orderQtyCandidates?: {
      qtyOrderedBreakdown?: number | null;
      assemblyQuantity?: number | null;
    } | null;
    cutGoodQty?: number | null;
    remainingToCut?: number | null;
    qtyPerUnit?: number | null;
    stage?: string | null;
    status?: string | null;
    statusHint?: string | null;
  };
};

export type CostingLite = {
  id: number;
  productId: number | null;
  quantityPerUnit: any;
  activityUsed?: string | null;
  flagIsDisabled?: boolean | null;
  product?: {
    id: number;
    name: string | null;
    type?: ProductType | string | null;
    stockTrackingEnabled?: boolean | null;
  } | null;
};

export type AssemblyDemandInput = {
  id: number;
  quantity?: any;
  qtyOrderedBreakdown?: number[] | null;
  rollup?: AssemblyRollup | null;
  costings?: CostingLite[];
  status?: string | null;
};

export type OrderQtyResolution = {
  orderQty: number;
  source: "qtyOrderedBreakdown" | "assembly.quantity" | "fallback";
  candidates: {
    qtyOrderedBreakdown: number | null;
    assemblyQuantity: number | null;
  };
};

export function resolveAssemblyOrderQty(
  assembly: AssemblyDemandInput
): OrderQtyResolution {
  const breakdownArr = Array.isArray(assembly.qtyOrderedBreakdown)
    ? assembly.qtyOrderedBreakdown
    : null;
  const breakdownQty = breakdownArr
    ? breakdownArr.reduce((sum, qty) => sum + (Number(qty) || 0), 0)
    : null;
  const assemblyQty = toNumber(assembly.quantity);

  if (breakdownArr && breakdownArr.length > 0) {
    return {
      orderQty: breakdownQty ?? 0,
      source: "qtyOrderedBreakdown",
      candidates: {
        qtyOrderedBreakdown: breakdownQty,
        assemblyQuantity: assemblyQty,
      },
    };
  }
  if (assemblyQty != null) {
    return {
      orderQty: assemblyQty,
      source: "assembly.quantity",
      candidates: {
        qtyOrderedBreakdown: breakdownQty,
        assemblyQuantity: assemblyQty,
      },
    };
  }
  return {
    orderQty: 0,
    source: "fallback",
    candidates: {
      qtyOrderedBreakdown: breakdownQty,
      assemblyQuantity: assemblyQty,
    },
  };
}

export function buildDerivedDemandRows(
  assembly: AssemblyDemandInput
): MaterialDemandRow[] {
  const costings = assembly.costings || [];
  if (!costings.length) return [];
  const rollup = assembly.rollup ?? null;
  const orderQtyResolution = resolveAssemblyOrderQty(assembly);
  const orderQty = orderQtyResolution.orderQty ?? 0;
  const cutGoodQty = toNumber(rollup?.cutGoodQty) ?? 0;
  const isStatusFullyCut =
    (assembly.status || "").toString().toUpperCase() === "FULLY_CUT";
  const remainingToCut = isStatusFullyCut
    ? 0
    : Math.max(orderQty - cutGoodQty, 0);

  console.log("[material-demand]", {
    assemblyId: assembly.id,
    orderQty,
    orderQtySource: orderQtyResolution.source,
    orderQtyCandidates: orderQtyResolution.candidates,
    cutGoodQty,
    remainingToCut,
    costings: costings.map((costing) => ({
      id: costing.id,
      productId: costing.productId ?? costing.product?.id ?? null,
      qtyPerUnit: costing.quantityPerUnit,
      enabled: costing.flagIsDisabled !== true,
      productType: costing.product?.type ?? null,
      stockTracked: costing.product?.stockTrackingEnabled ?? null,
      consumptionStage: costing.activityUsed ?? null,
    })),
  });

  const rows: MaterialDemandRow[] = [];

  costings.forEach((costing) => {
    if (!isEligibleCosting(costing)) return;
    const productId = costing.productId ?? costing.product?.id ?? null;
    if (!productId) return;
    const perUnit = toNumber(costing.quantityPerUnit);
    if (perUnit == null || perUnit <= 0) return;

    const type = normalizeType(costing.product?.type);
    const stage = (costing.activityUsed || "").toLowerCase();
    const baseQty =
      type === "FABRIC" ? remainingToCut : orderQty || remainingToCut || orderQty;
    if (type === "FABRIC" && remainingToCut === 0) {
      // Fully cut; skip fabric demand.
      return;
    }
    if (type === "TRIM" && stage && !(stage === "sew" || stage === "finish")) {
      return;
    }
    if (type === "FABRIC" && stage && stage !== "cut") {
      return;
    }

    const qtyRequired =
      baseQty && Number.isFinite(baseQty) ? perUnit * baseQty : perUnit;
    if (qtyRequired <= 0) return;

    rows.push({
      id: Number.MAX_SAFE_INTEGER, // derived
      assemblyId: assembly.id,
      productId,
      productName: costing.product?.name ?? null,
      productType: type,
      costingId: costing.id,
      qtyRequired,
      uom: null,
      source: "BOM" as MaterialDemandSource,
      calc: {
        orderQty,
        orderQtySource: orderQtyResolution.source,
        orderQtyCandidates: orderQtyResolution.candidates,
        cutGoodQty,
        remainingToCut,
        qtyPerUnit: perUnit,
        stage,
        status: assembly.status ?? null,
        statusHint: isStatusFullyCut
          ? "Status FULLY_CUT → remainingToCut=0"
          : null,
      },
    });
  });

  return rows;
}

function isEligibleCosting(costing: CostingLite) {
  if (!costing) return false;
  if (costing.flagIsDisabled === true) return false;
  const product = costing.product;
  if (!product) return false;
  if (product.stockTrackingEnabled !== true) return false;
  const type = normalizeType(product.type);
  return (
    type === "FABRIC" || type === "TRIM" || type === "PACKAGING" || type === "RAW"
  );
}

function normalizeType(
  type: ProductType | string | null | undefined
): string | null {
  return type ? type.toString().toUpperCase() : null;
}

function toNumber(value: any): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
