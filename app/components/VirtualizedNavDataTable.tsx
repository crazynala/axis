import React, { useRef, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, ScrollArea, Box, Text } from "@mantine/core";
import type { DataTableColumn, DataTableSortStatus } from "mantine-datatable";

interface VirtualizedNavDataTableProps<T = Record<string, any>> {
  records: (T | undefined)[];
  columns: DataTableColumn<T>[];
  onRowClick?: (record: T, rowIndex: number) => void;
  onRowDoubleClick?: (record: T, rowIndex: number) => void;
  currentId?: string | number | null;
  height?: number | string;
  autoHeightOffset?: number;
  rowHeight?: number;
  onReachEnd?: () => void;
  totalCount?: number;
  onVisibleRangeChange?: (range: { start: number; end: number }) => void;
  onRequestMissing?: (indexes: number[]) => void;
  isIndexLoaded?: (index: number) => boolean;
  renderPlaceholderCell?: (
    index: number,
    col: DataTableColumn<T>
  ) => React.ReactNode;
  sortStatus?: DataTableSortStatus<keyof T>;
  onSortStatusChange?: (sortStatus: DataTableSortStatus<keyof T>) => void;
  footer?: React.ReactNode;
  overscan?: number;
  debug?: boolean;
}

export function VirtualizedNavDataTable<T = Record<string, any>>({
  records,
  columns,
  onRowClick,
  onRowDoubleClick,
  currentId,
  height,
  autoHeightOffset = 0,
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
  const containerRef = useRef<HTMLDivElement>(null);

  const count = totalCount ?? records.length;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const log = (...args: any[]) => {
    if (!debug) return;
    // eslint-disable-next-line no-console
    console.debug("[VirtualizedNavDataTable]", ...args);
  };

  // Auto-height when no explicit height
  const [autoHeight, setAutoHeight] = useState<number | null>(null);
  useEffect(() => {
    if (height != null) return;
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      let available = Math.max(100, vh - rect.top - 24);
      if (autoHeightOffset) available -= autoHeightOffset;
      if (available < 100) available = 100;
      setAutoHeight(available);
      try {
        virtualizer.measure();
      } catch {}
    };
    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(document.body);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [height, autoHeightOffset, virtualizer]);

  const effectiveHeight = height != null ? height : autoHeight ?? 300;

  // Trigger reach-end when near the end (non-sparse)
  useEffect(() => {
    if (totalCount && totalCount !== records.length) return;
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

  // Visible range + request missing indexes
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
    count,
  ]);

  // Scroll to currentId
  useEffect(() => {
    if (currentId == null) return;
    const index = records.findIndex((r: any) => r?.id === currentId);
    if (index >= 0) {
      log("scrollToIndex", { currentId, index });
      virtualizer.scrollToIndex(index, { align: "center" });
    }
  }, [currentId, records, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length
    ? Math.max(
        0,
        virtualizer.getTotalSize() -
          (virtualItems[virtualItems.length - 1].start +
            virtualItems[virtualItems.length - 1].size)
      )
    : 0;

  return (
    <Box ref={containerRef} style={{ height: effectiveHeight }}>
      <ScrollArea viewportRef={parentRef} style={{ height: "100%" }}>
        <Table highlightOnHover style={{ tableLayout: "fixed", width: "100%" }}>
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
            {paddingTop > 0 && (
              <Table.Tr>
                <Table.Td
                  colSpan={columns.length}
                  style={{ height: paddingTop, padding: 0, border: 0 }}
                />
              </Table.Tr>
            )}

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
                    loaded && onRowDoubleClick?.(record as T, virtualRow.index)
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

            {paddingBottom > 0 && (
              <Table.Tr>
                <Table.Td
                  colSpan={columns.length}
                  style={{ height: paddingBottom, padding: 0, border: 0 }}
                />
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
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
