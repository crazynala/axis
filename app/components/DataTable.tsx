import { Group, Table, TextInput, ActionIcon, Select, Pagination } from "@mantine/core";
import { IconSearch, IconChevronUp, IconChevronDown } from "@tabler/icons-react";
import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import { useSubmit, useNavigation, useSearchParams } from "@remix-run/react";

export type Column<T> = {
  key: keyof T | string;
  title: string;
  width?: number | string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  total: number;
  page: number;
  perPage: number;
  q?: string | null;
  /** Make entire row focusable via keyboard (adds tabIndex=0). Default: false */
  rowFocusable?: boolean;
  /** Called when user activates a focused row via Enter/Space or double click */
  onRowActivate?: (row: T) => void;
  /** Enable arrow key navigation between rows (implies focusable). */
  keyboardNavigation?: boolean;
  /** Automatically focus first row when keyboard nav enabled. Default true */
  autoFocusFirstRow?: boolean;
};

export function DataTable<T extends Record<string, any>>({
  columns,
  rows,
  total,
  page,
  perPage,
  q,
  rowFocusable = false,
  onRowActivate,
  keyboardNavigation = false,
  autoFocusFirstRow = true,
}: DataTableProps<T>) {
  const submit = useSubmit();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [sp, setSp] = useSearchParams();
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);
  const effectiveFocusable = rowFocusable || keyboardNavigation;
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const sort = sp.get("sort");
  const dir = sp.get("dir") as "asc" | "desc" | null;

  const iconFor = (c: Column<T>) => {
    if (!c.sortable) return null;
    const isActive = sort === String(c.key);
    const up = <IconChevronUp size={14} />;
    const down = <IconChevronDown size={14} />;
    return isActive ? (dir === "desc" ? down : up) : null;
  };

  const onSort = (c: Column<T>) => {
    if (!c.sortable) return;
    const k = String(c.key);
    const nextDir = sort === k ? (dir === "asc" ? "desc" : "asc") : "asc";
    const next = new URLSearchParams(sp);
    next.set("sort", k);
    next.set("dir", nextDir);
    setSp(next);
  };

  const onSearch = (value: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set("q", value);
    else next.delete("q");
    next.delete("view");
    next.set("page", "1");
    setSp(next);
  };

  const onPage = (p: number) => {
    const next = new URLSearchParams(sp);
    next.set("page", String(p));
    setSp(next);
  };

  const pages = useMemo(() => Math.max(1, Math.ceil(total / perPage)), [total, perPage]);

  // Auto focus first row
  useEffect(() => {
    if (!keyboardNavigation || !autoFocusFirstRow) return;
    if (!rows.length) return;
    const id = requestAnimationFrame(() => {
      const first = bodyRef.current?.querySelector('tr[data-row-index="0"]') as HTMLTableRowElement | null;
      first?.focus();
      setFocusedIndex(0);
    });
    return () => cancelAnimationFrame(id);
  }, [keyboardNavigation, autoFocusFirstRow, rows.length]);

  const moveFocus = useCallback(
    (delta: number) => {
      if (!bodyRef.current) return;
      const active = document.activeElement as HTMLElement | null;
      const currentIndex = active?.getAttribute?.("data-row-index");
      const idx = currentIndex ? parseInt(currentIndex, 10) : 0;
      let next = idx + delta;
      if (next < 0) next = 0;
      if (next >= rows.length) next = rows.length - 1;
      if (next === idx) return;
      const target = bodyRef.current.querySelector(`tr[data-row-index="${next}"]`) as HTMLTableRowElement | null;
      if (target) {
        target.focus();
        setFocusedIndex(next);
      }
    },
    [rows.length]
  );

  const handleGlobalKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (!keyboardNavigation) return;
      const tag = (e.target as HTMLElement).tagName;
      if (/(INPUT|SELECT|TEXTAREA)/.test(tag)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        moveFocus(-rows.length);
      } else if (e.key === "End") {
        e.preventDefault();
        moveFocus(rows.length);
      }
    },
    [keyboardNavigation, moveFocus, rows.length]
  );

  return (
    <div>
      <Group justify="space-between" mb="sm">
        <TextInput placeholder="Search..." leftSection={<IconSearch size={16} />} defaultValue={q ?? undefined} onChange={(e) => onSearch(e.currentTarget.value)} />
        {/* perPage selector placeholder for future */}
      </Group>
      <Table striped withTableBorder withColumnBorders highlightOnHover onKeyDown={handleGlobalKey}>
        <Table.Thead>
          <Table.Tr>
            {columns.map((c) => (
              <Table.Th key={String(c.key)} style={{ cursor: c.sortable ? "pointer" : undefined, width: c.width as any }} onClick={() => onSort(c)}>
                <Group gap={6} wrap="nowrap">
                  <span>{c.title}</span>
                  {iconFor(c)}
                </Group>
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody ref={bodyRef}>
          {rows.map((r, i) => {
            const key = (r as any).id ?? i;
            const handleKey = (e: React.KeyboardEvent) => {
              if (keyboardNavigation && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End")) return; // handled globally
              if (!onRowActivate) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowActivate(r);
              }
            };
            const handleDblClick = () => {
              if (onRowActivate) onRowActivate(r);
            };
            const focused = focusedIndex === i;
            return (
              <Table.Tr
                key={key}
                tabIndex={effectiveFocusable ? 0 : undefined}
                onKeyDown={effectiveFocusable ? handleKey : undefined}
                onDoubleClick={onRowActivate ? handleDblClick : undefined}
                onFocus={effectiveFocusable ? () => setFocusedIndex(i) : undefined}
                style={effectiveFocusable ? { outline: "none", cursor: onRowActivate ? "pointer" : undefined } : undefined}
                data-focusable-row={effectiveFocusable || undefined}
                data-row-index={i}
                data-focused={focused || undefined}
                aria-selected={focused || undefined}
                className={focused ? "data-table-row-focused" : undefined}
              >
                {columns.map((c) => (
                  <Table.Td key={String(c.key)}>{c.render ? c.render(r) : String(r[c.key as keyof T] ?? "")}</Table.Td>
                ))}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      {/* Inline style hook for focused row visual indication */}
      <style>
        {`
          .data-table-row-focused { 
            background-color: var(--mantine-color-blue-light, #e7f5ff) !important; 
            box-shadow: 0 0 0 2px var(--mantine-color-blue-filled, #228be6) inset; 
          }
          tr[data-focusable-row]:focus:not(.data-table-row-focused) { 
            box-shadow: 0 0 0 2px var(--mantine-color-blue-outline, #339af0) inset; 
          }
        `}
      </style>
      <Group justify="flex-end" mt="sm">
        <Pagination total={pages} value={page} onChange={onPage} disabled={busy} size="sm" radius="md" />
      </Group>
    </div>
  );
}

export default DataTable;
