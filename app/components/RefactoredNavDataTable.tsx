import React, { useEffect, useRef, useCallback, useState } from "react";
import { DataTable as MantineDataTable } from "mantine-datatable";
import { useRecordContext } from "../record/RecordContext";

interface NavTableProps<T extends Record<string, any>> {
  module: string;
  records: T[];
  columns: any[];
  /** Called when user activates current row (Enter/Space or double click) */
  onActivate?: (record: T) => void;
  /** Request more data when bottom reached */
  onReachEnd?: () => void;
  /** Auto select first record if no currentId set */
  autoSelectFirst?: boolean;
  /** Class applied to active row */
  activeClassName?: string;
  /** Optional fixed height. If omitted, table will auto-fill available vertical space (viewport minus bounding top + bottom margin). */
  height?: number | string;
  /** Additional pixels to subtract from computed auto height (e.g. for external padding) */
  autoHeightOffset?: number;
  fetching?: boolean;
  scrollViewportRef?: React.RefObject<HTMLDivElement>;
  /** Optional footer (e.g. loading / end-of-results indicator) rendered inside scroll container */
  footer?: React.ReactNode;
  /** Callback receiving the computed auto height (after offset) */
  onAutoHeightComputed?: (h: number) => void;
  /** Current sort status for Mantine DataTable (column accessor + direction) */
  sortStatus?: { columnAccessor: string; direction: "asc" | "desc" };
  /** Change handler for header click sorting */
  onSortStatusChange?: (s: {
    columnAccessor: string;
    direction: "asc" | "desc";
  }) => void;
}

