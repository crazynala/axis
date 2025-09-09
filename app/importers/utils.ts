import * as XLSX from "xlsx";

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: any[];
};

export const normalizeKey = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\s|]+/g, "|")
    .replace(/\|+/g, "|")
    .replace(/__/g, "__");

export const pick = (row: any, names: string[]) => {
  const map: Record<string, any> = {};
  for (const key of Object.keys(row)) map[normalizeKey(key)] = row[key];
  for (const n of names) {
    const v = map[normalizeKey(n)];
    if (v !== undefined) return v;
  }
  return undefined;
};

export const asNum = (raw: any): number | null => {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "" || s.toLowerCase() === "null" || s === "-") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

export const asDate = (raw: any): Date | null => {
  if (raw == null) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = Math.round(raw * 24 * 60 * 60 * 1000);
    const d = new Date(excelEpoch.getTime() + ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
};

export const asBool = (raw: any): boolean | null => {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "" || s === "null" || s === "-") return null;
  return ["1", "true", "yes", "y", "t"].includes(s);
};

export const parseIntListPreserveGaps = (raw: any): number[] => {
  if (raw == null) return [];
  const s = String(raw).replace(/[;|]/g, ",");
  return s.split(",").map((tok) => {
    const t = tok.trim();
    if (t === "") return 0;
    const n = Number(t);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  });
};

export const parseStringListPreserveGaps = (raw: any): string[] => {
  if (raw == null) return [];
  const s = String(raw).replace(/[;|]/g, ",");
  return s.split(",").map((tok) => tok.trim());
};

export async function processRowsInBatches<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  opts?: { batchSize?: number; label?: string }
) {
  const batchSize =
    opts?.batchSize ?? Number(process.env.IMPORT_BATCH_SIZE ?? 200);
  const label = opts?.label ?? "rows";
  for (let start = 0; start < items.length; start += batchSize) {
    const end = Math.min(items.length, start + batchSize);
    const slice = items.slice(start, end);
    await Promise.allSettled(
      slice.map((item, idx) => worker(item, start + idx))
    );
    console.log(`[import] ${label} ${end}/${items.length}`);
  }
}
