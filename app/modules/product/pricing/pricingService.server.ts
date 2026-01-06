import { prisma } from "~/utils/prisma.server";
import type { PricingContext, PricingResult, PriceTier } from "./pricingTypes";
import {
  inferPricingModelFromData,
  type ProductPricingModel,
} from "~/modules/product/services/pricingModel.server";
import { getCurveSellUnitPrice } from "./curvePricing.server";

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function toNum(v: any, def = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

export async function getGlobalDefaultMargin(): Promise<number | null> {
  const s = await prisma.setting.findUnique({
    where: { key: "defaultMargin" },
  });
  if (!s) return null;
  if (s.number != null) return Number(s.number);
  if (s.value != null) return Number(s.value);
  return null;
}

export async function getVendorDefaults(vendorId?: number | null) {
  if (!vendorId) return { vendorDefaultMargin: null } as const;
  const vendor = await prisma.company.findUnique({
    where: { id: vendorId },
    select: { defaultMarginOverride: true },
  });
  return {
    vendorDefaultMargin:
      vendor?.defaultMarginOverride != null
        ? Number(vendor.defaultMarginOverride)
        : null,
  } as const;
}

export async function getVendorCustomerMapping(
  vendorId?: number | null,
  customerId?: number | null
) {
  if (!vendorId || !customerId) return null;
  const m = await prisma.vendorCustomerPricing.findUnique({
    where: { vendorId_customerId: { vendorId, customerId } },
    select: { marginOverride: true },
  });
  if (!m) return null;
  return {
    marginOverride: m.marginOverride != null ? Number(m.marginOverride) : null,
  };
}

export function pickTierForQty(
  tiers: PriceTier[] | null | undefined,
  qty: number
): PriceTier | null {
  if (!tiers || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => (a.minQty ?? 1) - (b.minQty ?? 1));
  let picked: PriceTier | null = null;
  for (const t of sorted) {
    if (qty >= (t.minQty ?? 1)) picked = t;
  }
  return picked;
}

export function computeEffectiveMargin(ctx: PricingContext): number | null {
  // Precedence: customer/vendor override -> vendor default -> global default
  const override = ctx.vendorCustomerMapping?.marginOverride;
  if (override != null) return toNum(override, null as any);
  const vd = ctx.vendorDefaultMargin;
  if (vd != null) return toNum(vd, null as any);
  const g = ctx.settings.defaultMargin;
  if (g != null) return toNum(g, null as any);
  return null;
}

export async function computePrice(
  ctx: PricingContext
): Promise<PricingResult> {
  const qty = Math.max(1, toNum(ctx.qty, 1));
  const taxRate = toNum(ctx.product.purchaseTaxRate, 0);
  const pricingModel =
    (ctx.product.pricingModel as ProductPricingModel | null) ??
    inferPricingModelFromData(ctx.product);

  if (pricingModel === "CURVE_SELL_AT_MOQ") {
    const specRanges = ctx.product.pricingSpecRanges || [];
    const base = toNum(ctx.product.baselinePriceAtMoq, 0);
    if (!Number.isFinite(base) || base <= 0) {
      throw new Error("Price at MOQ is required for curve pricing");
    }
    if (!specRanges.length) {
      throw new Error("Curve spec has no ranges");
    }
    const unit = getCurveSellUnitPrice({
      qty,
      baselinePriceAtMoq: base,
      specRanges,
    });
    const withTax = unit * (1 + taxRate);
    const transferPercent =
      ctx.product.transferPercent != null
        ? toNum(ctx.product.transferPercent, null as any)
        : null;
    const extendedCost =
      transferPercent != null
        ? round(withTax * qty * transferPercent)
        : round(withTax * qty);
    return {
      unitSellPrice: round(withTax),
      extendedSell: round(withTax * qty),
      extendedCost,
      applied: {
        mode: "curveSellAtMoq",
        baseUnit: round(unit),
        inTarget: round(unit),
        discounted: round(unit),
        withTax: round(withTax),
      },
    };
  }

  if (pricingModel === "COST_PLUS_FIXED_SELL") {
    const withTax = toNum(ctx.product.manualSalePrice, 0);
    return {
      unitSellPrice: round(withTax),
      extendedSell: round(withTax * qty),
      extendedCost: round(withTax * qty),
      applied: {
        mode: "costPlusFixedSell",
        baseUnit: round(toNum(ctx.product.manualSalePrice, 0)),
        inTarget: round(toNum(ctx.product.manualSalePrice, 0)),
        discounted: round(toNum(ctx.product.manualSalePrice, 0)),
        withTax: round(toNum(ctx.product.manualSalePrice, 0)),
      },
    };
  }

  // Cost + margin flow. If manualMargin set on product, that overrides hierarchy.
  const margin =
    ctx.product.manualMargin != null
      ? toNum(ctx.product.manualMargin, 0)
      : computeEffectiveMargin(ctx) ?? 0;

  // Determine base cost from cost tiers or product/group cost
  const cTiers = ctx.product.costPriceTiers ?? [];
  let costBase: number | null = null;
  if (pricingModel === "TIERED_COST_PLUS_MARGIN" && cTiers.length) {
    const sorted = [...cTiers].sort((a, b) => a.minQty - b.minQty);
    for (const t of sorted) {
      if (qty >= (t.minQty ?? 1)) costBase = toNum(t.unitCost, costBase ?? 0);
    }
  }
  if (costBase == null || !Number.isFinite(costBase)) {
    const fallback = ctx.product.costPrice ?? ctx.product.groupCostPrice ?? 0;
    costBase = toNum(fallback, 0);
  }
  const cost = costBase;
  const costWithMargin = cost * (1 + margin);
  const inTarget = costWithMargin;
  const withTax = inTarget * (1 + taxRate);

  return {
    unitSellPrice: round(withTax),
    extendedSell: round(withTax * qty),
    extendedCost: round(withTax * qty),
    applied: {
      mode:
        pricingModel === "TIERED_COST_PLUS_MARGIN"
          ? "tieredCostPlusMargin"
          : "costPlusMargin",
      marginUsed: margin,
      tier: null,
      baseUnit: round(cost),
      inTarget: round(inTarget),
      discounted: round(inTarget),
      withTax: round(withTax),
    },
  };
}

// End-to-end convenience: gather DB overrides then compute
export async function priceProduct(opts: {
  productId: number;
  qty: number;
  vendorId?: number | null;
  customerId?: number | null;
  currencyRate?: number | null;
}): Promise<PricingResult> {
  const product = await prisma.product.findUnique({
    where: { id: opts.productId },
    select: {
      id: true,
      supplierId: true,
      pricingModel: true,
      pricingSpecId: true,
      baselinePriceAtMoq: true,
      transferPercent: true,
      manualSalePrice: true,
      manualMargin: true,
      costPrice: true,
      pricingSpec: {
        select: {
          id: true,
          ranges: {
            select: { rangeFrom: true, rangeTo: true, multiplier: true },
          },
        },
      },
      productCostRanges: { select: { rangeFrom: true, costPrice: true } },
      costGroup: {
        select: {
          costPrice: true,
          costRanges: {
            select: { rangeFrom: true, costPrice: true },
          },
        },
      },
      purchaseTax: { select: { value: true } },
    },
  });
  if (!product) throw new Error("Product not found");

  const productCostTiers = (product.productCostRanges || []).filter(
    (r: any) => r.rangeFrom != null && r.costPrice != null
  );
  const groupCostTiers = (product.costGroup?.costRanges || []).filter(
    (r: any) => r.rangeFrom != null && r.costPrice != null
  );
  const costPriceTiers: PriceTier[] = productCostTiers.length
    ? productCostTiers.map((r: any) => ({
        minQty: Number(r.rangeFrom),
        unitPrice: Number(r.costPrice),
      }))
    : groupCostTiers.map((r: any) => ({
        minQty: Number(r.rangeFrom),
        unitPrice: Number(r.costPrice),
      }));

  const vendorId = opts.vendorId ?? (product as any).supplierId ?? null;
  const [globalDefaultMargin, vendorDefaults, mapping] = await Promise.all([
    getGlobalDefaultMargin(),
    getVendorDefaults(vendorId),
    getVendorCustomerMapping(vendorId, opts.customerId ?? null),
  ]);

  return await computePrice({
    qty: opts.qty,
    product: {
      id: product.id,
      pricingModel: product.pricingModel ?? null,
      pricingSpecId: product.pricingSpecId ?? null,
      baselinePriceAtMoq:
        product.baselinePriceAtMoq != null
          ? Number(product.baselinePriceAtMoq)
          : null,
      transferPercent:
        product.transferPercent != null
          ? Number(product.transferPercent)
          : null,
      manualSalePrice:
        product.manualSalePrice != null
          ? Number(product.manualSalePrice)
          : null,
      manualMargin:
        product.manualMargin != null ? Number(product.manualMargin) : null,
      costPrice: product.costPrice != null ? Number(product.costPrice) : null,
      groupCostPrice:
        product.costGroup?.costPrice != null
          ? Number(product.costGroup.costPrice)
          : null,
      purchaseTaxRate:
        product.purchaseTax?.value != null
          ? Number(product.purchaseTax.value)
          : 0,
      costPriceTiers: costPriceTiers.map((t) => ({
        minQty: t.minQty,
        unitCost: t.unitPrice,
      })),
      pricingSpecRanges: (product.pricingSpec?.ranges || []).map((range) => ({
        rangeFrom: range.rangeFrom ?? null,
        rangeTo: range.rangeTo ?? null,
        multiplier: Number(range.multiplier),
      })),
    },
    supplier: opts.vendorId ? { id: opts.vendorId } : null,
    customer: opts.customerId ? { id: opts.customerId } : null,
    settings: { defaultMargin: globalDefaultMargin },
    vendorDefaultMargin: vendorDefaults.vendorDefaultMargin,
    vendorCustomerMapping: mapping,
    currencyRate: opts.currencyRate ?? 1,
  });
}
