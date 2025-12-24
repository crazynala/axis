export function sumNumberArray(values: Array<number | null | undefined>): number {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

export function computeOrderedTotal(breakdown?: number[] | null): number {
  if (!Array.isArray(breakdown)) return 0;
  return sumNumberArray(breakdown);
}

export function normalizeBreakdownLength(
  source: Array<number | null | undefined>,
  len: number
): number[] {
  const out = Array.from({ length: len }, () => 0);
  for (let i = 0; i < len; i++) {
    out[i] = Number(source[i] ?? 0) || 0;
  }
  return out;
}

export function coerceBreakdown(
  source: Array<number | null | undefined> | null | undefined,
  fallbackQty?: number | null
): number[] {
  if (Array.isArray(source) && source.length) {
    return source.map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0));
  }
  const fallback = Number(fallbackQty ?? 0) || 0;
  if (fallback > 0) return [fallback];
  return [];
}

export function sumBreakdownArrays(
  arrays: Array<Array<number | null | undefined> | null | undefined>
): number[] {
  const maxLen = arrays.reduce(
    (len, arr) => Math.max(len, Array.isArray(arr) ? arr.length : 0),
    0
  );
  if (!maxLen) return [];
  const out = Array.from({ length: maxLen }, () => 0);
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    const limit = Math.min(arr.length, maxLen);
    for (let i = 0; i < limit; i++) {
      const val = Number(arr[i] ?? 0) || 0;
      out[i] += val;
    }
  }
  return out;
}

export function computeEffectiveOrderedTotal(args: {
  orderedTotal: number;
  canceledQty?: number | null;
}): number {
  const canceled = Number(args.canceledQty ?? 0) || 0;
  return Math.max(0, args.orderedTotal - Math.max(0, canceled));
}

export function computeEffectiveOrderedBreakdown(args: {
  orderedBySize?: number[] | null;
  canceledBySize?: number[] | null;
}): { ordered: number[]; canceled: number[]; effective: number[]; total: number } {
  const orderedRaw = Array.isArray(args.orderedBySize) ? args.orderedBySize : [];
  const canceledRaw = Array.isArray(args.canceledBySize) ? args.canceledBySize : [];
  const len = Math.max(orderedRaw.length, canceledRaw.length);
  const ordered = normalizeBreakdownLength(orderedRaw, len);
  const canceled = normalizeBreakdownLength(canceledRaw, len);
  const effective = ordered.map((val, idx) =>
    Math.max(0, Number(val || 0) - Math.max(0, Number(canceled[idx] || 0)))
  );
  return { ordered, canceled, effective, total: sumNumberArray(effective) };
}
