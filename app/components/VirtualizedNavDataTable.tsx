import React, { useRef, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, ScrollArea, Box, Text, Group, Button, Checkbox } from "@mantine/core";
import type { DataTableColumn, DataTableSortStatus } from "mantine-datatable";
import { useRecords } from "../base/record/RecordContext";

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
  renderPlaceholderCell?: (index: number, col: DataTableColumn<T>) => React.ReactNode;
  sortStatus?: DataTableSortStatus<keyof T>;
  onSortStatusChange?: (sortStatus: DataTableSortStatus<keyof T>) => void;
  footer?: React.ReactNode;
  overscan?: number;
  debug?: boolean;
  // Multiselect & bulk actions
  multiselect?: boolean;
  bulkActions?: Array<{
    label: string;
    onClick: (selectedIds: Array<string | number>) => void;
    color?: string;
    variant?: any;
  }>;
  onSelectionChange?: (selectedIds: Array<string | number>) => void;
  getRowId?: (record: T) => string | number;
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
  multiselect = false,
  bulkActions,
  onSelectionChange,
  getRowId,
}: VirtualizedNavDataTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { currentId: ctxCurrentId, setCurrentId: ctxSetCurrentId } = useRecords();

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
  }, [virtualizer, records, onVisibleRangeChange, onRequestMissing, isIndexLoaded, count]);

  // Auto-select first loaded row when there is no current selection
  useEffect(() => {
    const selected = currentId ?? ctxCurrentId;
    if (selected != null) return;
    const first = records.find((r: any) => r && r.id != null) as any;
    if (first && ctxSetCurrentId) {
      ctxSetCurrentId(first.id);
    }
  }, [records, currentId, ctxCurrentId, ctxSetCurrentId]);

  // Scroll to currentId
  useEffect(() => {
    const selected = currentId ?? ctxCurrentId;
    if (selected == null) return;
    const index = records.findIndex((r: any) => r?.id === selected);
    if (index >= 0) {
      log("scrollToIndex", { currentId: selected, index });
      virtualizer.scrollToIndex(index, { align: "center" });
    }
  }, [currentId, ctxCurrentId, records, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length ? Math.max(0, virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1].start + virtualItems[virtualItems.length - 1].size)) : 0;

  // Multiselect state and helpers
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const resolveId = (rec: any): string | number | undefined => {
    if (!rec) return undefined;
    if (getRowId) return getRowId(rec as T);
    return (rec as any)?.id;
  };
  const setSel = (updater: (prev: Set<string | number>) => Set<string | number>) => {
    setSelectedIds((prev) => {
      const next = updater(prev);
      onSelectionChange?.(Array.from(next));
      return next;
    });
  };
  const toggleId = (id: string | number, checked: boolean) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleRange = (fromIndex: number, toIndex: number, checked: boolean) => {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    setSel((prev) => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) {
        const rec: any = records[i];
        const id = resolveId(rec);
        if (id == null) continue;
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const clearSelection = () => setSel(() => new Set());
  const hasSelection = multiselect && selectedIds.size > 0;
  const colCount = columns.length + (multiselect ? 1 : 0);

  return (
    <Box ref={containerRef} style={{ height: effectiveHeight }}>
      <ScrollArea viewportRef={parentRef} style={{ height: "100%" }}>
        <Table highlightOnHover style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            {multiselect && <col style={{ width: 36 }} />}
            {columns.map((column, index) => (
              <col style={{ width: column.width || "auto" }} key={index} />
            ))}
          </colgroup>
          <Table.Thead
            style={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              backgroundColor: "var(--mantine-color-body)",
            }}
          >
            {hasSelection ? (
              <Table.Tr>
                <Table.Th colSpan={colCount} style={{ padding: 8 }}>
                  <Group justify="space-between" align="center">
                    <Text size="sm">Selected: {selectedIds.size}</Text>
                    <Group gap="xs">
                      {bulkActions?.map((a, i) => (
                        <Button key={i} size="xs" variant={a.variant || "light"} color={a.color} onClick={() => a.onClick(Array.from(selectedIds))}>
                          {a.label}
                        </Button>
                      ))}
                      <Button size="xs" variant="subtle" onClick={clearSelection}>
                        Clear
                      </Button>
                    </Group>
                  </Group>
                </Table.Th>
              </Table.Tr>
            ) : (
              <Table.Tr>
                {multiselect && <Table.Th style={{ width: 36 }} />}
                {columns.map((column, index) => {
                  const align: React.CSSProperties["textAlign"] =
                    (column as any).align || ((column as any).justify === "start" ? "left" : (column as any).justify === "end" ? "right" : (column as any).justify === "center" ? "center" : undefined);
                  return (
                    <Table.Th
                      key={index}
                      style={{
                        cursor: column.sortable ? "pointer" : "default",
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--mantine-color-gray-3)",
                        textAlign: align,
                      }}
                      onClick={() => {
                        if (column.sortable && onSortStatusChange && column.accessor) {
                          const newDirection = sortStatus?.columnAccessor === column.accessor && sortStatus.direction === "asc" ? "desc" : "asc";
                          onSortStatusChange({
                            columnAccessor: column.accessor as any,
                            direction: newDirection,
                          });
                        }
                      }}
                    >
                      <Box
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          width: "100%",
                          justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
                        }}
                      >
                        {column.title}
                        {column.sortable && sortStatus?.columnAccessor === column.accessor && <Text size="xs">{sortStatus.direction === "asc" ? "↑" : "↓"}</Text>}
                      </Box>
                    </Table.Th>
                  );
                })}
              </Table.Tr>
            )}
          </Table.Thead>
          <Table.Tbody>
            {paddingTop > 0 && (
              <Table.Tr>
                <Table.Td colSpan={colCount} style={{ height: paddingTop, padding: 0, border: 0 }} />
              </Table.Tr>
            )}

            {virtualItems.map((virtualRow, localIndex) => {
              const record = records[virtualRow.index] as T | undefined;
              const loaded = !!record;
              const selectedId = currentId ?? ctxCurrentId;
              const isSelected = loaded && selectedId != null && (record as any)?.id === selectedId;
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
                    backgroundColor: isSelected ? "var(--mantine-color-blue-light)" : undefined,
                    cursor: loaded ? "pointer" : "default",
                    opacity: loaded ? 1 : 0.55,
                  }}
                  aria-selected={isSelected || undefined}
                  onClick={() => loaded && onRowClick?.(record as T, virtualRow.index)}
                  onDoubleClick={() => loaded && onRowDoubleClick?.(record as T, virtualRow.index)}
                >
                  {multiselect && (
                    <Table.Td style={{ width: 36 }}>
                      {loaded ? (
                        <Checkbox
                          checked={selectedIds.has(resolveId(record as any)!)}
                          onChange={(e) => {
                            e.stopPropagation();
                            const id = resolveId(record as any);
                            if (id == null) return;
                            const rowIndex = virtualRow.index;
                            const shift = (e.nativeEvent as MouseEvent).shiftKey;
                            const nextChecked = e.currentTarget.checked;
                            if (shift && lastClickedIndex != null) {
                              toggleRange(lastClickedIndex, rowIndex, nextChecked);
                            } else {
                              toggleId(id, nextChecked);
                            }
                            setLastClickedIndex(rowIndex);
                          }}
                          aria-label="Select row"
                        />
                      ) : (
                        <span style={{ color: "var(--mantine-color-dimmed)" }}>…</span>
                      )}
                    </Table.Td>
                  )}
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
                    const align: React.CSSProperties["textAlign"] =
                      (column as any).align ||
                      ((column as any).justify === "start" ? "left" : (column as any).justify === "end" ? "right" : (column as any).justify === "center" ? "center" : undefined);
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
                          color: loaded ? undefined : "var(--mantine-color-dimmed)",
                          textAlign: align,
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
                <Table.Td colSpan={colCount} style={{ height: paddingBottom, padding: 0, border: 0 }} />
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {/* {footer && (
        <Box
          p="xs"
          style={{ borderTop: "1px solid var(--mantine-color-gray-3)" }}
        >
          {footer}
        </Box>
      )} */}
    </Box>
  );
}
