import type { CostingRow } from "~/modules/job/components/AssemblyCostingsTable";

type MinimalCosting = {
  id: number;
  product?: {
    id?: number | null;
    sku?: string | null;
    name?: string | null;
    stockTrackingEnabled?: boolean | null;
    batchTrackingEnabled?: boolean | null;
    salePriceGroup?: { saleRanges?: any[] | null } | null;
    salePriceRanges?: any[] | null;
    pricingModel?: string | null;
    baselinePriceAtMoq?: any;
    transferPercent?: any;
    pricingSpec?: { ranges?: any[] | null } | null;
  } | null;
  productId?: number | null;
  quantityPerUnit?: any;
  unitCost?: any;
  salePricePerItem?: any;
  manualSalePrice?: any;
  manualMargin?: any;
  salePriceGroup?: { saleRanges?: any[] | null } | null;
  activityUsed?: string | null;
  flagIsDisabled?: boolean | null;
  flagDefinedInProduct?: boolean | null;
};

type RequiredInputs = {
  qtyOrdered?: number | null;
  qtyCut?: number | null;
};

export function buildCostingRows(options: {
  assemblyId?: number | null;
  costings: MinimalCosting[];
  requiredInputs: RequiredInputs;
  priceMultiplier?: number | null;
  costingStats?: Record<
    number,
    { allStock: number; locStock: number; used: number }
  >;
}): CostingRow[] {
  const {
    assemblyId,
    costings,
    requiredInputs,
    priceMultiplier,
    costingStats,
  } = options;
  const ordered = Number(requiredInputs.qtyOrdered || 0) || 0;
  const cut = Number(requiredInputs.qtyCut || 0) || 0;
  const priceMult = Number(priceMultiplier ?? 1) || 1;
  return (costings || []).map((c: any) => {
    const pid = c.product?.id || (c as any).productId || null;
    const required = Math.max(
      0,
      (ordered - cut) * Number(c.quantityPerUnit || 0)
    );
    // Sale tiers precedence: costing.salePriceGroup > product.salePriceGroup > product.salePriceRanges
    const tiersFromCosting =
      ((c?.salePriceGroup?.saleRanges || []) as any[]).map((r: any) => ({
        minQty: Number(r.rangeFrom || r.minQty || 1) || 1,
        unitPrice: Number(r.price || r.unitPrice || 0) || 0,
      })) || [];
    const tiersFromProductGroup =
      ((c?.product?.salePriceGroup?.saleRanges || []) as any[]).map(
        (r: any) => ({
          minQty: Number(r.rangeFrom || r.minQty || 1) || 1,
          unitPrice: Number(r.price || r.unitPrice || 0) || 0,
        })
      ) || [];
    const tiersFromProduct =
      ((c?.product?.salePriceRanges || []) as any[]).map((r: any) => ({
        minQty: Number(r.rangeFrom || r.minQty || 1) || 1,
        unitPrice: Number(r.price || r.unitPrice || 0) || 0,
      })) || [];
    const saleTiers = (
      tiersFromCosting.length
        ? tiersFromCosting
        : tiersFromProductGroup.length
        ? tiersFromProductGroup
        : tiersFromProduct
    ).sort((a: any, b: any) => a.minQty - b.minQty);
    const stats = costingStats?.[c.id] || { allStock: 0, locStock: 0, used: 0 };
    const row: CostingRow = {
      id: c.id,
      assemblyId: assemblyId ?? undefined,
      productId: pid,
      stockTrackingEnabled: !!(c.product?.stockTrackingEnabled || false),
      batchTrackingEnabled: !!(c.product?.batchTrackingEnabled || false),
      sku: c.product?.sku || null,
      name: c.product?.name || null,
      productStage: (c.product as any)?.productStage ?? null,
      activityUsed: String((c as any).activityUsed ?? "").toLowerCase(),
      quantityPerUnit: Number(c.quantityPerUnit || 0) || null,
      unitCost: Number(c.unitCost || 0) || null,
      required,
      stats,
      fixedSell: c.salePricePerItem != null ? Number(c.salePricePerItem) : null,
      taxRate: 0,
      saleTiers,
      priceMultiplier: priceMult,
      manualSalePrice:
        c.manualSalePrice != null ? Number(c.manualSalePrice) : null,
      marginPct: c.manualMargin != null ? Number(c.manualMargin) : null,
      pricingModel: c.product?.pricingModel ?? null,
      baselinePriceAtMoq:
        c.product?.baselinePriceAtMoq != null
          ? Number(c.product.baselinePriceAtMoq)
          : null,
      transferPercent:
        c.product?.transferPercent != null
          ? Number(c.product.transferPercent)
          : null,
      pricingSpecRanges: (c.product?.pricingSpec?.ranges || []).map((r: any) => ({
        rangeFrom: r.rangeFrom ?? null,
        rangeTo: r.rangeTo ?? null,
        multiplier: Number(r.multiplier),
      })),
      flagIsDisabled: Boolean((c as any).flagIsDisabled),
      flagDefinedInProduct: Boolean((c as any).flagDefinedInProduct),
    };
    return row;
  });
}

export function canEditQpuDefault(cutTotal: number, batchTracked: boolean) {
  return !batchTracked || (Number(cutTotal || 0) || 0) === 0;
}
