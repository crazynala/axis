import React, { useEffect, useRef, useState, useCallback } from "react";
import { DataTable as MantineDataTable } from "mantine-datatable";

/**
 * NavDataTable: wraps mantine-datatable adding keyboard row focus + activation.
 * Features:
 *  - Arrow Up/Down/Home/End to move focus between tbody rows.
 *  - Enter / Space activates current row (calls onRowActivate or onRowClick fallback).
 *  - Auto-focus first row (configurable).
 *  - Visual highlight + aria-selected on focused row.
 */
export interface NavDataTableProps<T> extends Record<string, any> {
  records: T[];
  onRowActivate?: (record: T, index: number) => void;
  keyboardNavigation?: boolean; // default true
  autoFocusFirstRow?: boolean; // default true
  focusClassName?: string; // custom class for focused row
}

export function NavDataTable<T extends Record<string, any>>({
  records,
  columns,
  onRowActivate,
  onRowClick,
  keyboardNavigation = true,
  autoFocusFirstRow = true,
  focusClassName = "nav-data-table-row-focused",
  ...rest
}: NavDataTableProps<T> & { columns: any[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Activation helper
  const activate = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= records.length) return;
      const rec = records[idx];
      if (onRowActivate) onRowActivate(rec, idx);
      else if (onRowClick) onRowClick(rec, idx);
    },
    [records, onRowActivate, onRowClick]
  );

  // Move focus util
  const move = useCallback(
    (delta: number | "home" | "end") => {
      if (!keyboardNavigation) return;
      const rows = containerRef.current?.querySelectorAll<HTMLTableRowElement>("tbody tr");
      if (!rows || rows.length === 0) return;
      let next: number;
      if (delta === "home") next = 0;
      else if (delta === "end") next = rows.length - 1;
      else next = Math.min(rows.length - 1, Math.max(0, (focusedIndex ?? 0) + delta));
      const target = rows[next];
      if (target) {
        (target as HTMLElement).focus();
        setFocusedIndex(next);
      }
    },
    [focusedIndex, keyboardNavigation]
  );

  // Global key handler at container
  useEffect(() => {
    if (!keyboardNavigation) return;
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        move("home");
      } else if (e.key === "End") {
        e.preventDefault();
        move("end");
      } else if (e.key === "Enter" || e.key === " ") {
        // Only if a row is focused
        const active = document.activeElement as HTMLElement | null;
        if (active && active.dataset && active.dataset.rowIndex) {
          const idx = Number(active.dataset.rowIndex);
          if (!Number.isNaN(idx)) {
            e.preventDefault();
            activate(idx);
          }
        }
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [activate, move, keyboardNavigation]);

  // Instrument (decorate) rows after each render when records change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLTableRowElement>("tbody tr"));
    rows.forEach((tr, i) => {
      tr.setAttribute("tabindex", "0");
      tr.dataset.rowIndex = String(i);
      tr.setAttribute("data-focusable-row", "true");
      // Per-row keydown handler (only handles activation; movement handled globally)
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate(i);
        }
      };
      const focusHandler = () => setFocusedIndex(i);
      tr.addEventListener("keydown", keyHandler);
      tr.addEventListener("focus", focusHandler);
      tr.addEventListener("dblclick", () => activate(i));
      // Store cleanup markers
      (tr as any).__navHandlers = { keyHandler, focusHandler };
    });
    return () => {
      rows.forEach((tr) => {
        const h = (tr as any).__navHandlers;
        if (h) {
          tr.removeEventListener("keydown", h.keyHandler);
          tr.removeEventListener("focus", h.focusHandler);
        }
      });
    };
  }, [records, activate]);

  // Auto focus first row
  useEffect(() => {
    if (!keyboardNavigation || !autoFocusFirstRow) return;
    if (!records.length) return;
    const id = requestAnimationFrame(() => {
      const first = containerRef.current?.querySelector<HTMLTableRowElement>('tbody tr[data-row-index="0"]');
      if (first) {
        first.focus();
        setFocusedIndex(0);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [records, keyboardNavigation, autoFocusFirstRow]);

  // Apply visual focus class
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rows = el.querySelectorAll<HTMLTableRowElement>("tbody tr");
    rows.forEach((tr) => {
      const idx = Number(tr.dataset.rowIndex);
      if (!Number.isNaN(idx) && idx === focusedIndex) {
        tr.classList.add(focusClassName);
        tr.setAttribute("aria-selected", "true");
      } else {
        tr.classList.remove(focusClassName);
        tr.removeAttribute("aria-selected");
      }
    });
  }, [focusedIndex, focusClassName]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <MantineDataTable records={records} columns={columns as any} onRowClick={onRowClick} {...rest} />
      <style>
        {`
        .${focusClassName} {
          background-color: var(--mantine-color-blue-light, #e7f5ff) !important;
          box-shadow: 0 0 0 2px var(--mantine-color-blue-filled, #228be6) inset;
        }
        `}
      </style>
    </div>
  );
}

export default NavDataTable;
