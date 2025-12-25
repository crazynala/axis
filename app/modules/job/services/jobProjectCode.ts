export const JOB_PROJECT_CODE_PREFIX_DEFAULT = "ORD";
export const JOB_PROJECT_CODE_PREFIX_REGEX = /^[A-Z0-9]{2,6}$/;

export function normalizeJobProjectCodePrefix(
  value: string | null | undefined
): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;
  return JOB_PROJECT_CODE_PREFIX_REGEX.test(raw) ? raw : null;
}

export function padProjectCodeNumber(value: number): string {
  const num = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
  const raw = String(num);
  return raw.length >= 3 ? raw : raw.padStart(3, "0");
}

export function buildJobProjectCode(args: {
  shortCode: string | null | undefined;
  prefix: string | null | undefined;
  nextNumber: number | null | undefined;
}): string | null {
  const shortCode = String(args.shortCode ?? "").trim().toUpperCase();
  const prefix = String(args.prefix ?? "").trim().toUpperCase();
  if (!shortCode || !prefix) return null;
  const nextNumber = Number(args.nextNumber ?? 1);
  if (!Number.isFinite(nextNumber)) return null;
  return `${shortCode}-${prefix}-${padProjectCodeNumber(nextNumber)}`;
}

export function buildProjectCodeFromIncrement(args: {
  shortCode: string | null | undefined;
  prefix: string | null | undefined;
  nextNumberAfterIncrement: number | null | undefined;
}): string | null {
  const nextNumber = Math.max(
    1,
    Number(args.nextNumberAfterIncrement ?? 1) - 1
  );
  return buildJobProjectCode({
    shortCode: args.shortCode,
    prefix: args.prefix,
    nextNumber,
  });
}

export function parseJobProjectCodeNumber(args: {
  code: string | null | undefined;
  shortCode: string | null | undefined;
  prefix: string | null | undefined;
}): number | null {
  const code = String(args.code ?? "").trim().toUpperCase();
  const shortCode = String(args.shortCode ?? "").trim().toUpperCase();
  const prefix = String(args.prefix ?? "").trim().toUpperCase();
  if (!code || !shortCode || !prefix) return null;
  const escapedShortCode = shortCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = code.match(
    new RegExp(`^${escapedShortCode}-${escapedPrefix}-(\\d+)$`)
  );
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}
