import { useMemo } from "react";
import { useNavigate, useSearchParams } from "@remix-run/react";
import { useHybridWindow } from "~/base/record/useHybridWindow";
import {
  buildTableColumns,
  getVisibleColumnKeys,
  type ColumnDef,
} from "~/base/index/columns";

type SortStatus = {
  columnAccessor: string;
  direction: "asc" | "desc";
};

type HybridIndexTableOptions<T> = {
  module: string;
  columns: ColumnDef<T>[];
  viewColumns?: string[] | string | null;
  viewMode?: boolean;
  rowEndpointPath?: string;
  initialWindow?: number;
  batchIncrement?: number;
  maxPlaceholders?: number;
  enableSorting?: boolean;
  sortDefault?: SortStatus;
};

export function useHybridIndexTable<T>({
  module,
  columns,
  viewColumns,
  viewMode,
  rowEndpointPath,
  initialWindow,
  batchIncrement,
  maxPlaceholders,
  enableSorting = true,
  sortDefault,
}: HybridIndexTableOptions<T>) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { records, fetching, loading, requestMore, atEnd, total } =
    useHybridWindow({
      module,
      rowEndpointPath,
      initialWindow,
      batchIncrement,
      maxPlaceholders,
    });

  const visibleColumnKeys = useMemo(
    () =>
      getVisibleColumnKeys({
        defs: columns,
        urlColumns: sp.get("columns"),
        viewColumns,
        viewMode,
        moduleKey: module,
      }),
    [columns, sp, viewColumns, viewMode, module]
  );

  const tableColumns = useMemo(
    () => buildTableColumns(columns, visibleColumnKeys, module),
    [columns, visibleColumnKeys, module]
  );

  const sortStatus = enableSorting
    ? ({
        columnAccessor:
          sp.get("sort") || sortDefault?.columnAccessor || "id",
        direction: (sp.get("dir") as SortStatus["direction"]) ||
          sortDefault?.direction ||
          "desc",
      } as SortStatus)
    : undefined;

  const onSortStatusChange = enableSorting
    ? (nextSort: SortStatus) => {
        const next = new URLSearchParams(sp);
        next.set("sort", nextSort.columnAccessor);
        next.set("dir", nextSort.direction);
        navigate(`?${next.toString()}`);
      }
    : undefined;

  return {
    records,
    columns: tableColumns,
    sortStatus,
    onSortStatusChange,
    onReachEnd: () => {
      if (!atEnd) requestMore();
    },
    requestMore,
    fetching,
    loading,
    atEnd,
    total,
  };
}
