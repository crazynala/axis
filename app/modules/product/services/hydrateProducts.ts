import { prismaBase } from "~/utils/prisma.server";
import { calcPrice } from "../calc/calcPrice";
import { productSpec } from "../spec";

// Minimal shape both routes select for table hydration
export type ProductRowBase = {
  id: number;
  sku: string | null;
  name: string | null;
  type: any;
  productStage?: string | null;
  categoryId: number | null;
  subCategoryId: number | null;
  templateId: number | null;
  supplierId: number | null;
  customerId: number | null;
  variantSetId: number | null;
  costPrice: any;
  leadTimeDays: number | null;
  externalStepType: string | null;
  manualSalePrice: any;
  pricingModel: string | null;
  pricingSpecId: number | null;
  baselinePriceAtMoq: any;
  transferPercent: any;
  pricingSpec?: {
    ranges?: Array<{
      rangeFrom: number | null;
      rangeTo: number | null;
      multiplier: any;
    }>;
  } | null;
  stockTrackingEnabled: boolean | null;
  batchTrackingEnabled: boolean | null;
};

export async function fetchAndHydrateProductsByIds(ids: number[]) {
  if (!ids.length) return [];
  const baseRows = await prismaBase.product.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      type: true,
      productStage: true,
      categoryId: true,
      subCategoryId: true,
      templateId: true,
      supplierId: true,
      customerId: true,
      variantSetId: true,
      costPrice: true,
      leadTimeDays: true,
      externalStepType: true,
      manualSalePrice: true,
      pricingModel: true,
      pricingSpecId: true,
      baselinePriceAtMoq: true,
      transferPercent: true,
      stockTrackingEnabled: true,
      batchTrackingEnabled: true,
      category: { select: { label: true, code: true } },
      subCategory: { select: { label: true, code: true } },
      customer: { select: { stockLocationId: true, name: true } },
      costGroup: {
        select: {
          costRanges: { select: { rangeFrom: true, costPrice: true } },
        },
      },
      pricingSpec: {
        select: {
          ranges: { select: { rangeFrom: true, rangeTo: true, multiplier: true } },
        },
      },
      purchaseTax: { select: { value: true, label: true, code: true } },
    },
  });
  const cmtLines = await prismaBase.productLine.findMany({
    where: {
      parentId: { in: ids },
      child: { is: { type: "CMT" } },
      OR: [{ flagAssemblyOmit: false }, { flagAssemblyOmit: null }],
    },
    select: { parentId: true },
  });
  const cmtParentIds = new Set<number>();
  for (const line of cmtLines) {
    if (line.parentId != null) cmtParentIds.add(line.parentId);
  }
  const { getProductStockSnapshots } = await import("~/utils/prisma.server");
  const snapshots = (await getProductStockSnapshots(ids)) as
    | Array<{
        productId: number;
        totalQty: number;
        byLocation: Array<{
          locationId: number | null;
          locationName: string;
          qty: number;
        }>;
      }>
    | null;
  const snapMap = new Map<number, any>();
  if (Array.isArray(snapshots)) {
    for (const s of snapshots) {
      snapMap.set(s.productId, s);
    }
  }
  const enrichedRows = baseRows.map((r) => {
    let enrichedRow: any = {};
    const priceTiers =
      r.costGroup?.costRanges
        ?.map((t) => ({
          minQty: Number(t.rangeFrom ?? 0) || 0,
          priceCost: Number(t.costPrice ?? 0) || 0,
        }))
        .filter(
          (t) => Number.isFinite(t.minQty) && Number.isFinite(t.priceCost)
        ) || [];
    if (
      r.manualSalePrice &&
      String(r.pricingModel || "").toUpperCase() !== "CURVE_SELL_AT_MOQ"
    ) {
      enrichedRow = {
        ...r,
        c_sellPrice: r.manualSalePrice,
        c_isSellPriceManual: true,
      };
    } else {
      const sellPrice = calcPrice({
        baseCost: Number(r.costPrice ?? 0) || 0,
        tiers: priceTiers,
        taxRate: Number(r.purchaseTax?.value ?? 0) || 0,
        pricingModel: r.pricingModel ?? null,
        baselinePriceAtMoq:
          r.baselinePriceAtMoq != null ? Number(r.baselinePriceAtMoq) : null,
        transferPercent:
          r.transferPercent != null ? Number(r.transferPercent) : null,
        pricingSpecRanges: (r.pricingSpec?.ranges || []).map((range: any) => ({
          rangeFrom: range.rangeFrom ?? null,
          rangeTo: range.rangeTo ?? null,
          multiplier: Number(range.multiplier),
        })),
      });
      enrichedRow = { ...r, c_sellPrice: sellPrice.unitSellPrice };
    }
    if (priceTiers.length) {
      // console.log("Has price tiers:", r.id, priceTiers);
      enrichedRow.c_hasPriceTiers = true;
    }
    const snap = snapMap.get(r.id);
    if (snap) {
      enrichedRow.c_stockQty = snap.totalQty ?? 0;
      enrichedRow.c_byLocation = (snap.byLocation || []).map((loc: any) => ({
        location_id: loc.locationId ?? loc.location_id ?? null,
        location_name: loc.locationName ?? loc.location_name ?? "",
        qty: loc.qty ?? 0,
      }));
    }
    enrichedRow.customer = r.customer;
    enrichedRow.warnings = productSpec.warnings.buildProductWarnings({
      type: r.type,
      sku: r.sku,
      name: r.name,
      categoryId: r.categoryId,
      templateId: r.templateId,
      supplierId: r.supplierId,
      customerId: r.customerId,
      variantSetId: r.variantSetId,
      costPrice: r.costPrice,
      leadTimeDays: r.leadTimeDays,
      externalStepType: r.externalStepType,
      stockTrackingEnabled: r.stockTrackingEnabled,
      batchTrackingEnabled: r.batchTrackingEnabled,
      hasCmtLine: cmtParentIds.has(r.id),
    });
    return enrichedRow;
  });
  // console.log("Enriched rows:", enrichedRows);
  return enrichedRows;
}
