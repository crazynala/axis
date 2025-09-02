import { Group, Table, TextInput, ActionIcon, Select, Pagination } from "@mantine/core";
import { IconSearch, IconChevronUp, IconChevronDown } from "@tabler/icons-react";
import { useMemo } from "react";
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
};

export function DataTable<T extends Record<string, any>>({ columns, rows, total, page, perPage, q }: DataTableProps<T>) {
  const submit = useSubmit();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [sp, setSp] = useSearchParams();

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
    next.set("page", "1");
    setSp(next);
  };

  const onPage = (p: number) => {
    const next = new URLSearchParams(sp);
    next.set("page", String(p));
    setSp(next);
  };

  const pages = useMemo(() => Math.max(1, Math.ceil(total / perPage)), [total, perPage]);

  return (
    <div>
      <Group justify="space-between" mb="sm">
        <TextInput placeholder="Search..." leftSection={<IconSearch size={16} />} defaultValue={q ?? undefined} onChange={(e) => onSearch(e.currentTarget.value)} />
        {/* perPage selector placeholder for future */}
      </Group>
      <Table striped withTableBorder withColumnBorders highlightOnHover>
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
        <Table.Tbody>
          {rows.map((r, i) => (
            <Table.Tr key={(r as any).id ?? i}>
              {columns.map((c) => (
                <Table.Td key={String(c.key)}>{c.render ? c.render(r) : String(r[c.key as keyof T] ?? "")}</Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group justify="flex-end" mt="sm">
        <Pagination total={pages} value={page} onChange={onPage} disabled={busy} size="sm" radius="md" />
      </Group>
    </div>
  );
}

export default DataTable;
