export function coerceDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + Math.floor(days) * 86400000);
}

export function deriveInternalTargetDate(args: {
  baseDate: Date | string | null | undefined;
  customerTargetDate: Date | string | null | undefined;
  defaultLeadDays: number;
  bufferDays: number;
  now?: Date;
}): Date | null {
  const customer = coerceDate(args.customerTargetDate);
  if (customer) {
    return addDays(customer, -Math.max(0, Math.floor(args.bufferDays)));
  }
  const base = coerceDate(args.baseDate) ?? args.now ?? new Date();
  if (!Number.isFinite(base.getTime())) return null;
  const days = Number.isFinite(args.defaultLeadDays)
    ? args.defaultLeadDays
    : 0;
  return addDays(base, Math.max(0, Math.floor(days)));
}

export function defaultOrderDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function normalizeOrderDate(
  value: Date | null | undefined,
  now?: Date
): Date {
  return value ?? defaultOrderDate(now ?? new Date());
}
