export type ValueState = "calculated" | "overridden" | "locked" | "drifted";

export type DriftInfo = {
  current: number;
  delta: number;
  deltaPct?: number;
};

export type PricingValueMeta = {
  state: ValueState;
  reason?: string;
  contextAffected?: boolean;
  context?: {
    customerName?: string;
    qty?: number;
  };
  baseline?: number;
  drift?: DriftInfo;
};

export type PricedValue = {
  value: number;
  meta: PricingValueMeta;
};

export const PRICING_DRIFT_TOLERANCE_ABS = 0.01;

export function isPricingValueDifferent(
  a: number | null | undefined,
  b: number | null | undefined,
  tolerance = PRICING_DRIFT_TOLERANCE_ABS
) {
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return false;
  return Math.abs(Number(a) - Number(b)) > tolerance;
}

export function computePricingDrift(
  lockedValue: number,
  currentValue: number
): DriftInfo | null {
  if (!Number.isFinite(lockedValue) || !Number.isFinite(currentValue)) {
    return null;
  }
  const delta = currentValue - lockedValue;
  if (Math.abs(delta) < PRICING_DRIFT_TOLERANCE_ABS) return null;
  const deltaPct =
    lockedValue !== 0 ? Math.abs(delta / lockedValue) : undefined;
  return {
    current: currentValue,
    delta,
    deltaPct,
  };
}

export function resolvePricingMeta({
  isLocked,
  isOverridden,
  lockedValue,
  currentValue,
  contextAffected,
  context,
}: {
  isLocked?: boolean;
  isOverridden?: boolean;
  lockedValue?: number | null;
  currentValue?: number | null;
  contextAffected?: boolean;
  context?: {
    customerName?: string;
    qty?: number;
  };
}): PricingValueMeta {
  if (isLocked) {
    const drift =
      lockedValue != null && currentValue != null
        ? computePricingDrift(lockedValue, currentValue)
        : null;
    if (drift) {
      return {
        state: "drifted",
        contextAffected,
        context,
        drift,
      };
    }
    return {
      state: "locked",
      contextAffected,
      context,
    };
  }
  if (isOverridden) {
    return {
      state: "overridden",
      contextAffected,
      context,
    };
  }
  return {
    state: "calculated",
    contextAffected,
    context,
  };
}

export function makePricedValue(
  value: number,
  opts: {
    isLocked?: boolean;
    isOverridden?: boolean;
    lockedValue?: number | null;
    currentValue?: number | null;
    contextAffected?: boolean;
    context?: {
      customerName?: string;
      qty?: number;
    };
  } = {}
): PricedValue {
  return {
    value,
    meta: resolvePricingMeta(opts),
  };
}
