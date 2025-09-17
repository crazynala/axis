import React, { useRef, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Table, ScrollArea, Box } from "@mantine/core";

export interface VirtualizedReactTableProps<T extends object> {
  data: T[]; // Hydrated records (may be sparse if using placeholders strategy)
  columns: ColumnDef<T, any>[]; // React Table column defs
  sorting?: SortingState;
  onSortingChange?: (updater: SortingState) => void;
  /** Total number of rows server-side (for sparse loading). If omitted, data.length is used. */
  totalCount?: number;
  /** Called with the visible index window (after overscan) each render */
  onVisibleRangeChange?: (range: { start: number; end: number }) => void;
  /** Ask parent to load the given indexes that are currently missing */
  onRequestMissing?: (indexes: number[]) => void;
  /** Return true if a given index is loaded (else treated as placeholder). Default: index < data.length && !!data[index] */
  isIndexLoaded?: (index: number) => boolean;
  /** Placeholder renderer for unloaded rows */
  renderPlaceholderRow?: (index: number) => React.ReactNode;
  /** Row height estimate */
  rowHeight?: number;
  /** Component height */
  height?: number | string;
  overscan?: number;
  /** Enable verbose console.debug instrumentation */
  debug?: boolean;
}

export function VirtualizedReactTable<T extends object>(
  props: VirtualizedReactTableProps<T>
) {
  const {
    data,
    columns,
    sorting,
    onSortingChange,
    totalCount,
    onVisibleRangeChange,
    onRequestMissing,
    isIndexLoaded,
    renderPlaceholderRow,
    rowHeight = 34,
    height = 600,
    overscan = 20,
    debug = false,
  } = props;

  // React Table instance
  const table = useReactTable<T>({
    data,
    columns,
    state: { sorting: sorting ?? [] },
    onSortingChange: (updater) => {
      if (!onSortingChange) return;
      if (typeof updater === "function") {
        const next = updater(sorting ?? []);
        onSortingChange(next);
      } else {
        onSortingChange(updater);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: false,
  });

  const rows = table.getRowModel().rows;
  const count = totalCount ?? rows.length;
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();

  function d(...args: any[]) {
    if (debug) console.debug("[VirtualizedReactTable]", ...args);
  }

  // Visibility & missing indexes effect
  useEffect(() => {
    if (!virtualItems.length) return;
    const start = virtualItems[0].index;
    const end = virtualItems[virtualItems.length - 1].index;
    onVisibleRangeChange?.({ start, end });

    if (onRequestMissing) {
      const missing: number[] = [];
      for (let i = start; i <= end; i++) {
        const loaded = isIndexLoaded
          ? isIndexLoaded(i)
          : i < data.length && !!data[i];
        if (!loaded) missing.push(i);
      }
      if (missing.length) {
        d("visible range", { start, end, count: end - start + 1 });
        d("missing indexes", missing);
        onRequestMissing(missing);
      } else {
        d("visible range (all loaded)", { start, end });
      }
    }
  }, [
    virtualItems,
    data,
    isIndexLoaded,
    onVisibleRangeChange,
    onRequestMissing,
  ]);

  useEffect(() => {
    if (!debug) return;
    d(
      "virtual items",
      virtualItems.map((v) => ({ i: v.index, start: v.start, size: v.size }))
    );
  }, [virtualItems, debug]);

  return (
    <Box style={{ height, display: "flex", flexDirection: "column" }}>
      <ScrollArea viewportRef={parentRef} style={{ flex: 1 }}>
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          <Table
            highlightOnHover
            style={{ tableLayout: "fixed", width: "100%" }}
          >
            <Table.Thead
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "var(--mantine-color-body)",
              }}
            >
              {table.getHeaderGroups().map((hg) => (
                <Table.Tr key={hg.id}>
                  {hg.headers.map((header) => {
                    return (
                      <Table.Th
                        key={header.id}
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            style={{
                              cursor: header.column.getCanSort()
                                ? "pointer"
                                : "default",
                              userSelect: "none",
                            }}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {header.column.getIsSorted() === "asc" && " 🔼"}
                            {header.column.getIsSorted() === "desc" && " 🔽"}
                          </div>
                        )}
                      </Table.Th>
                    );
                  })}
                </Table.Tr>
              ))}
            </Table.Thead>
            <Table.Tbody>
              {virtualItems.map((vi, localIndex) => {
                const row = rows[vi.index];
                const loaded =
                  row &&
                  (isIndexLoaded
                    ? isIndexLoaded(vi.index)
                    : vi.index < data.length);
                if (debug && localIndex === 0) {
                  d("first row render sample", {
                    virtualIndex: vi.index,
                    loaded,
                    hasRow: !!row,
                  });
                }
                return (
                  <Table.Tr
                    key={row ? row.id : `placeholder-${vi.index}`}
                    style={{
                      height: vi.size,
                      transform: `translateY(${
                        vi.start - localIndex * vi.size
                      }px)`,
                      opacity: loaded ? 1 : 0.5,
                    }}
                  >
                    {loaded ? (
                      row.getVisibleCells().map((cell) => (
                        <Table.Td
                          key={cell.id}
                          style={{
                            padding: "6px 10px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </Table.Td>
                      ))
                    ) : (
                      <Table.Td
                        colSpan={columns.length}
                        style={{
                          padding: "6px 10px",
                          fontStyle: "italic",
                          color: "var(--mantine-color-dimmed)",
                        }}
                      >
                        {renderPlaceholderRow?.(vi.index) ??
                          `Loading row ${vi.index + 1}...`}
                      </Table.Td>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </div>
      </ScrollArea>
    </Box>
  );
}
