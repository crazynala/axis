import {
  useLocation,
  useNavigate,
  useMatches,
} from "@remix-run/react";
import { Button, Group, Stack, Text, Card } from "@mantine/core";
import SplitButton from "~/components/SplitButton";
import { ProductFindManager } from "../components/ProductFindManager";
import { FindRibbonAuto } from "~/components/find/FindRibbonAuto";
import {
  defaultSummarizeFilters,
  type FilterChip,
} from "~/base/find/FindRibbon";
import { BreadcrumbSet } from "packages/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { VirtualizedNavDataTable } from "~/components/VirtualizedNavDataTable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecords } from "~/base/record/RecordContext";
import { useHybridIndexTable } from "~/base/index/useHybridIndexTable";
import { SheetModal } from "~/components/sheets/SheetModal";
import {
  DataEditor,
  GridCellKind,
  type GridCell,
  type GridColumn,
} from "@glideapps/glide-data-grid";
import {
  PricingPreviewWidget,
  usePricingPrefsFromWidget,
} from "../components/PricingPreviewWidget";
import {
  getSavedNavLocation,
  usePersistIndexSearch,
  useRegisterNavLocation,
} from "~/hooks/useNavLocation";
import { buildProductMetadataFields } from "~/modules/productMetadata/utils/productMetadataFields";
import { getGlobalOptions } from "~/base/options/OptionsClient";
import { productSpec } from "../spec";
import { useElementSize } from "@mantine/hooks";
import { useMantineColorScheme, useMantineTheme } from "@mantine/core";