// NOTE: This component was previously named RefactoredNavDataTable. It has been renamed to NavDataTable.
// Internal Arrow/Home/End navigation has been removed to avoid double-handling with the global RecordContext keyboard handler.
export function NavDataTable<T extends Record<string, any>>({
  module,
  records,
  columns,
  onActivate,
  onReachEnd,
  autoSelectFirst = true,
  activeClassName = "nav-data-table-row-focused",
  height,
  autoHeightOffset = 0,
  fetching,
  scrollViewportRef,
  footer,
  onAutoHeightComputed,
  sortStatus,
  onSortStatusChange,
}: NavTableProps<T>) {
  const { state, currentId, setCurrentId, nextId, prevId, getPathForId } =
    useRecordContext();
  const containerRef = scrollViewportRef || useRef<HTMLDivElement>(null);

  // Ensure selection exists
  useEffect(() => {
    if (module !== state?.module) return; // ignore if different module
    if (currentId == null && autoSelectFirst && records.length) {
      setCurrentId((records as any)[0].id);
    }
  }, [
    currentId,
    autoSelectFirst,
    records,
    setCurrentId,
    state?.module,
    module,
  ]);

  // Track last currentId to detect genuine selection change separate from record batch expansion
  const lastIdRef = useRef<any>(null);
  const initialScrollDoneRef = useRef(false);
  const pendingScrollRef = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (currentId == null) return;
    const changed = lastIdRef.current !== currentId;
    lastIdRef.current = currentId;
    // Only auto-scroll when selection actually changed or first time we establish a currentId
    if (!changed && initialScrollDoneRef.current) {
      // Still update highlighting classes even if not scrolling
      const all = el.querySelectorAll<HTMLTableRowElement>(
        "tbody tr[data-row-id]"
      );
      all.forEach((tr) => {
        if (String(tr.getAttribute("data-row-id")) === String(currentId)) {
          tr.classList.add(activeClassName);
          tr.setAttribute("aria-selected", "true");
        } else {
          tr.classList.remove(activeClassName);
          tr.removeAttribute("aria-selected");
        }
      });
      return;
    }

    // Try to find the specific row first
    const row = el.querySelector<HTMLTableRowElement>(
      `tbody tr[data-row-id="${currentId}"]`
    );

    if (row) {
      // Row exists, scroll to it precisely
      row.classList.add(activeClassName);
      row.setAttribute("aria-selected", "true");
      row.setAttribute("tabIndex", "-1");
      console.log("[NavDataTable] Scrolling to row", currentId);
      try {
        row.scrollIntoView({ block: "center" });
      } catch {}
      try {
        row.focus({ preventScroll: true });
      } catch {}
      pendingScrollRef.current = false;
    } else {
      // Check if we have the record data but it's still loading (placeholder)
      const record = records.find(
        (r: any) => String(r.id) === String(currentId)
      );
      if (record && record.__loading) {
        console.log(
          "[NavDataTable] Row found but still loading, setting pendingScrollRef for",
          currentId
        );
        pendingScrollRef.current = true;
      } else if (record) {
        console.log(
          "[NavDataTable] Row data available but DOM not ready, setting pendingScrollRef for",
          currentId
        );
        pendingScrollRef.current = true;
      } else {
        console.log(
          "[NavDataTable] Row not found, hybrid window may be expanding, setting pendingScrollRef for",
          currentId
        );
        pendingScrollRef.current = true;
      }
    }

    const all = el.querySelectorAll<HTMLTableRowElement>(
      "tbody tr[data-row-id]"
    );
    all.forEach((tr) => {
      if (String(tr.getAttribute("data-row-id")) !== String(currentId)) {
        tr.classList.remove(activeClassName);
        tr.removeAttribute("aria-selected");
      }
    });
    initialScrollDoneRef.current = true;
  }, [currentId, activeClassName]); // Remove records.length and state?.idList from dependency array

  // Retry pending scroll once records update if needed
  useEffect(() => {
    if (!pendingScrollRef.current || currentId == null) return;
    const el = containerRef.current;
    if (!el) return;
    const row = el.querySelector<HTMLTableRowElement>(
      `tbody tr[data-row-id="${currentId}"]`
    );

    if (row) {
      // Only scroll if this is not a loading placeholder
      const record = records.find(
        (r: any) => String(r.id) === String(currentId)
      );
      if (record && !record.__loading) {
        row.classList.add(activeClassName);
        row.setAttribute("aria-selected", "true");
        row.setAttribute("tabIndex", "-1");
        console.log("[NavDataTable] Retry scroll: scrolling to row", currentId);
        try {
          // Don't use smooth scroll here to avoid additional animation
          row.scrollIntoView({ block: "center" });
        } catch {}
        try {
          row.focus({ preventScroll: true });
        } catch {}
        pendingScrollRef.current = false;
      }
    }
  }, [records, currentId, activeClassName]);

  // Component-level keyboard navigation removed; global RecordProvider now owns Arrow/Home/End navigation to avoid double stepping.
  // We still support activation (Enter/Space) by listening on rows themselves below.

  const rowClickHandler = useCallback(
    (record: any) => {
      setCurrentId(record?.id);
    },
    [setCurrentId]
  );

  const rowDoubleClickHandler = useCallback(
    (record: any) => {
      if (record) onActivate?.(record);
    },
    [onActivate]
  );

  const customRowAttributes = useCallback(
    (record: any) => {
      const attrs: Record<string, any> = {};

      // Set data-row-id for scroll targeting
      if (record && record.id != null) {
        attrs["data-row-id"] = String(record.id);
      }

      // Add keyboard activation handler
      attrs.onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          if (record) {
            e.preventDefault();
            onActivate?.(record);
          }
        }
      };

      return attrs;
    },
    [onActivate]
  );

  // Scroll / infinite load listener attaches to internal Mantine ScrollArea viewport, not the wrapper.
  useEffect(() => {
    const wrapper = containerRef.current;
    if (!wrapper) return;
    const findViewport = () =>
      wrapper.querySelector<HTMLDivElement>(".mantine-ScrollArea-viewport");
    let viewport = findViewport();
    if (!viewport) {
      // DataTable might render async; attempt a short delayed find
      const t = setTimeout(() => {
        viewport = findViewport();
        if (viewport) attach();
      }, 0);
      return () => clearTimeout(t);
    }
    const handleScroll = () => {
      if (!viewport || !onReachEnd) return;
      if (
        viewport.scrollTop + viewport.clientHeight >=
        viewport.scrollHeight - 60
      ) {
        console.log(
          "[NavDataTable] reached scroll end",
          viewport.scrollTop,
          viewport.clientHeight,
          viewport.scrollHeight
        );
        onReachEnd();
      }
    };
    function attach() {
      if (!viewport) return;
      viewport.addEventListener("scroll", handleScroll);
      // Focus viewport for keyboard nav if nothing focused inside already
      if (!viewport.contains(document.activeElement)) {
        setTimeout(() => {
          try {
            viewport?.focus();
          } catch {}
        }, 0);
      }
    }
    attach();
    return () => {
      viewport?.removeEventListener("scroll", handleScroll);
    };
  }, [onReachEnd]);

  // Auto-height calculation: if no explicit height prop, compute available viewport space.
  const [autoHeight, setAutoHeight] = useState<number | null>(null);
  useEffect(() => {
    if (height != null) return; // explicit height provided, skip auto sizing
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // distance from top of element to bottom of viewport
      let available = Math.max(100, vh - rect.top - 24); // 8px breathing room
      if (autoHeightOffset) available -= autoHeightOffset;
      // Ensure we don't go negative
      if (available < 100) available = 100;
      setAutoHeight(available);
      onAutoHeightComputed?.(available);
    };
    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(document.body);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [height, autoHeightOffset, onAutoHeightComputed]);

  const effectiveHeight = height != null ? height : autoHeight ?? 300;

  return (
    <div
      ref={containerRef as any}
      style={{
        position: "relative",
        height: effectiveHeight,
        overflow: "hidden",
      }}
      data-module={module}
    >
      {/* Outer wrapper no longer scrolls; Mantine's internal ScrollArea handles scrolling to avoid double scrollbars. */}
      <MantineDataTable
        records={records}
        columns={columns as any}
        // fetching={fetching}
        withTableBorder
        stickyHeader
        stickyHeaderOffset={0}
        height={effectiveHeight}
        scrollAreaProps={{ tabIndex: 0 }}
        sortStatus={sortStatus as any}
        onSortStatusChange={onSortStatusChange as any}
        onRowClick={({ record }) => rowClickHandler(record)}
        onRowDoubleClick={({ record }) => rowDoubleClickHandler(record)}
        customRowAttributes={customRowAttributes}
      />
      {footer && (
        <div
          style={{
            padding: 8,
            fontSize: 12,
            opacity: 0.75,
            textAlign: "center",
          }}
        >
          {footer}
        </div>
      )}
      <style>
        {`
        .${activeClassName} {
          background-color: var(--mantine-color-blue-light, #e7f5ff) !important;
          box-shadow: 0 0 0 2px var(--mantine-color-blue-filled, #228be6) inset;
        }
        /* Fallback sticky header in case library prop changes; scoped to this container */
        [data-module="${module}"] .mantine-Table-table thead th,
        [data-module="${module}"] .mantine-Table-table thead td {
          position: sticky;
          top: 0;
          z-index: 2;
          background: var(--mantine-color-body, #fff);
        }
      `}
      </style>
    </div>
  );
}

export default NavDataTable;
