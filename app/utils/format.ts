// Shared formatting utilities

export function formatMoney(
  value: number | null | undefined,
  opts?: {
    currency?: string;
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
) {
  if (value == null || isNaN(value)) return "";
  const {
    currency,
    locale,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = opts || {};
  if (currency) {
    try {
      return new Intl.NumberFormat(locale || undefined, {
        style: "currency",
        currency,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(value);
    } catch {
      // Fallback to plain number if Intl errors (invalid currency code)
    }
  }
  return new Intl.NumberFormat(locale || undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

// Convenience fixed USD formatting wrapper (can adjust default currency later)
export function formatUSD(value: number | null | undefined) {
  return formatMoney(value, { currency: "USD" });
}

export function formatShortDate(
  value: Date | string | number | null | undefined,
  opts?: { locale?: string }
) {
  if (value == null) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(opts?.locale, {
      dateStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

// Quantity formatting: show integers without decimals, decimals up to 3 (adjustable)
export function formatQuantity(
  value: number | null | undefined,
  opts?: { maxFractionDigits?: number }
) {
  if (value == null || isNaN(value)) return "";
  const maxFractionDigits = opts?.maxFractionDigits ?? 3;
  const isInt = Math.abs(value - Math.trunc(value)) < 1e-9;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : maxFractionDigits,
  }).format(value);
}