export default function ProductsIndexRoute() {
  // Register product index navigation (persist search/filter state via existing logic + path)
  useRegisterNavLocation({ includeSearch: true, moduleKey: "products" });
  // Persist/restore index search so filters survive leaving and returning
  usePersistIndexSearch("/products");
  const matches = useMatches();
  const parentData = useMemo(
    () =>
      matches.find((m) =>
        String(m.id).endsWith("modules/product/routes/products")
      )?.data as any,
    [matches]
  );
  const metadataDefinitions = useMemo(() => {
    const defs = parentData?.metadataDefinitions;
    return Array.isArray(defs) ? defs : [];
  }, [parentData]);
  const globalOptions = getGlobalOptions();
  const views = parentData?.views || [];
  const activeView = parentData?.activeView || null;
  const activeViewParams = parentData?.activeViewParams || null;
  const metadataFields = useMemo(
    () =>
      buildProductMetadataFields(metadataDefinitions, {
        onlyFilterable: true,
        enumOptionsByDefinitionId:
          globalOptions?.productAttributeOptionsByDefinitionId || {},
      }),
    [metadataDefinitions, globalOptions?.productAttributeOptionsByDefinitionId]
  );
  const findConfig = useMemo(
    () => productSpec.find.buildConfig(metadataFields),
    [metadataFields]
  );
  // If user lands on /products directly and we have a saved subpath, redirect to it for testing
  const location = useLocation();
  useEffect(() => {
    if (location.pathname === "/products") {
      const saved = getSavedNavLocation("/products");
      if (saved && saved !== "/products") {
        // defer until next tick to ensure navigate variable is defined
        setTimeout(() => navigate(saved, { replace: true }), 0);
      }
    }
    // run on first mount for this route
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const appendHref = useFindHrefAppender();
  // Batch create modal state
  type NewProd = {
    sku: string;
    name: string;
    type: string;
    supplierId?: number | "";
    categoryId?: number | "";
    purchaseTaxId?: number | "";
    costPrice?: number | "";
    manualSalePrice?: number | "";
    stockTrackingEnabled?: boolean | "";
    batchTrackingEnabled?: boolean | "";
  };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rows, setRows] = useState<NewProd[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSummary, setSaveSummary] = useState<{
    created: number;
    errors: Array<{ index: number; message: string }>;
  } | null>(null);
  const historyRef = useRef<{
    past: Array<{ before: NewProd[]; after: NewProd[] }>;
    future: Array<{ before: NewProd[]; after: NewProd[] }>;
  }>({ past: [], future: [] });
  const historyLimit = 50;
  const widthStorageKey = "axis:glide:productsIndexBatchModal:colWidths:v1";
  const [widthsByKey, setWidthsByKey] = useState<Record<string, number>>({});
  const persistWidthsTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!sheetOpen) return;
    const portal =
      typeof document !== "undefined" ? document.getElementById("portal") : null;
    if (portal) {
      portal.dataset.axisGlidePortal = "true";
    }
    return () => {
      if (portal?.dataset.axisGlidePortal) {
        delete portal.dataset.axisGlidePortal;
      }
    };
  }, [sheetOpen]);
  const { ref: batchGridRef, width: batchGridWidth } = useElementSize();
  const { colorScheme } = useMantineColorScheme();
  const mantineTheme = useMantineTheme();
  const MODAL_TOP_RESERVE = 60;
  const MODAL_BOTTOM_RESERVE = 120;
  const MODAL_GRID_HEIGHT = 420;
  const MODAL_HEIGHT =
    MODAL_GRID_HEIGHT + MODAL_TOP_RESERVE + MODAL_BOTTOM_RESERVE;
  const gridColumns = useMemo<GridColumn[]>(() => {
    return [
      { id: "sku", title: "SKU", width: widthsByKey.sku ?? 180 },
      { id: "name", title: "Name", width: widthsByKey.name ?? 220 },
      { id: "type", title: "Type", width: widthsByKey.type ?? 140 },
      { id: "supplierId", title: "SupplierId", width: widthsByKey.supplierId ?? 140 },
      { id: "categoryId", title: "CategoryId", width: widthsByKey.categoryId ?? 140 },
      { id: "purchaseTaxId", title: "PurchaseTaxId", width: widthsByKey.purchaseTaxId ?? 140 },
      { id: "costPrice", title: "CostPrice", width: widthsByKey.costPrice ?? 140 },
      { id: "manualSalePrice", title: "ManualSalePrice", width: widthsByKey.manualSalePrice ?? 160 },
      { id: "stockTrackingEnabled", title: "Stock?", width: widthsByKey.stockTrackingEnabled ?? 120 },
      { id: "batchTrackingEnabled", title: "Batch?", width: widthsByKey.batchTrackingEnabled ?? 120 },
    ];
  }, [widthsByKey]);
  const createRow = useCallback((): NewProd => ({
    sku: "",
    name: "",
    type: "",
    supplierId: "",
    categoryId: "",
    purchaseTaxId: "",
    costPrice: "",
    manualSalePrice: "",
    stockTrackingEnabled: "",
    batchTrackingEnabled: "",
  }), []);
  const isBlankRow = useCallback((row: NewProd) => {
    return Object.values(row).every((value) => {
      if (value === null || value === undefined) return true;
      if (typeof value === "string") return value.trim() === "";
      return false;
    });
  }, []);
  const normalizeRows = useCallback(
    (next: NewProd[]) => {
      const normalized = next.slice();
      while (normalized.length > 1 && isBlankRow(normalized[normalized.length - 1]) && isBlankRow(normalized[normalized.length - 2])) {
        normalized.pop();
      }
      if (!normalized.length || !isBlankRow(normalized[normalized.length - 1])) {
        normalized.push(createRow());
      }
      return normalized;
    },
    [createRow, isBlankRow]
  );
  useEffect(() => {
    setRows((prev) => normalizeRows(prev));
  }, [normalizeRows, sheetOpen]);
  const snapshotRows = useCallback(
    (rowsToCopy: NewProd[]) => rowsToCopy.map((row) => ({ ...row })),
    []
  );
  const pushHistory = useCallback(
    (beforeRows: NewProd[], afterRows: NewProd[]) => {
      historyRef.current.past.push({
        before: snapshotRows(beforeRows),
        after: snapshotRows(afterRows),
      });
      if (historyRef.current.past.length > historyLimit) {
        historyRef.current.past.shift();
      }
      historyRef.current.future = [];
    },
    [snapshotRows]
  );
  const applyRowUpdates = useCallback(
    (updater: (prev: NewProd[]) => NewProd[]) => {
      setRows((prev) => {
        const next = normalizeRows(updater(prev));
        pushHistory(prev, next);
        return next;
      });
      setDirty(true);
    },
    [normalizeRows, pushHistory]
  );
  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    const batch = history.past.pop();
    if (!batch) return;
    history.future.push(batch);
    setRows(normalizeRows(batch.before));
    setDirty(true);
  }, [normalizeRows]);
  const handleRedo = useCallback(() => {
    const history = historyRef.current;
    const batch = history.future.pop();
    if (!batch) return;
    history.past.push(batch);
    setRows(normalizeRows(batch.after));
    setDirty(true);
  }, [normalizeRows]);
  const parseCellValue = useCallback((key: string, rawValue: string) => {
    const raw = String(rawValue ?? "").trim();
    if (!raw) return "";
    if (key === "stockTrackingEnabled" || key === "batchTrackingEnabled") {
      const lowered = raw.toLowerCase();
      if (["true", "yes", "1", "y"].includes(lowered)) return true;
      if (["false", "no", "0", "n"].includes(lowered)) return false;
      return raw;
    }
    if (
      key === "supplierId" ||
      key === "categoryId" ||
      key === "purchaseTaxId" ||
      key === "costPrice" ||
      key === "manualSalePrice"
    ) {
      const num = Number(raw);
      return Number.isFinite(num) ? num : raw;
    }
    return raw;
  }, []);
  const getBatchCellContent = useCallback(
    ([col, row]: readonly [number, number]): GridCell => {
      const column = gridColumns[col];
      const rowData = rows[row];
      if (!column || !rowData) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
        };
      }
      const key = String(column.id);
      const value = rowData[key as keyof NewProd];
      const display = value == null ? "" : String(value);
      return {
        kind: GridCellKind.Text,
        data: display,
        displayData: display,
        allowOverlay: true,
        readonly: false,
      };
    },
    [gridColumns, rows]
  );
  const onBatchCellEdited = useCallback(
    ([col, row]: readonly [number, number], newValue: any) => {
      const column = gridColumns[col];
      if (!column) return;
      const key = String(column.id);
      const raw = String(newValue?.data ?? newValue?.value ?? "");
      const value = parseCellValue(key, raw);
      applyRowUpdates((prev) => {
        const next = prev.slice();
        while (next.length <= row) {
          next.push(createRow());
        }
        const prevRow = next[row] ?? createRow();
        next[row] = { ...prevRow, [key]: value } as NewProd;
        return next;
      });
    },
    [applyRowUpdates, createRow, gridColumns, parseCellValue]
  );
  const getBatchCellsForSelection = useCallback(
    (selection: any) => {
      if (!selection || selection === true) return [];
      const { x, y, width, height } = selection;
      const cells: GridCell[][] = [];
      for (let rowIdx = y; rowIdx < y + height; rowIdx += 1) {
        const rowCells: GridCell[] = [];
        for (let colIdx = x; colIdx < x + width; colIdx += 1) {
          rowCells.push(getBatchCellContent([colIdx, rowIdx] as const));
        }
        cells.push(rowCells);
      }
      return cells;
    },
    [getBatchCellContent]
  );
  const onBatchPaste = useCallback(
    (target: any, values: readonly (readonly string[])[]) => {
      const cell = target?.cell ?? target;
      if (!cell || !Array.isArray(cell)) return false;
      const [startCol, startRow] = cell as [number, number];
      if (!values.length) return false;
      applyRowUpdates((prev) => {
        const next = prev.slice();
        for (let rowOffset = 0; rowOffset < values.length; rowOffset += 1) {
          const rowIdx = startRow + rowOffset;
          while (next.length <= rowIdx) next.push(createRow());
          const rowData = next[rowIdx] ?? createRow();
          const updated = { ...rowData } as NewProd;
          for (let colOffset = 0; colOffset < values[rowOffset].length; colOffset += 1) {
            const colIdx = startCol + colOffset;
            const column = gridColumns[colIdx];
            if (!column) continue;
            const key = String(column.id);
            const raw = String(values[rowOffset][colOffset] ?? "");
            (updated as any)[key] = parseCellValue(key, raw);
          }
          next[rowIdx] = updated;
        }
        return next;
      });
      return true;
    },
    [applyRowUpdates, createRow, gridColumns, parseCellValue]
  );
  useEffect(() => {
    if (!sheetOpen) return;
    try {
      const stored = window.localStorage.getItem(widthStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          setWidthsByKey(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [sheetOpen, widthStorageKey]);
  useEffect(() => {
    if (!sheetOpen) return;
    if (persistWidthsTimerRef.current) {
      window.clearTimeout(persistWidthsTimerRef.current);
    }
    persistWidthsTimerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          widthStorageKey,
          JSON.stringify(widthsByKey)
        );
      } catch {
        // ignore storage errors
      }
    }, 200);
    return () => {
      if (persistWidthsTimerRef.current) {
        window.clearTimeout(persistWidthsTimerRef.current);
      }
    };
  }, [sheetOpen, widthStorageKey, widthsByKey]);
  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isUndo =
        (event.metaKey && key === "z" && !event.shiftKey) ||
        (event.ctrlKey && key === "z" && !event.shiftKey);
      const isRedo =
        (event.metaKey && key === "z" && event.shiftKey) ||
        (event.ctrlKey && (key === "y" || (key === "z" && event.shiftKey)));
      if (!isUndo && !isRedo) return;
      const target = event.target;
      const targetEl = target instanceof HTMLElement ? target : null;
      const inside =
        targetEl?.closest?.('[data-axis-sheet="glide"]') ||
        document.activeElement?.closest?.('[data-axis-sheet="glide"]');
      if (!inside) return;
      event.preventDefault();
      event.stopPropagation();
      if (isRedo) handleRedo();
      else handleUndo();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [handleRedo, handleUndo, sheetOpen]);
  const batchTheme = useMemo(() => {
    const dark = colorScheme === "dark";
    const accent = mantineTheme.colors.blue?.[6] || "#4dabf7";
    return {
      bgCanvas: dark ? "#0b0d10" : "#f1f3f5",
      bgCell: dark ? "#14171a" : "#ffffff",
      bgCellMedium: dark ? "#1a1e22" : "#ffffff",
      bgHeader: dark ? "#0f1114" : "#f1f3f5",
      bgHeaderHasFocus: dark ? "#0f1114" : "#f1f3f5",
      textDark: dark ? "rgba(255,255,255,0.92)" : "#000000",
      textMedium: dark ? "rgba(255,255,255,0.7)" : "#495057",
      textLight: dark ? "rgba(255,255,255,0.55)" : "#868e96",
      accentColor: accent,
      accentLight: dark ? "rgba(70,140,255,0.22)" : "rgba(70,140,255,0.12)",
      borderColor: dark ? "rgba(255,255,255,0.06)" : "#dee2e6",
      headerFontStyle: "600 14px system-ui",
      baseFontStyle: "500 14px system-ui",
      markerFontStyle: "500 14px system-ui",
    };
  }, [colorScheme, mantineTheme.colors.blue]);
  const navigate = useNavigate();
  const { state, currentId, setCurrentId, addRows } = useRecords();
  // Removed per-route height calculation; table now auto-sizes within viewport
  // Row selection managed by table (multiselect)
  const [selectedIds, setSelectedIds] = useState<Array<number | string>>([]);
  const pricing = usePricingPrefsFromWidget();
  const summarizeFilters = useMemo(() => {
    const defByKey = new Map(
      metadataDefinitions.map((def: any) => [def.key, def])
    );
    return (params: Record<string, string>) => {
      const chips: FilterChip[] = [];
      const nonMeta: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        if (!k.startsWith("meta__")) {
          nonMeta[k] = v;
          continue;
        }
        const raw = k.slice("meta__".length);
        const isMin = raw.endsWith("Min");
        const isMax = raw.endsWith("Max");
        const defKey = isMin || isMax ? raw.slice(0, -3) : raw;
        const def = defByKey.get(defKey);
        if (!def) continue;
        if (isMin || isMax) continue;
        const label = def.label || def.key;
        if (def.dataType === "BOOLEAN") {
          const pretty = v === "true" ? "Yes" : v === "false" ? "No" : v;
          chips.push({ key: k, label: `${label}: ${pretty}` });
        } else {
          chips.push({ key: k, label: `${label}: ${v}` });
        }
      }
      for (const def of metadataDefinitions) {
        if (def.dataType !== "NUMBER") continue;
        const minKey = `meta__${def.key}Min`;
        const maxKey = `meta__${def.key}Max`;
        const minVal = params[minKey];
        const maxVal = params[maxKey];
        if (!minVal && !maxVal) continue;
        const label = def.label || def.key;
        const range =
          minVal && maxVal
            ? `${minVal}–${maxVal}`
            : minVal
            ? `>= ${minVal}`
            : `<= ${maxVal}`;
        chips.push({ key: minKey, label: `${label}: ${range}` });
      }
      return [...defaultSummarizeFilters(nonMeta), ...chips];
    };
  }, [metadataDefinitions]);
  const columnDefs = useMemo(
    () => productSpec.index.buildColumns(pricing),
    [pricing]
  );
  const viewMode = !!activeView;
  const {
    records,
    columns,
    sortStatus,
    onSortStatusChange,
    onReachEnd,
    requestMore,
    atEnd,
    loading,
    total,
  } = useHybridIndexTable({
    module: "products",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
    columns: columnDefs,
    viewColumns: activeViewParams?.columns,
    viewMode,
  });

  // Ensure currentId row included when returning from detail
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (!currentId) return;
    if (ensuredRef.current) return;
    const idList = state?.idList || [];
    const idx = idList.indexOf(currentId as any);
    if (idx === -1) return;
    if (idx >= records.length) {
      let safety = 0;
      while (records.length <= idx && safety < 20) {
        requestMore();
        safety++;
      }
    }
    ensuredRef.current = true;
  }, [currentId, state?.idList, records.length, requestMore]);

  // Auto-select single result when exactly one record after filtering
  useEffect(() => {
    if (records.length === 1 && records[0] && records[0].id != null) {
      if (currentId !== records[0].id)
        setCurrentId(records[0].id, "programmatic");
    }
  }, [records, currentId, setCurrentId]);

  // Revalidate / refresh current product row on window focus to avoid stale manual price after edits
  useEffect(() => {
    const handleFocus = async () => {
      if (!currentId) return;
      try {
        const resp = await fetch(`/products/rows?ids=${currentId}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json, */*" },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const rows = Array.isArray(data?.rows) ? data.rows : data;
        if (rows && rows.length) addRows("products", rows);
      } catch (e) {
        // swallow
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [currentId, addRows]);

  const currentRow = useMemo(
    () => (currentId ? records.find((r: any) => r?.id === currentId) : null),
    [currentId, records]
  );

  async function saveSheet() {
    setSaving(true);
    try {
      setSaveSummary({
        created: 0,
        errors: [{ index: -1, message: "Not implemented" }],
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="lg">
      <ProductFindManager
        metadataDefinitions={metadataDefinitions}
        activeViewParams={activeViewParams}
      />
      <Group
        justify="space-between"
        mb="xs"
        align="center"
        data-products-header
      >
        <BreadcrumbSet
          breadcrumbs={[{ label: "Products", href: appendHref("/products") }]}
        />
        <Group justify="flex-end" mb="xs" gap="xs">
          <SplitButton
            size="xs"
            onPrimaryClick={() => navigate("/products/new")}
            items={[
              {
                label: "Batch Create",
                onClick: () => navigate("/products/batch/sheet"),
              },
            ]}
            variant="filled"
            color="blue"
          >
            New Product
          </SplitButton>
        </Group>
      </Group>
      <Group justify="space-between" align="center">
        <FindRibbonAuto
          views={views}
          activeView={activeView}
          activeViewId={activeView}
          activeViewParams={activeViewParams}
          findConfig={findConfig}
          enableLastView
          summarizeFilters={summarizeFilters}
          columnsConfig={columnDefs}
        />
        <Card withBorder padding={5}>
          <PricingPreviewWidget
            productId={Number(currentId) || undefined}
            vendorId={currentRow?.supplierId ?? null}
          />
        </Card>
      </Group>
      <section>
        <VirtualizedNavDataTable
          records={records}
          currentId={currentId}
          multiselect
          onSelectionChange={(ids) => setSelectedIds(ids)}
          bulkActions={[
            {
              label: "Batch Edit",
              onClick: (ids) =>
                navigate(`/products/batch/sheet?ids=${ids.join(",")}`),
            },
            {
              label: "Batch Edit BOMs",
              onClick: (ids) => {
                const returnTo = encodeURIComponent(
                  `${location.pathname}${location.search}`
                );
                navigate(
                  `/products/boms/sheet?ids=${ids.join(",")}&returnTo=${returnTo}`
                );
              },
            },
          ]}
          columns={columns as any}
          sortStatus={sortStatus as any}
          onSortStatusChange={onSortStatusChange as any}
          onRowDoubleClick={(rec: any) => {
            if (rec?.id != null) navigate(`/products/${rec.id}`);
          }}
          onRowClick={(rec: any) => {
            setCurrentId(rec?.id, "mouseRow");
          }}
          onReachEnd={onReachEnd}
          footer={
            atEnd ? (
              <span style={{ fontSize: 12 }}>End of results ({total})</span>
            ) : loading ? (
              <span>Loading rows…</span>
            ) : (
              <span style={{ fontSize: 11 }}>Scroll to load more…</span>
            )
          }
        />
      </section>

      <SheetModal
        opened={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Batch Create Products"
        size="90vw"
        centered
        height={MODAL_HEIGHT}
        topReserve={MODAL_TOP_RESERVE}
        bottomReserve={MODAL_BOTTOM_RESERVE}
      >
        {(bodyHeight) => (
          <Stack style={{ height: "100%", minHeight: 0 }}>
          <Text c="dimmed">
            Paste rows from Excel or type directly. Leave a row entirely blank
            to ignore it.
          </Text>
          <div
            style={{
              border: "1px solid var(--mantine-color-gray-4)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              ref={batchGridRef}
              data-axis-sheet="glide"
              style={{ height: bodyHeight, width: "100%" }}
            >
              {batchGridWidth > 0 ? (
                <DataEditor
                  columns={gridColumns}
                  rows={rows.length}
                  getCellContent={getBatchCellContent}
                  onCellEdited={onBatchCellEdited}
                  getCellsForSelection={getBatchCellsForSelection}
                  onPaste={onBatchPaste as any}
                  onColumnResize={(col, width) => {
                    setWidthsByKey((prev) => ({
                      ...prev,
                      [String(col.id)]: Math.max(60, Math.floor(width)),
                    }));
                  }}
                  width={batchGridWidth}
                  height={bodyHeight}
                  theme={batchTheme}
                />
              ) : null}
            </div>
          </div>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setSheetOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              color="green"
              onClick={saveSheet}
              loading={saving}
              disabled={!dirty}
            >
              Save
            </Button>
          </Group>
          {saveSummary && (
            <Card withBorder>
              <Text size="sm">Created: {saveSummary.created}</Text>
              {saveSummary.errors?.length ? (
                <Stack gap={4} mt="xs">
                  <Text size="sm" c="red">
                    Errors
                  </Text>
                  {saveSummary.errors.map((e, i) => (
                    <Text key={i} size="sm" c="red">
                      {e.index >= 0 ? `Row ${e.index + 1}: ` : ""}
                      {e.message}
                    </Text>
                  ))}
                </Stack>
              ) : null}
            </Card>
          )}
        </Stack>
        )}
      </SheetModal>
    </Stack>
  );
}
