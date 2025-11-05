// import { useNavigate } from "@remix-run/react";
import {
  DataSheetGrid,
  keyColumn,
  textColumn,
  type Column,
} from "react-datasheet-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Group, Stack, Text, TextInput } from "@mantine/core";
import { HotkeyAwareModal } from "~/base/hotkeys/HotkeyAwareModal";
import { padToMinRows, DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";

export type BOMRow = {
  id: number | null;
  childSku: string;
  childName: string;
  activityUsed: string;
  type: string;
  supplier: string;
  quantity: number | string;
};

export default function ProductBomSpreadsheet({
  rows,
  onSave,
  loading,
  dirty,
  onRowsChange,
  height,
  minRows = DEFAULT_MIN_ROWS,
}: {
  rows: BOMRow[];
  onSave: () => void;
  loading: boolean;
  dirty: boolean;
  onRowsChange?: (rows: BOMRow[]) => void;
  height?: number;
  minRows?: number;
}) {
  // const navigate = useNavigate();
  const [localRows, setLocalRows] = useState<BOMRow[]>(rows);
  // Helpers for auto-add trailing blank row
  const blankRow = useMemo<BOMRow>(
    () => ({
      id: null,
      childSku: "",
      childName: "",
      activityUsed: "",
      type: "",
      supplier: "",
      quantity: "",
    }),
    []
  );
  const isBlank = (r: BOMRow) =>
    !r.childSku &&
    !r.childName &&
    !r.activityUsed &&
    (r.quantity === "" || r.quantity == null);
  const ensureTrailingBlank = (list: BOMRow[]) => {
    const withoutExtras = list.filter(
      (r, idx) => !(isBlank(r) && idx !== list.length - 1)
    );
    if (
      !withoutExtras.length ||
      !isBlank(withoutExtras[withoutExtras.length - 1])
    ) {
      return [...withoutExtras, { ...blankRow }];
    }
    return withoutExtras;
  };
  useEffect(() => {
    setLocalRows((prev) => ensureTrailingBlank(rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  // Debounced batch lookup for SKUs
  const pendingSkusRef = useRef<Set<string>>(new Set());
  const lookupTimerRef = useRef<any>(null);
  const enqueueLookup = useCallback(
    (skus: string[]) => {
      skus.filter(Boolean).forEach((s) => pendingSkusRef.current.add(s));
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
      lookupTimerRef.current = setTimeout(async () => {
        const toFetch = Array.from(pendingSkusRef.current);
        pendingSkusRef.current.clear();
        if (!toFetch.length) return;
        try {
          const url = new URL(`/api/products/lookup`, window.location.origin);
          url.searchParams.set("skus", toFetch.join(","));
          const resp = await fetch(url.toString());
          const data = await resp.json();
          const map = new Map<string, any>();
          if (data?.products) {
            for (const p of data.products) map.set(p.sku || "", p);
          }
          setLocalRows((curr) => {
            const next = curr.map((r) => {
              const info = r.childSku ? map.get(r.childSku) : null;
              if (!info) return r;
              return {
                ...r,
                childName: info?.name || "",
                type: (info?.type as string) || "",
                supplier: (info?.supplier?.name as string) || "",
              };
            });
            onRowsChange?.(next.filter((r) => !isBlank(r)));
            return next;
          });
        } catch {}
      }, 120);
    },
    [onRowsChange]
  );

  const sheetColumns = useMemo<Column<BOMRow>[]>(() => {
    const idCol = {
      ...keyColumn<BOMRow, any>("id", textColumn),
      id: "id",
      title: "ID",
      disabled: true,
      grow: 0.5,
    } as Column<BOMRow>;
    const skuCol: Column<BOMRow> = {
      ...keyColumn<BOMRow, any>("childSku", textColumn),
      id: "childSku",
      title: "SKU",
      grow: 1.2,
      component: ({ rowData, setRowData, focus }) => (
        <input
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
          }}
          value={rowData.childSku || ""}
          onChange={(e) => {
            const sku = e.target.value;
            setRowData({ ...rowData, childSku: sku });
            enqueueLookup([sku]);
          }}
          onPaste={(e) => {
            // Allow paste but trigger lookup after default paste logic runs
            // (grid will call onChange with updated rows; we also enqueue here for responsiveness)
            const text = e.clipboardData.getData("text");
            if (text) enqueueLookup([text.split("\t")[0].split("\n")[0]]);
          }}
          autoFocus={focus}
        />
      ),
    };
    const nameCol = {
      ...keyColumn<BOMRow, any>("childName", textColumn),
      id: "childName",
      title: "Name",
      disabled: true,
      grow: 2,
    } as Column<BOMRow>;
    const usageCol = {
      ...keyColumn<BOMRow, any>("activityUsed", textColumn),
      id: "activityUsed",
      title: "Usage",
      grow: 1,
    } as Column<BOMRow>;
    const typeCol = {
      ...keyColumn<BOMRow, any>("type", textColumn),
      id: "type",
      title: "Type",
      disabled: true,
      grow: 1,
    } as Column<BOMRow>;
    const supplierCol = {
      ...keyColumn<BOMRow, any>("supplier", textColumn),
      id: "supplier",
      title: "Supplier",
      disabled: true,
      grow: 1.2,
    } as Column<BOMRow>;
    const qtyCol = {
      ...keyColumn<BOMRow, any>("quantity", textColumn),
      id: "quantity",
      title: "Qty",
      grow: 0.8,
    } as Column<BOMRow>;
    return [idCol, skuCol, nameCol, usageCol, typeCol, supplierCol, qtyCol];
  }, []);

  // Picker modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [assemblyItemOnly, setAssemblyItemOnly] = useState(false);
  const [pickerResults, setPickerResults] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    const q = pickerSearch.trim();
    if (!pickerOpen) return;
    if (!q) {
      setPickerResults([]);
      return;
    }
    const h = setTimeout(async () => {
      try {
        const url = new URL(`/api/products/lookup`, window.location.origin);
        url.searchParams.set("q", q);
        const resp = await fetch(url.toString());
        const data = await resp.json();
        if (!active) return;
        let arr: any[] = data?.products || [];
        if (assemblyItemOnly) {
          arr = arr.filter((p) => (p?._count?.productLines ?? 0) === 0);
        }
        setPickerResults(arr);
      } catch {
        if (active) setPickerResults([]);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(h);
    };
  }, [pickerSearch, pickerOpen, assemblyItemOnly]);

  return (
    <>
      <Group justify="space-between" align="center" mb={8}>
        <Text fw={600}>Bill of Materials</Text>
        <Button size="xs" variant="light" onClick={() => setPickerOpen(true)}>
          Add Component
        </Button>
      </Group>
      <DataSheetGrid
        value={padToMinRows(localRows, minRows, () => ({ ...blankRow }))}
        onChange={(next) => {
          const typed = (next as BOMRow[]) || [];
          const normalized = ensureTrailingBlank(typed);
          // detect changed SKUs to lookup (handles paste of rows too)
          try {
            const changed: string[] = [];
            const minLen = Math.min(localRows.length, normalized.length);
            for (let i = 0; i < minLen; i++) {
              if (
                (localRows[i]?.childSku || "") !==
                (normalized[i]?.childSku || "")
              ) {
                const s = normalized[i]?.childSku || "";
                if (s) changed.push(s);
              }
            }
            for (let i = minLen; i < normalized.length; i++) {
              const s = normalized[i]?.childSku || "";
              if (s) changed.push(s);
            }
            if (changed.length) enqueueLookup(changed);
          } catch {}
          setLocalRows(normalized);
          onRowsChange?.(normalized.filter((r) => !isBlank(r)));
        }}
        columns={sheetColumns}
        height={height}
        createRow={() => ({ ...blankRow })}
      />
      {/* SKU picker modal */}
      <HotkeyAwareModal
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add Component"
        size="xl"
        centered
      >
        <Stack>
          <Group justify="space-between" align="flex-end">
            <TextInput
              placeholder="Search products..."
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.currentTarget.value)}
              w={320}
            />
            <Checkbox
              label="Assembly Item"
              checked={assemblyItemOnly}
              onChange={(e) => setAssemblyItemOnly(e.currentTarget.checked)}
            />
          </Group>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {pickerResults.map((p: any) => (
              <Group
                key={p.id}
                py={6}
                onClick={() => {
                  // insert new row with selected product
                  setLocalRows((curr) => {
                    const rows = ensureTrailingBlank(curr);
                    // find first blank row or append
                    const idx = rows.findIndex((r) => isBlank(r));
                    const i = idx >= 0 ? idx : rows.length;
                    const next = rows.slice();
                    next[i] = {
                      id: null,
                      childSku: p.sku || "",
                      childName: p.name || "",
                      activityUsed: "",
                      type: (p.type as string) || "",
                      supplier: (p?.supplier?.name as string) || "",
                      quantity: "",
                    };
                    onRowsChange?.(next.filter((r) => !isBlank(r)));
                    return ensureTrailingBlank(next);
                  });
                  setPickerOpen(false);
                }}
                style={{ cursor: "pointer" }}
              >
                <Text w={60}>{p.id}</Text>
                <Text w={160}>{p.sku}</Text>
                <Text style={{ flex: 1 }}>{p.name}</Text>
              </Group>
            ))}
          </div>
        </Stack>
      </HotkeyAwareModal>
    </>
  );
}
