export type PricingSpecRangeInput = {
  id?: number | string | null;
  rangeFrom?: number | string | null;
  rangeTo?: number | string | null;
  multiplier?: number | string | null;
};

export type PricingSpecRangeSanitized = {
  id: number | null;
  rangeFrom: number | null;
  rangeTo: number | null;
  multiplier: number | null;
};

export type PricingSpecRangeValidation = {
  errorsByIndex: Record<number, string[]>;
  hasErrors: boolean;
};

const normalizeNumber = (value: unknown): number | null => {
  if (value === "" || value == null) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeId = (value: unknown): number | null => {
  if (value === "" || value == null) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
};

export function sanitizePricingSpecRanges(
  rows: PricingSpecRangeInput[]
): PricingSpecRangeSanitized[] {
  return (rows || []).map((row) => ({
    id: normalizeId(row?.id),
    rangeFrom: normalizeNumber(row?.rangeFrom),
    rangeTo: normalizeNumber(row?.rangeTo),
    multiplier: normalizeNumber(row?.multiplier),
  }));
}

export function isPricingSpecRangeMeaningful(
  row: PricingSpecRangeSanitized
): boolean {
  return (
    row.rangeFrom != null ||
    row.rangeTo != null ||
    row.multiplier != null
  );
}

export function validatePricingSpecRanges(
  rows: PricingSpecRangeSanitized[]
): PricingSpecRangeValidation {
  const errorsByIndex: Record<number, string[]> = {};
  const rowItems = rows.map((row, index) => ({ row, index }));

  const addError = (index: number, message: string) => {
    if (!errorsByIndex[index]) errorsByIndex[index] = [];
    errorsByIndex[index].push(message);
  };

  rowItems.forEach(({ row, index }) => {
    if (!isPricingSpecRangeMeaningful(row)) return;
    if (row.rangeFrom == null) {
      addError(index, "From Qty is required.");
    }
    if (row.multiplier == null) {
      addError(index, "Multiplier is required.");
    }
    if (
      row.rangeFrom != null &&
      row.rangeTo != null &&
      row.rangeTo < row.rangeFrom
    ) {
      addError(index, "To Qty must be ≥ From Qty.");
    }
  });

  const normalized = rowItems
    .map(({ row, index }) => ({ row, index }))
    .filter(
      ({ row }) =>
        row.rangeFrom != null && row.multiplier != null && !Number.isNaN(row.rangeFrom)
    )
    .map(({ row, index }) => ({
      index,
      min: row.rangeFrom as number,
      max: row.rangeTo != null ? (row.rangeTo as number) : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.min - b.min);

  for (let i = 1; i < normalized.length; i++) {
    const prev = normalized[i - 1];
    const curr = normalized[i];
    if (curr.min <= prev.max) {
      addError(prev.index, "Ranges overlap.");
      addError(curr.index, "Ranges overlap.");
    }
  }

  return { errorsByIndex, hasErrors: Object.keys(errorsByIndex).length > 0 };
}
