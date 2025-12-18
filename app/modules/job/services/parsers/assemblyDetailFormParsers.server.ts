import { normalizeAssemblyState } from "~/modules/job/stateUtils";

export const sumInto = (target: number[], source: number[], sign = 1) => {
  const len = Math.max(target.length, source.length);
  for (let i = 0; i < len; i++) {
    const curr = Number(target[i] ?? 0) || 0;
    const val = Number(source[i] ?? 0) || 0;
    target[i] = curr + sign * val;
  }
};

export const normalizeBreakdown = (arr: number[], fallbackQty: number) => {
  if (Array.isArray(arr) && arr.length) return arr.map((n) => Number(n) || 0);
  if (Number.isFinite(fallbackQty) && fallbackQty > 0) return [fallbackQty];
  return [];
};

export const parseExternalQtyBreakdown = (input: unknown): number[] => {
  if (typeof input !== "string") return [];
  if (!input.trim()) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => {
      const value = Number(n);
      return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
    });
  } catch {
    return [];
  }
};

export const parsePrimaryCostingId = (value: unknown) => {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

export const parseStatusMap = (rawValue: FormDataEntryValue | null): Map<number, string> => {
  const map = new Map<number, string>();
  if (!rawValue || typeof rawValue !== "string") return map;
  if (!rawValue.trim()) return map;
  try {
    const obj = JSON.parse(rawValue);
    if (!obj || typeof obj !== "object") return map;
    for (const [key, val] of Object.entries(obj)) {
      const idNum = Number(key);
      if (!Number.isFinite(idNum)) continue;
      const normalized = normalizeAssemblyState(
        typeof val === "string" ? val : String(val ?? "")
      );
      if (!normalized) continue;
      map.set(idNum, normalized);
    }
  } catch {
    return map;
  }
  return map;
};

