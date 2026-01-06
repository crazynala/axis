import type { ReactNode } from "react";
import type { DataTableColumn } from "mantine-datatable";

export type ColumnDef<T = Record<string, any>> = {
  key: string;
  title: string;
  accessor?: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  sortKey?: string;
  defaultVisible?: boolean;
  hideable?: boolean;
  layout?: {
    width?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;
    grow?: number;
    align?: "left" | "center" | "right";
  };
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  grow?: number;
  align?: "left" | "center" | "right";
  group?: string;
};

const isDev = process.env.NODE_ENV !== "production";

export const assertColumnDefs = (defs: ColumnDef[], moduleKey?: string) => {
  if (!isDev) return;
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const def of defs) {
    const key = def?.key;
    if (typeof key !== "string" || key.trim() === "") {
      errors.push("key must be a non-empty string");
      continue;
    }
    if (key.includes(".") || /\s/.test(key)) {
      errors.push(`key "${key}" must not include dots or whitespace`);
    }
    if (seen.has(key)) {
      errors.push(`duplicate key "${key}"`);
    }
    seen.add(key);
  }
  if (errors.length) {
    const context = moduleKey ? ` module=${moduleKey}` : "";
    throw new Error(`[columns] Invalid column keys.${context} ${errors.join("; ")}`);
  }
};

export const normalizeColumnsValue = (
  value: string[] | string | null | undefined
) => {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

export const columnsToParam = (keys: string[]) =>
  keys.map((k) => String(k).trim()).filter(Boolean).join(",");

export const getDefaultColumnKeys = (defs: ColumnDef[], moduleKey?: string) => {
  assertColumnDefs(defs, moduleKey);
  return defs
    .filter((d) => d.defaultVisible !== false)
    .map((d) => d.key);
};

export const getVisibleColumnKeys = (options: {
  defs: ColumnDef[];
  urlColumns?: string | null;
  viewColumns?: string[] | string | null;
  viewMode?: boolean;
  moduleKey?: string;
}) => {
  const { defs, urlColumns, viewColumns, viewMode, moduleKey } = options;
  const defaults = getDefaultColumnKeys(defs, moduleKey);
  const fromUrl = normalizeColumnsValue(urlColumns);
  const fromView = normalizeColumnsValue(viewColumns);
  const effective =
    fromUrl.length > 0
      ? fromUrl
      : viewMode && fromView.length > 0
      ? fromView
      : defaults;
  const allowed = new Set(defs.map((d) => d.key));
  return effective.filter((k) => allowed.has(k));
};

export const buildTableColumns = <T,>(
  defs: ColumnDef<T>[],
  visibleKeys: string[],
  moduleKey?: string
) => {
  assertColumnDefs(defs, moduleKey);
  const defaultMinWidth = 120;
  const narrowWidthByKey: Record<string, number> = {
    id: 70,
    sku: 140,
    type: 90,
  };
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const columns: DataTableColumn<T>[] = [];
  for (const key of visibleKeys) {
    const def = byKey.get(key);
    if (!def) continue;
    const accessor = def.sortKey || def.accessor || def.key;
    const layout = def.layout;
    const width =
      (layout?.width ?? def.width ?? narrowWidthByKey[def.key]) as any;
    const minWidth =
      (layout?.minWidth ??
        def.minWidth ??
        (typeof width === "number" ? width : defaultMinWidth)) as any;
    columns.push({
      accessor: accessor as any,
      title: def.title,
      sortable: def.sortable,
      width,
      minWidth,
      maxWidth: (layout?.maxWidth ?? def.maxWidth) as any,
      grow: (layout?.grow ?? def.grow) as any,
      render: def.render as any,
      textAlign: (layout?.align ?? def.align) as any,
    });
  }
  return columns;
};

export const sameColumnOrder = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};
