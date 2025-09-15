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
    const row = el.querySelector<HTMLTableRowElement>(
      `tbody tr[data-row-id="${currentId}"]`
    );
    if (row) {
      row.classList.add(activeClassName);
      row.setAttribute("aria-selected", "true");
      row.setAttribute("tabIndex", "-1");
      // Always ensure selected row is centered within the scroll viewport
      try {
        row.scrollIntoView({ block: "center" });
      } catch {}
      try {
        row.focus({ preventScroll: true });
      } catch {}
      pendingScrollRef.current = false;
    } else {
      // Row not yet rendered (maybe window not large enough or hydration pending) -> attempt after next records update
      pendingScrollRef.current = true;
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
  }, [currentId, activeClassName]);

  // Retry pending scroll once records update if needed
  useEffect(() => {
    if (!pendingScrollRef.current || currentId == null) return;
    const el = containerRef.current;
    if (!el) return;
    const row = el.querySelector<HTMLTableRowElement>(
      `tbody tr[data-row-id="${currentId}"]`
    );
    if (row) {
      row.classList.add(activeClassName);
      row.setAttribute("aria-selected", "true");
      row.setAttribute("tabIndex", "-1");
      try {
        row.scrollIntoView({ block: "center" });
      } catch {}
      try {
        row.focus({ preventScroll: true });
      } catch {}
      pendingScrollRef.current = false;
    }
  }, [records, currentId, activeClassName]);

  // Component-level keyboard navigation removed; global RecordProvider now owns Arrow/Home/End navigation to avoid double stepping.
  // We still support activation (Enter/Space) by listening on rows themselves below.

  // Decorate rows with data-row-id after mount/update
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rows = el.querySelectorAll<HTMLTableRowElement>("tbody tr");
    rows.forEach((tr, i) => {
      const rec = (records as any)[i];
      if (rec && rec.id != null) tr.setAttribute("data-row-id", String(rec.id));
      tr.addEventListener("dblclick", () => {
        if (rec) onActivate?.(rec);
      });
      tr.addEventListener("click", () => setCurrentId(rec?.id));
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          if (rec) {
            e.preventDefault();
            onActivate?.(rec);
          }
        }
      };
      tr.addEventListener("keydown", keyHandler);
    });
  }, [records, onActivate, setCurrentId]);

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
      let available = Math.max(100, vh - rect.top - 8); // 8px breathing room
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
        fetching={fetching}
        withTableBorder
        height={effectiveHeight}
        scrollAreaProps={{ tabIndex: 0 }}
        sortStatus={sortStatus as any}
        onSortStatusChange={onSortStatusChange as any}
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
      `}
      </style>
    </div>
  );
}

export default NavDataTable;
