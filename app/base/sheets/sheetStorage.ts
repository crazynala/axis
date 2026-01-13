import type { SheetColumnSelection } from "./sheetSpec";

const STORAGE_PREFIX = "axis:sheet-columns:v1";

export function buildSheetColumnsStorageKey(options: {
  moduleKey: string;
  viewId: string;
  scope: string;
}) {
  const { moduleKey, viewId, scope } = options;
  return `${STORAGE_PREFIX}:${moduleKey}:${viewId}:${scope}`;
}

export function readSheetColumnsStorage(key: string): SheetColumnSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SheetColumnSelection | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.columns)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSheetColumnsStorage(
  key: string,
  selection: SheetColumnSelection
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(selection));
  } catch {
    // ignore storage errors
  }
}
