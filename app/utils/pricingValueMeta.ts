export type ValueState = "calculated" | "overridden" | "locked" | "drifted";

export type DriftInfo = {
  current: number;
  delta: number;
  deltaPct?: number;
};

export type PricingValueMeta = {
  state: ValueState;
  reason?: string;
  drift?: DriftInfo;
};

export type PricedValue = {
  value: number;
  meta: PricingValueMeta;
};

export const PRICING_DRIFT_TOLERANCE_ABS = 0.01;

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
}: {
  isLocked?: boolean;
  isOverridden?: boolean;
  lockedValue?: number | null;
  currentValue?: number | null;
}): PricingValueMeta {
  if (isLocked) {
    const drift =
      lockedValue != null && currentValue != null
        ? computePricingDrift(lockedValue, currentValue)
        : null;
    if (drift) {
      return {
        state: "drifted",
        drift,
      };
    }
    return {
      state: "locked",
    };
  }
  if (isOverridden) {
    return {
      state: "overridden",
    };
  }
  return {
    state: "calculated",
  };
}

export function makePricedValue(
  value: number,
  opts: {
    isLocked?: boolean;
    isOverridden?: boolean;
    lockedValue?: number | null;
    currentValue?: number | null;
  } = {}
): PricedValue {
  return {
    value,
    meta: resolvePricingMeta(opts),
  };
}
