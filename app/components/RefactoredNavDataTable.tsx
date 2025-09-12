import React, { useEffect, useRef, useCallback, useState } from "react";
import { DataTable as MantineDataTable } from "mantine-datatable";
import { useRecordContext } from "../record/RecordContext";

interface RefNavTableProps<T extends Record<string, any>> {
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
  height?: number | string;
  fetching?: boolean;
  scrollViewportRef?: React.RefObject<HTMLDivElement>;
  /** Optional footer (e.g. loading / end-of-results indicator) rendered inside scroll container */
  footer?: React.ReactNode;
}

export function RefactoredNavDataTable<T extends Record<string, any>>({
  module,
  records,
  columns,
  onActivate,
  onReachEnd,
  autoSelectFirst = true,
  activeClassName = "nav-data-table-row-focused",
  height = 500,
  fetching,
  scrollViewportRef,
  footer,
}: RefNavTableProps<T>) {
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
      const rowRect = row.getBoundingClientRect();
      const parentRect = el.getBoundingClientRect();
      if (rowRect.top < parentRect.top || rowRect.bottom > parentRect.bottom) {
        row.scrollIntoView({ block: "center" });
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
  }, [currentId, activeClassName]);

  // Keyboard navigation: up/down/home/end sets currentId
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (module !== state?.module) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (currentId == null) {
          if (records.length) setCurrentId((records as any)[0].id);
        } else {
          const nxt = nextId(currentId);
          if (nxt != null) setCurrentId(nxt);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (currentId == null) {
          if (records.length)
            setCurrentId((records as any)[records.length - 1].id);
        } else {
          const prv = prevId(currentId);
          if (prv != null) setCurrentId(prv);
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        if (records.length) setCurrentId((records as any)[0].id);
      } else if (e.key === "End") {
        e.preventDefault();
        if (records.length)
          setCurrentId((records as any)[records.length - 1].id);
      } else if (e.key === "Enter" || e.key === " ") {
        if (currentId != null) {
          const idx = records.findIndex(
            (r: any) => String(r.id) === String(currentId)
          );
          if (idx >= 0) {
            e.preventDefault();
            onActivate?.(records[idx]);
          }
        }
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [
    currentId,
    nextId,
    prevId,
    records,
    setCurrentId,
    onActivate,
    state?.module,
    module,
  ]);

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

  return (
    <div
      ref={containerRef as any}
      style={{ position: "relative", height, overflow: "hidden" }}
      data-module={module}
    >
      {/* Outer wrapper no longer scrolls; Mantine's internal ScrollArea handles scrolling to avoid double scrollbars. */}
      <MantineDataTable
        records={records}
        columns={columns as any}
        fetching={fetching}
        withTableBorder
        height={height}
        scrollAreaProps={{ tabIndex: 0 }}
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

export default RefactoredNavDataTable;
