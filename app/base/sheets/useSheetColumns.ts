import { useEffect, useMemo, useState } from "react";
import type { SheetColumnDef, SheetViewSpec } from "./sheetSpec";
import {
  buildSheetColumnsStorageKey,
  readSheetColumnsStorage,
  writeSheetColumnsStorage,
} from "./sheetStorage";

export type SheetColumnRelevance = {
  relevant: boolean;
  reason?: string;
};

export type SheetColumnRelevanceMap = Record<string, SheetColumnRelevance>;

export type UseSheetColumnSelectionOptions<Row> = {
  moduleKey: string;
  viewId: string;
  scope: string;
  viewSpec: SheetViewSpec<Row>;
  relevanceByKey?: SheetColumnRelevanceMap;
};

export type SheetColumnSelectionState<Row> = {
  selectedKeys: string[];
  setSelectedKeys: (next: string[]) => void;
  resetToDefault: () => void;
  columns: SheetColumnDef<Row>[];
  selectedColumns: SheetColumnDef<Row>[];
  columnsByGroup: Array<[string, SheetColumnDef<Row>[]]>;
  defaultKeys: string[];
  relevanceByKey: SheetColumnRelevanceMap;
  widthPresetByKey: Record<string, string>;
  setWidthPreset: (key: string, presetId: string) => void;
  storageKey: string;
};

const isDev = process.env.NODE_ENV !== "production";

const assertColumnDefs = (defs: SheetColumnDef[], context: string) => {
  if (!isDev) return;
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const def of defs) {
    const key = def?.key;
    if (typeof key !== "string" || key.trim() === "") {
      errors.push("key must be a non-empty string");
      continue;
    }
    if (seen.has(key)) errors.push(`duplicate key \"${key}\"`);
    seen.add(key);
  }
  if (errors.length) {
    throw new Error(`[sheet-columns] Invalid column keys (${context}). ${errors.join("; ")}`);
  }
};

const normalizeKeys = (keys: string[]) =>
  keys.map((k) => String(k).trim()).filter(Boolean);

const getDefaultKeys = <Row,>(
  viewSpec: SheetViewSpec<Row>,
  requiredKeys: string[]
) => {
  const base = viewSpec.defaultColumns && viewSpec.defaultColumns.length
    ? normalizeKeys(viewSpec.defaultColumns)
    : normalizeKeys(
        viewSpec.columns
          .filter((col) => col.defaultVisible !== false)
          .map((col) => col.key)
      );
  const merged = [...base, ...requiredKeys];
  return Array.from(new Set(merged));
};

const buildColumnsByGroup = <Row,>(columns: SheetColumnDef<Row>[]) => {
  const map = new Map<string, SheetColumnDef<Row>[]>();
  const order: string[] = [];
  for (const col of columns) {
    const group = col.group || "Columns";
    if (!map.has(group)) {
      map.set(group, []);
      order.push(group);
    }
    map.get(group)?.push(col);
  }
  return order.map((group) => [group, map.get(group) || []] as const);
};

export function useSheetColumnSelection<Row>(
  options: UseSheetColumnSelectionOptions<Row>
): SheetColumnSelectionState<Row> {
  const { moduleKey, viewId, scope, viewSpec } = options;
  const relevanceByKey = options.relevanceByKey || {};
  const storageKey = useMemo(
    () => buildSheetColumnsStorageKey({ moduleKey, viewId, scope }),
    [moduleKey, scope, viewId]
  );

  const columns = useMemo(() => {
    assertColumnDefs(viewSpec.columns, `${moduleKey}:${viewId}:${scope}`);
    return viewSpec.columns;
  }, [moduleKey, scope, viewId, viewSpec.columns]);

  const requiredKeys = useMemo(
    () => columns.filter((col) => col.hideable === false).map((col) => col.key),
    [columns]
  );

  const defaultKeys = useMemo(
    () => getDefaultKeys(viewSpec, requiredKeys),
    [requiredKeys, viewSpec]
  );

  const allowedKeys = useMemo(
    () => new Set(columns.map((col) => col.key)),
    [columns]
  );

  const [selectedKeys, setSelectedKeysState] = useState<string[]>(defaultKeys);
  const [widthPresetByKey, setWidthPresetByKey] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const stored = readSheetColumnsStorage(storageKey);
    if (!stored?.columns?.length) {
      setSelectedKeysState(defaultKeys);
    } else {
      const normalized = normalizeKeys(stored.columns)
        .filter((key) => allowedKeys.has(key))
        .concat(requiredKeys);
      const deduped = Array.from(new Set(normalized));
      setSelectedKeysState(deduped.length ? deduped : defaultKeys);
    }
    const presetMap: Record<string, string> = {};
    const storedPresets = stored?.widthPresetByKey || {};
    for (const col of columns) {
      const presetId =
        storedPresets[col.key] ||
        col.defaultWidthPresetId ||
        undefined;
      if (presetId) presetMap[col.key] = presetId;
    }
    setWidthPresetByKey(presetMap);
  }, [allowedKeys, columns, defaultKeys, storageKey]);

  useEffect(() => {
    writeSheetColumnsStorage(storageKey, {
      version: 1,
      columns: normalizeKeys(selectedKeys),
      widthPresetByKey,
    });
  }, [selectedKeys, storageKey, widthPresetByKey]);

  const setSelectedKeys = (next: string[]) => {
    const normalized = normalizeKeys(next)
      .filter((key) => allowedKeys.has(key))
      .concat(requiredKeys);
    setSelectedKeysState(Array.from(new Set(normalized)));
  };

  const resetToDefault = () => setSelectedKeysState(defaultKeys);

  const selectedColumns = useMemo(() => {
    const byKey = new Map(columns.map((col) => [col.key, col] as const));
    return selectedKeys
      .map((key) => byKey.get(key))
      .filter(Boolean) as SheetColumnDef<Row>[];
  }, [columns, selectedKeys]);

  const columnsByGroup = useMemo(
    () => buildColumnsByGroup(columns),
    [columns]
  );

  const setWidthPreset = (key: string, presetId: string) => {
    setWidthPresetByKey((prev) => ({
      ...prev,
      [key]: presetId,
    }));
  };

  return {
    selectedKeys,
    setSelectedKeys,
    resetToDefault,
    columns,
    selectedColumns,
    columnsByGroup,
    defaultKeys,
    relevanceByKey,
    widthPresetByKey,
    setWidthPreset,
    storageKey,
  };
}
