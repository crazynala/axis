import React, { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, ScrollArea, Box, Text } from "@mantine/core";
import type { DataTableColumn, DataTableSortStatus } from "mantine-datatable";

interface VirtualizedNavDataTableProps<T = Record<string, any>> {
  records: (T | undefined)[]; // may contain holes/placeholders
  columns: DataTableColumn<T>[];
  onRowClick?: (record: T, rowIndex: number) => void;
  onRowDoubleClick?: (record: T, rowIndex: number) => void;
  currentId?: string | number | null;
  height?: number | string;
  rowHeight?: number;
  onReachEnd?: () => void; // legacy incremental append trigger (when near end of loaded slice)
  totalCount?: number; // total rows available server-side (for sparse mode)
  onVisibleRangeChange?: (range: { start: number; end: number }) => void;
  onRequestMissing?: (indexes: number[]) => void; // request hydration of missing indexes
  isIndexLoaded?: (index: number) => boolean; // custom loaded check
  renderPlaceholderCell?: (
    index: number,
    col: DataTableColumn<T>
  ) => React.ReactNode;
  sortStatus?: DataTableSortStatus<keyof T>;
  onSortStatusChange?: (sortStatus: DataTableSortStatus<keyof T>) => void;
  footer?: React.ReactNode;
  overscan?: number;
  debug?: boolean; // enable verbose console logging for virtualization lifecycle
}

export function VirtualizedNavDataTable<T = Record<string, any>>({
  records,
  columns,
  onRowClick,
  onRowDoubleClick,
  currentId,
  height = 600,
  rowHeight = 35,
  onReachEnd,
  totalCount,
  onVisibleRangeChange,
  onRequestMissing,
  isIndexLoaded,
  renderPlaceholderCell,
  sortStatus,
  onSortStatusChange,
  footer,
  overscan = 12,
  debug = false,
}: VirtualizedNavDataTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const count = totalCount ?? records.length;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  // Debug helper
  const log = (...args: any[]) => {
    if (!debug) return;
    // eslint-disable-next-line no-console
    console.debug("[VirtualizedNavDataTable]", ...args);
  };

  // Handle scroll to end (incremental append mode only when not sparse)
  useEffect(() => {
    if (totalCount && totalCount !== records.length) return; // skip if sparse total known but not fully loaded
    const items = virtualizer.getVirtualItems();
    if (!items.length) return;
    const lastItem = items[items.length - 1];
    if (lastItem && lastItem.index >= records.length - 20) {
      log("onReachEnd trigger", {
        lastIndex: lastItem.index,
        loaded: records.length,
      });
      onReachEnd?.();
    }
  }, [virtualizer, records.length, onReachEnd, totalCount]);

  // Visible range + request missing
  useEffect(() => {
    const vis = virtualizer.getVirtualItems();
    if (!vis.length) return;
    const start = vis[0].index;
    const end = vis[vis.length - 1].index;
    log("visible range", { start, end, count, loaded: records.length });
    onVisibleRangeChange?.({ start, end });
    if (onRequestMissing) {
      const missing: number[] = [];
      for (let i = start; i <= end; i++) {
        const loaded = isIndexLoaded ? isIndexLoaded(i) : !!records[i];
        if (!loaded) missing.push(i);
      }
      if (missing.length) {
        log("request missing", missing);
        onRequestMissing(missing);
      }
    }
  }, [
    virtualizer,
    records,
    onVisibleRangeChange,
    onRequestMissing,
    isIndexLoaded,
  ]);

  // Scroll to current record when currentId changes
  useEffect(() => {
    if (currentId == null) return;

    const index = records.findIndex((record: any) => record.id === currentId);
    if (index >= 0) {
      log("scrollToIndex", { currentId, index });
      virtualizer.scrollToIndex(index, {
        align: "center",
        behavior: "smooth",
      });
    }
  }, [currentId, records, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <Box style={{ height }}>
      {/* Use viewportRef so virtualizer listens to the actual scrollable element */}
      <ScrollArea viewportRef={parentRef} style={{ height: "100%" }}>
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
                backgroundColor: "var(--mantine-color-body)",
              }}
            >
              <Table.Tr>
                {columns.map((column, index) => (
                  <Table.Th
                    key={index}
                    style={{
                      width: column.width || "auto",
                      cursor: column.sortable ? "pointer" : "default",
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--mantine-color-gray-3)",
                    }}
                    onClick={() => {
                      if (
                        column.sortable &&
                        onSortStatusChange &&
                        column.accessor
                      ) {
                        const newDirection =
                          sortStatus?.columnAccessor === column.accessor &&
                          sortStatus.direction === "asc"
                            ? "desc"
                            : "asc";

                        onSortStatusChange({
                          columnAccessor: column.accessor as any,
                          direction: newDirection,
                        });
                      }
                    }}
                  >
                    <Box
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      {column.title}
                      {column.sortable &&
                        sortStatus?.columnAccessor === column.accessor && (
                          <Text size="xs">
                            {sortStatus.direction === "asc" ? "↑" : "↓"}
                          </Text>
                        )}
                    </Box>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {virtualItems.map((virtualRow, localIndex) => {
                const record = records[virtualRow.index] as T | undefined;
                const loaded = !!record;
                const isSelected =
                  loaded &&
                  currentId != null &&
                  (record as any)?.id === currentId;
                if (debug && localIndex === 0) {
                  log("first row render sample", {
                    virtualIndex: virtualRow.index,
                    start: virtualRow.start,
                    size: virtualRow.size,
                    loaded,
                  });
                }
                return (
                  <Table.Tr
                    key={virtualRow.key}
                    data-row-id={loaded ? (record as any)?.id : undefined}
                    style={{
                      height: virtualRow.size,
                      // Table row translateY must subtract accumulated offset per docs
                      transform: `translateY(${
                        virtualRow.start - localIndex * virtualRow.size
                      }px)`,
                      backgroundColor: isSelected
                        ? "var(--mantine-color-blue-light)"
                        : undefined,
                      cursor: loaded ? "pointer" : "default",
                      opacity: loaded ? 1 : 0.55,
                    }}
                    onClick={() =>
                      loaded && onRowClick?.(record as T, virtualRow.index)
                    }
                    onDoubleClick={() =>
                      loaded &&
                      onRowDoubleClick?.(record as T, virtualRow.index)
                    }
                  >
                    {columns.map((column, colIndex) => {
                      const content = loaded
                        ? column.render
                          ? column.render(record as T, virtualRow.index)
                          : column.accessor
                          ? String((record as any)[column.accessor] ?? "")
                          : ""
                        : renderPlaceholderCell
                        ? renderPlaceholderCell(virtualRow.index, column)
                        : "…";
                      return (
                        <Table.Td
                          key={colIndex}
                          style={{
                            width: column.width || "auto",
                            padding: "8px 12px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontStyle: loaded ? undefined : "italic",
                            color: loaded
                              ? undefined
                              : "var(--mantine-color-dimmed)",
                          }}
                        >
                          {content}
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </div>
      </ScrollArea>

      {footer && (
        <Box
          p="xs"
          style={{ borderTop: "1px solid var(--mantine-color-gray-3)" }}
        >
          {footer}
        </Box>
      )}
    </Box>
  );
}
