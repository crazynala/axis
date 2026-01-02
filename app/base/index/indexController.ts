import { normalizeColumnsValue } from "./columns";

export type FindConfigField = {
  name: string;
  findOp?: any;
  hiddenInModes?: string[];
};

export type ViewParams = {
  q?: string | null;
  filters?: Record<string, any>;
  sort?: string | null;
  dir?: string | null;
  perPage?: number | string | null;
  page?: number | string | null;
  columns?: string[] | string | null;
};

export function deriveSemanticKeys(findConfig?: FindConfigField[] | null) {
  if (!findConfig) return [];
  const keys: string[] = [];
  for (const field of findConfig) {
    if (!field?.findOp) continue;
    if (field.hiddenInModes?.includes("find")) continue;
    if (keys.includes(field.name)) continue;
    keys.push(field.name);
  }
  return keys;
}

export function hasSemanticParams(
  searchParams: URLSearchParams,
  semanticKeys: string[]
) {
  if (searchParams.has("findReqs") || searchParams.has("q")) return true;
  for (const key of semanticKeys) {
    const v = searchParams.get(key);
    if (v !== null && v !== "") return true;
  }
  return false;
}

export function normalizeViewLastView(
  searchParams: URLSearchParams,
  semanticKeys: string[]
) {
  const hasSemantic = hasSemanticParams(searchParams, semanticKeys);
  const view = searchParams.get("view");
  const lastView = searchParams.get("lastView");
  if (view && hasSemantic) {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    next.set("lastView", view);
    return next;
  }
  if (!view && lastView && !hasSemantic) {
    const next = new URLSearchParams(searchParams);
    next.set("view", lastView);
    next.delete("lastView");
    return next;
  }
  return null;
}

export function getIndexMode(
  searchParams: URLSearchParams,
  semanticKeys: string[]
) {
  const view = searchParams.get("view");
  const lastView = searchParams.get("lastView");
  const viewMode = !!view && !hasSemanticParams(searchParams, semanticKeys);
  return {
    viewMode,
    activeViewId: viewMode ? view : null,
    lastViewId: lastView ?? null,
  };
}

export function computeSaveTarget(viewMode: boolean, viewId: string | null, lastViewId: string | null) {
  if (viewMode && viewId) return viewId;
  return lastViewId || null;
}

const normalizeValue = (value: any) => {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(String).join(",");
  return String(value);
};

const normalizePairs = (pairs: Array<[string, string]>) => {
  return pairs
    .filter(([, v]) => v !== "")
    .sort((a, b) =>
      a[0] === b[0]
        ? String(a[1]).localeCompare(String(b[1]))
        : a[0].localeCompare(b[0])
    )
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
};

export function computeDirty(options: {
  searchParams: URLSearchParams;
  presentationKeys: string[];
  baselineViewParams?: ViewParams | null;
}) {
  const { searchParams, presentationKeys, baselineViewParams } = options;
  const defaultSortField = "id";
  const defaultSortDir = "desc";
  const defaultPerPage = 20;
  const defaultColumns: string[] = [];

  const effectiveKeys = presentationKeys.filter((k) => k !== "page");
  const baselineSort = baselineViewParams?.sort ?? defaultSortField;
  const baselineDir = baselineViewParams?.dir ?? defaultSortDir;
  const baselinePerPage =
    baselineViewParams?.perPage ?? defaultPerPage;
  const baselineColumns = normalizeColumnsValue(
    baselineViewParams?.columns ?? defaultColumns
  );
  const currentSort =
    searchParams.get("sort") || String(baselineSort) || defaultSortField;
  const currentDir =
    searchParams.get("dir") || String(baselineDir) || defaultSortDir;
  const currentPerPage =
    searchParams.get("perPage") || String(baselinePerPage) || String(defaultPerPage);
  const currentColumns = normalizeColumnsValue(
    searchParams.get("columns") || baselineColumns || defaultColumns
  );

  const currentPairs: Array<[string, string]> = [];
  for (const key of effectiveKeys) {
    if (key === "sort") {
      currentPairs.push(["sort", String(currentSort)]);
      continue;
    }
    if (key === "dir") {
      currentPairs.push(["dir", String(currentDir)]);
      continue;
    }
    if (key === "perPage") {
      currentPairs.push(["perPage", String(currentPerPage)]);
      continue;
    }
    if (key === "columns") {
      const normalized = currentColumns.join(",");
      if (normalized) currentPairs.push(["columns", normalized]);
      continue;
    }
    const values = searchParams.getAll(key);
    if (values.length) {
      currentPairs.push([key, values.join(",")]);
      continue;
    }
    const v = searchParams.get(key);
    if (v !== null && v !== "") currentPairs.push([key, v]);
  }
  const presentationNow = normalizePairs(currentPairs);

  const baselinePairs: Array<[string, string]> = [];
  for (const key of effectiveKeys) {
    if (key === "sort") {
      baselinePairs.push(["sort", String(baselineSort)]);
      continue;
    }
    if (key === "dir") {
      baselinePairs.push(["dir", String(baselineDir)]);
      continue;
    }
    if (key === "perPage") {
      baselinePairs.push(["perPage", String(baselinePerPage)]);
      continue;
    }
    if (key === "columns") {
      const normalized = baselineColumns.join(",");
      if (normalized) baselinePairs.push(["columns", normalized]);
      continue;
    }
    const v = (baselineViewParams as any)?.[key];
    const normalized = normalizeValue(v);
    if (normalized) baselinePairs.push([key, normalized]);
  }
  const presentationBaseline = normalizePairs(baselinePairs);
  return presentationNow !== presentationBaseline;
}

export function hasPresentationParams(
  searchParams: URLSearchParams,
  presentationKeys: string[]
) {
  for (const key of presentationKeys) {
    if (key === "page") continue;
    const v = searchParams.get(key);
    if (v !== null && v !== "") return true;
  }
  return false;
}
