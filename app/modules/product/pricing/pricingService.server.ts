import { prisma } from "~/utils/prisma.server";
import type { PricingContext, PricingResult, PriceTier } from "./pricingTypes";

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
  const rate = ctx.currencyRate != null ? toNum(ctx.currencyRate, 1) : 1;

  // 1) Manual sale price wins
  if (ctx.product.manualSalePrice != null) {
    const withTax = toNum(ctx.product.manualSalePrice, 0);
    return {
      unitSellPrice: round(withTax),
      extendedSell: round(withTax * qty),
      extendedCost: round(withTax * qty),
      applied: {
        mode: "manualSalePrice",
        baseUnit: round(toNum(ctx.product.manualSalePrice, 0)),
        inTarget: round(toNum(ctx.product.manualSalePrice, 0)),
        discounted: round(toNum(ctx.product.manualSalePrice, 0)),
        withTax: round(toNum(ctx.product.manualSalePrice, 0)),
      },
    };
  }

  // 2) Tier-based sale price groups + client multiplier
  const tiers = ctx.product.salePriceTiers ?? [];
  const tier = pickTierForQty(tiers, qty);
  if (tier) {
    // New precedence: customer-level default multiplier if present
    let multiplier = 1;
    if (ctx.customer?.id) {
      const cust = await prisma.company.findUnique({
        where: { id: ctx.customer.id },
        select: { priceMultiplier: true },
      });
      if (cust?.priceMultiplier != null)
        multiplier = toNum(cust.priceMultiplier, 1);
    }
    const unit = toNum(tier.unitPrice, 0) * multiplier;
    const withTax = unit * (1 + taxRate);
    return {
      unitSellPrice: round(withTax),
      extendedSell: round(withTax * qty),
      extendedCost: round(withTax * qty),
      applied: {
        mode: "tierMultiplier",
        priceMultiplier: multiplier,
        tier,
        baseUnit: round(toNum(tier.unitPrice, 0)),
        inTarget: round(toNum(tier.unitPrice, 0) * multiplier),
        discounted: round(toNum(tier.unitPrice, 0) * multiplier),
        withTax: round(withTax),
      },
    };
  }

  // 3) Cost + margin flow. If manualMargin set on product, that overrides hierarchy.
  const margin =
    ctx.product.manualMargin != null
      ? toNum(ctx.product.manualMargin, 0)
      : computeEffectiveMargin(ctx) ?? 0;

  // Determine base cost from cost tiers or product/group cost
  const cTiers = ctx.product.costPriceTiers ?? [];
  let costBase: number | null = null;
  if (cTiers.length) {
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
  const inTarget = costWithMargin * rate;
  const withTax = inTarget * (1 + taxRate);

  return {
    unitSellPrice: round(withTax),
    extendedSell: round(withTax * qty),
    extendedCost: round(withTax * qty),
    applied: {
      mode: "costMargin",
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
      manualSalePrice: true,
      manualMargin: true,
      salePriceGroup: {
        select: {
          saleRanges: { select: { rangeFrom: true, price: true } },
        },
      },
      salePriceRanges: { select: { rangeFrom: true, price: true } },
      costGroup: {
        select: {
          costRanges: {
            select: { rangeFrom: true, sellPriceManual: true },
          },
        },
      },
      purchaseTax: { select: { value: true } },
    },
  });
  if (!product) throw new Error("Product not found");

  // Prefer explicit sale price tiers: product-specific then group
  const spProduct = (product.salePriceRanges || []).filter(
    (r: any) => r.rangeFrom != null && r.price != null
  );
  const spGroup = (product.salePriceGroup?.saleRanges || []).filter(
    (r: any) => r.rangeFrom != null && r.price != null
  );
  let tiers: PriceTier[] = [];
  if (spProduct.length) {
    tiers = spProduct.map((r: any) => ({
      minQty: Number(r.rangeFrom),
      unitPrice: Number(r.price),
    }));
  } else if (spGroup.length) {
    tiers = spGroup.map((r: any) => ({
      minQty: Number(r.rangeFrom),
      unitPrice: Number(r.price),
    }));
  } else {
    // Fallback to legacy: costGroup.costRanges.sellPriceManual
    const legacy = product.costGroup?.costRanges ?? [];
    tiers = (legacy as Array<{ rangeFrom: any; sellPriceManual: any }>)
      .filter((r) => r.rangeFrom != null && r.sellPriceManual != null)
      .map((r) => ({
        minQty: Number(r.rangeFrom),
        unitPrice: Number(r.sellPriceManual),
      }));
  }

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
      manualSalePrice:
        product.manualSalePrice != null
          ? Number(product.manualSalePrice)
          : null,
      manualMargin:
        product.manualMargin != null ? Number(product.manualMargin) : null,
      purchaseTaxRate:
        product.purchaseTax?.value != null
          ? Number(product.purchaseTax.value)
          : 0,
      salePriceTiers: tiers,
    },
    supplier: opts.vendorId ? { id: opts.vendorId } : null,
    customer: opts.customerId ? { id: opts.customerId } : null,
    settings: { defaultMargin: globalDefaultMargin },
    vendorDefaultMargin: vendorDefaults.vendorDefaultMargin,
    vendorCustomerMapping: mapping,
    currencyRate: opts.currencyRate ?? 1,
  });
}
