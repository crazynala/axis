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
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  grow?: number;
  align?: "left" | "center" | "right";
  group?: string;
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

export const getDefaultColumnKeys = (defs: ColumnDef[]) =>
  defs
    .filter((d) => d.defaultVisible !== false)
    .map((d) => d.key);

export const getVisibleColumnKeys = (options: {
  defs: ColumnDef[];
  urlColumns?: string | null;
  viewColumns?: string[] | string | null;
  viewMode?: boolean;
}) => {
  const { defs, urlColumns, viewColumns, viewMode } = options;
  const defaults = getDefaultColumnKeys(defs);
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
  visibleKeys: string[]
) => {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const columns: DataTableColumn<T>[] = [];
  for (const key of visibleKeys) {
    const def = byKey.get(key);
    if (!def) continue;
    const accessor = def.sortKey || def.accessor || def.key;
    columns.push({
      accessor: accessor as any,
      title: def.title,
      sortable: def.sortable,
      width: def.width as any,
      render: def.render as any,
      textAlign: def.align as any,
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
