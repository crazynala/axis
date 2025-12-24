import { createHash } from "node:crypto";
import { prisma } from "~/utils/prisma.server";

export type GenerateSalePriceRangesParams = {
  productId: number;
  pricingSpecId: number;
  breakpoints?: number[] | null;
  paramsOverride?: {
    anchorQty?: number | null;
    anchorPrice?: number | null;
    lowQtyFloor?: number | null;
    lowQtyMultiplier?: number | null;
    steepness?: number | null;
    rounding?: number | null;
  } | null;
  actorUserId?: number | null;
  prismaClient?: typeof prisma;
};

export type GenerateSalePriceRangesResult = {
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  hash: string;
};

function toNumber(v: unknown, fallback: number | null = null): number | null {
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBreakpoints(list: number[]): number[] {
  const cleaned = list
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => Math.round(v));
  const uniq = Array.from(new Set(cleaned)).sort((a, b) => a - b);
  return uniq;
}

function roundTo(value: number, increment: number): number {
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

function computeTierPrice(options: {
  q: number;
  anchorQty: number;
  anchorPrice: number;
  lowQtyFloor: number;
  lowQtyMultiplier: number;
  steepness: number;
  rounding: number;
}): number {
  const {
    q,
    anchorQty,
    anchorPrice,
    lowQtyFloor,
    lowQtyMultiplier,
    steepness,
    rounding,
  } = options;

  // Curve: linear-to-power blend that monotonically decreases from
  // anchorPrice * lowQtyMultiplier at q <= lowQtyFloor to anchorPrice at q >= anchorQty.
  const effectiveQ = q <= lowQtyFloor ? 1 : q;
  const denom = Math.max(1, anchorQty - 1);
  const t = Math.min(1, Math.max(0, (effectiveQ - 1) / denom));
  const factor =
    lowQtyMultiplier - (lowQtyMultiplier - 1) * Math.pow(t, steepness);
  const raw = anchorPrice * factor;
  return roundTo(raw, rounding);
}

function buildHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function generateSalePriceRangesForProduct(
  params: GenerateSalePriceRangesParams
): Promise<GenerateSalePriceRangesResult> {
  const client = params.prismaClient ?? prisma;
  const productId = Number(params.productId);
  const pricingSpecId = Number(params.pricingSpecId);
  if (!Number.isFinite(productId) || productId <= 0) {
    throw new Error("invalid_product_id");
  }
  if (!Number.isFinite(pricingSpecId) || pricingSpecId <= 0) {
    throw new Error("invalid_pricing_spec_id");
  }

  const spec = await client.pricingSpec.findUnique({
    where: { id: pricingSpecId },
    select: {
      id: true,
      curveFamily: true,
      defaultBreakpoints: true,
      params: true,
    },
  });
  if (!spec) throw new Error("pricing_spec_not_found");

  const specParams = (spec.params ?? {}) as Record<string, unknown>;
  const override = params.paramsOverride ?? {};

  const anchorQtyDefault = (() => {
    switch (spec.curveFamily) {
      case "CMT_MOQ_50":
        return 50;
      case "CMT_MOQ_100":
        return 100;
      default:
        return 50;
    }
  })();

  const anchorQty =
    toNumber(override.anchorQty, null) ??
    toNumber(specParams.anchorQty, null) ??
    anchorQtyDefault;
  const anchorPrice =
    toNumber(override.anchorPrice, null) ??
    toNumber(specParams.anchorPrice, null);
  const lowQtyFloor =
    toNumber(override.lowQtyFloor, null) ??
    toNumber(specParams.lowQtyFloor, null) ??
    10;
  const lowQtyMultiplier =
    toNumber(override.lowQtyMultiplier, null) ??
    toNumber(specParams.lowQtyMultiplier, null) ??
    3.0;
  const steepness =
    toNumber(override.steepness, null) ??
    toNumber(specParams.steepness, null) ??
    1.0;
  const rounding =
    toNumber(override.rounding, null) ??
    toNumber(specParams.rounding, null) ??
    0.1;

  if (!Number.isFinite(anchorPrice as number) || (anchorPrice as number) <= 0) {
    throw new Error("anchor_price_required");
  }
  if (!Number.isFinite(anchorQty) || anchorQty <= 0) {
    throw new Error("anchor_qty_invalid");
  }
  if (!Number.isFinite(lowQtyMultiplier) || lowQtyMultiplier < 1) {
    throw new Error("low_qty_multiplier_invalid");
  }

  const rawBreakpoints = params.breakpoints ?? spec.defaultBreakpoints ?? [];
  const breakpoints = normalizeBreakpoints(rawBreakpoints);
  if (!breakpoints.length) throw new Error("breakpoints_required");

  const hash = buildHash({
    productId,
    pricingSpecId: spec.id,
    breakpoints,
    params: {
      anchorQty,
      anchorPrice,
      lowQtyFloor,
      lowQtyMultiplier,
      steepness,
      rounding,
    },
  });

  const now = new Date();
  const rows = breakpoints.map((bp, idx) => {
    const next = breakpoints[idx + 1];
    const rangeTo = next ? next - 1 : null;
    const price = computeTierPrice({
      q: bp,
      anchorQty,
      anchorPrice: anchorPrice as number,
      lowQtyFloor,
      lowQtyMultiplier,
      steepness,
      rounding,
    });
    return {
      productId,
      saleGroupId: null,
      rangeFrom: bp,
      rangeTo,
      price,
      generatedBySpecId: spec.id,
      generatedAt: now,
      generatedHash: hash,
    } as const;
  });

  const deleted = await client.salePriceRange.deleteMany({
    where: { productId, generatedBySpecId: spec.id },
  });
  const created = await client.salePriceRange.createMany({ data: rows });

  return {
    createdCount: created.count,
    updatedCount: 0,
    deletedCount: deleted.count,
    hash,
  };
}
