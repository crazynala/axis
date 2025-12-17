import type { ProductType } from "@prisma/client";
import { prisma } from "~/utils/prisma.server";

export type CoverageToleranceDefaults = {
  defaultPct: number;
  defaultAbs: number;
  byType: Record<string, { pct: number; abs: number }>;
};

export type CoverageToleranceSource =
  | "ASSEMBLY"
  | "GLOBAL_TYPE"
  | "GLOBAL_DEFAULT";

export type CoverageToleranceResult = {
  pct: number;
  abs: number;
  source: CoverageToleranceSource;
};

type AssemblyToleranceLike = {
  materialCoverageTolerancePct?: number | string | null;
  materialCoverageToleranceAbs?: number | string | null;
};

const FALLBACK_DEFAULTS: CoverageToleranceDefaults = {
  defaultPct: 0.01,
  defaultAbs: 0,
  byType: {
    FABRIC: { pct: 0.03, abs: 5 },
    TRIM: { pct: 0.02, abs: 10 },
    PACKAGING: { pct: 0.02, abs: 25 },
  },
};

export const MATERIAL_TOLERANCE_SETTING_KEY = "materialCoverageTolerance";

let cachedDefaults: {
  data: CoverageToleranceDefaults;
  fetchedAt: number;
} | null = null;
const CACHE_WINDOW_MS = 5 * 60 * 1000;

export async function loadCoverageToleranceDefaults(): Promise<CoverageToleranceDefaults> {
  if (cachedDefaults && Date.now() - cachedDefaults.fetchedAt < CACHE_WINDOW_MS) {
    return cachedDefaults.data;
  }
  const setting = await prisma.setting.findUnique({
    where: { key: MATERIAL_TOLERANCE_SETTING_KEY },
    select: { json: true },
  });
  const parsed = parseToleranceJson(setting?.json);
  cachedDefaults = { data: parsed, fetchedAt: Date.now() };
  return parsed;
}

export function clearCoverageToleranceDefaultsCache() {
  cachedDefaults = null;
}

export function resolveCoverageTolerance({
  assembly,
  productType,
  defaults,
}: {
  assembly?: AssemblyToleranceLike | null;
  productType?: ProductType | string | null;
  defaults: CoverageToleranceDefaults;
}): CoverageToleranceResult {
  const absOverride = toNumber(assembly?.materialCoverageToleranceAbs);
  const pctOverride = toNumber(assembly?.materialCoverageTolerancePct);
  if (absOverride != null || pctOverride != null) {
    return {
      abs: Math.max(absOverride ?? 0, 0),
      pct: clampPct(pctOverride ?? 0),
      source: "ASSEMBLY",
    };
  }
  const normalizedType = normalizeType(productType);
  if (normalizedType && defaults.byType[normalizedType]) {
    const entry = defaults.byType[normalizedType];
    return {
      abs: Math.max(entry.abs ?? defaults.defaultAbs, 0),
      pct: clampPct(entry.pct ?? defaults.defaultPct),
      source: "GLOBAL_TYPE",
    };
  }
  return {
    abs: Math.max(defaults.defaultAbs, 0),
    pct: clampPct(defaults.defaultPct),
    source: "GLOBAL_DEFAULT",
  };
}

export function computeToleranceQty({
  abs,
  pct,
  requiredQty,
}: {
  abs: number;
  pct: number;
  requiredQty: number;
}): number {
  const pctQty = requiredQty > 0 ? requiredQty * pct : 0;
  return Math.max(abs, pctQty, 0);
}

function parseToleranceJson(raw: unknown): CoverageToleranceDefaults {
  if (!raw || typeof raw !== "object") return FALLBACK_DEFAULTS;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Record<string, any>)
        : (raw as Record<string, any>);
    const { default: def = {}, ...rest } = parsed;
    const normalizedByType: Record<string, { pct: number; abs: number }> = {};
    Object.entries(rest).forEach(([key, value]) => {
      if (!value || typeof value !== "object") return;
      const abs = toNumber((value as any).abs);
      const pct = toNumber((value as any).pct);
      normalizedByType[normalizeType(key) ?? key.toUpperCase()] = {
        abs: abs ?? FALLBACK_DEFAULTS.byType[key.toUpperCase()]?.abs ?? FALLBACK_DEFAULTS.defaultAbs,
        pct: pct ?? FALLBACK_DEFAULTS.byType[key.toUpperCase()]?.pct ?? FALLBACK_DEFAULTS.defaultPct,
      };
    });
    return {
      defaultPct: clampPct(
        toNumber((def as any)?.pct) ?? FALLBACK_DEFAULTS.defaultPct
      ),
      defaultAbs: Math.max(
        toNumber((def as any)?.abs) ?? FALLBACK_DEFAULTS.defaultAbs,
        0
      ),
      byType: Object.keys(normalizedByType).length
        ? normalizedByType
        : { ...FALLBACK_DEFAULTS.byType },
    };
  } catch (err) {
    console.warn("[coverageTolerance] failed to parse JSON", err);
    return FALLBACK_DEFAULTS;
  }
}

function normalizeType(value?: ProductType | string | null): string | null {
  if (!value) return null;
  return value.toString().trim().toUpperCase() || null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}
