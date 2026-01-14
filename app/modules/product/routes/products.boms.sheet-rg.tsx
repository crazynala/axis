import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import type {
  CellChange,
  CellLocation,
  Column,
  Id,
  MenuOption,
  ReactGridProps,
  Range,
  Row,
} from "@silevis/reactgrid";
import { Button, Checkbox, Group, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { useInitGlobalFormContext } from "@aa/timber";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { notifications } from "@mantine/notifications";
import { SheetShell } from "~/components/sheets/SheetShell";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { useDataGrid } from "~/components/sheets/useDataGrid";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { adaptDataGridController } from "~/components/sheets/SheetController";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { debugEnabled, listDebug } from "~/utils/debugFlags";
import { computeSheetColumnWidths } from "~/components/sheets/computeSheetColumnWidths";
import {
  axisHeaderCellTemplate,
  axisTextCellTemplate,
  type AxisTextCell,
} from "~/components/sheets/reactGridCells";
import { collectSelectedCellLocations } from "~/components/sheets/reactGridSelection";
import { useReactGridHover } from "~/components/sheets/useReactGridHover";
import { parseRowIndexFromId } from "~/modules/sheets/reactgrid/autoRows";
import { useReactGridUndoRedo } from "~/modules/sheets/reactgrid/useReactGridUndoRedo";
import { productSpec } from "~/modules/product/spec";
import type { ProductBomsSheetRow } from "~/modules/product/spec/sheets";
import { lookupProductsBySkus } from "~/modules/product/utils/productLookup.client";
import { normalizeUsageValue } from "~/components/sheets/UsageSelectCell";
import type { DebugExplainPayload } from "~/modules/debug/types";

export async function loader(args: LoaderFunctionArgs) {
  const { loader: baseLoader } = await import("./products.boms.sheet-dsg");
  return baseLoader(args as any);
}

export async function action(args: any) {
  const { action: baseAction } = await import("./products.boms.sheet-dsg");
  return baseAction(args);
}

const customCellTemplates = {
  axisHeader: axisHeaderCellTemplate,
  axisText: axisTextCellTemplate,
};

const resolveText = (value: unknown) =>
  value == null ? "" : String(value);

function deepFreeze<T>(obj: T, seen = new WeakSet<object>()): T {
  if (!obj || typeof obj !== "object") return obj;
  if (seen.has(obj as any)) return obj;
  seen.add(obj as any);
  Object.freeze(obj);
  for (const key of Object.keys(obj as any)) {
    const value = (obj as any)[key];
    if (value && typeof value === "object") {
      deepFreeze(value, seen);
    }
  }
  return obj;
}

type RgEvent =
  | { t: number; type: "focus"; rowId: string; columnId: string }
  | {
      t: number;
      type: "selection";
      rows: [number, number];
      cols: [number, number];
      count: number;
    }
  | {
      t: number;
      type: "cellsChanged.raw";
      count: number;
      sample: any;
      focus?: any;
      selection?: any;
    }
  | {
      t: number;
      type: "cellsChanged.filtered";
      stage: string;
      before: number;
      after: number;
      dropped?: any;
    }
  | {
      t: number;
      type: "apply.begin";
      changeCount: number;
      source: "edit" | "paste" | "undo" | "redo";
    }
  | {
      t: number;
      type: "apply.end";
      applied: number;
      rejected: number;
      reasons?: Record<string, number>;
    }
  | {
      t: number;
      type: "rows.append";
      productId: number;
      count: number;
      rowIds: string[];
    }
  | {
      t: number;
      type: "rows.trailingBlank.ensure";
      productId: number;
      before: number;
      after: number;
    }
  | { t: number; type: "undo.begin" }
  | {
      t: number;
      type: "undo.end";
      batch?: any;
      didShrink?: boolean;
      shrinkReason?: string;
    }
  | {
      t: number;
      type: "sku.change";
      requestId: number;
      rowIds: string[];
      skus: string[];
    }
  | {
      t: number;
      type: "sku.lookup";
      requestId: number;
      requested: number;
      resolved: number;
      unresolvedSkus?: string[];
    }
  | {
      t: number;
      type: "sku.derived.apply";
      requestId: number;
      count: number;
      sample: any;
    }
  | {
      t: number;
      type: "row.exists.check";
      label: string;
      rowId: string;
      exists: boolean;
    }
  | { t: number; type: "save.enqueue"; count: number; reason?: string }
  | { t: number; type: "writeTrap.skuCleared"; data: any }
  | { t: number; type: "writeBarrier.skuCleared"; data: any }
  | { t: number; type: "error"; message: string; stack?: string };

type RowSnapshot = {
  rowId: string;
  childSku: string;
  childName?: string;
  type?: string;
  supplier?: string;
  productId?: number | null;
  updatedAt: number;
};

type GroupSnapshot = {
  ts: number;
  productId: number;
  draftRowIds: string[];
  draftCount: number;
  tailRowIds: string[];
  hasTrailingBlank: boolean;
};

export default function ProductsBomsSheetReactGrid() {
  const [ReactGridComponent, setReactGridComponent] =
    useState<React.ComponentType<ReactGridProps> | null>(null);
  const [groupByProduct, setGroupByProduct] = useState(false);
  const [changeStats, setChangeStats] = useState({
    total: 0,
    applied: 0,
    ignored: 0,
  });
  const [columnWidthOverrides, setColumnWidthOverrides] = useState<
    Record<string, number>
  >({});
  const isDevEnv =
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.DEV === true) ||
    (typeof process !== "undefined" && process.env.NODE_ENV !== "production");
  const [searchParams] = useSearchParams();
  const { rows: initialRows } = useLoaderData<{
    rows: ProductBomsSheetRow[];
  }>();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { ref: gridContainerRef, width: gridContainerWidth } =
    useElementSize();
  const {
    gridRef: hoverGridRef,
    handlePointerMove,
    handlePointerLeave,
  } = useReactGridHover();
  const setGridRefs = useCallback(
    (node: HTMLDivElement | null) => {
      hoverGridRef.current = node;
    },
    [hoverGridRef]
  );
  useSheetDirtyPrompt();
  const exitUrl = "/products";

  const viewSpec = productSpec.sheet?.views["boms"];
  if (!viewSpec) {
    throw new Error("Missing product sheet spec: boms");
  }

  const columnSelection = useSheetColumnSelection({
    moduleKey: "products",
    viewId: viewSpec.id,
    scope: "index",
    viewSpec,
  });
  const widthByKey = useMemo(
    () =>
      computeSheetColumnWidths({
        columns: columnSelection.selectedColumns,
        widthPresetByKey: columnSelection.widthPresetByKey,
        containerWidthPx: gridContainerWidth || 0,
      }),
    [
      columnSelection.selectedColumns,
      columnSelection.widthPresetByKey,
      gridContainerWidth,
    ]
  );

  useEffect(() => {
    let active = true;
    import("@silevis/reactgrid").then((mod) => {
      if (!active) return;
      setReactGridComponent(() => mod.ReactGrid);
    });
    return () => {
      active = false;
    };
  }, []);

  const widthStorageKey = useMemo(
    () => `axis:sheet-columns-widths:v1:products:${viewSpec.id}:index`,
    [viewSpec.id]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(widthStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number> | null;
      if (parsed && typeof parsed === "object") {
        setColumnWidthOverrides(parsed);
      }
    } catch {
      // ignore
    }
  }, [widthStorageKey]);

  const columns = useMemo<Column[]>(() => {
    const rowHeader: Column = {
      columnId: "__rownum",
      width: 52,
      resizable: false,
    };
    return [
      rowHeader,
      ...columnSelection.selectedColumns.map((def) => ({
        columnId: def.key,
        width: columnWidthOverrides[def.key] ?? widthByKey[def.key],
        resizable:
          def.key === "product" ||
          def.key === "childSku" ||
          def.key === "quantity",
      })),
    ];
  }, [columnSelection.selectedColumns, columnWidthOverrides, widthByKey]);


  const columnDefsByKey = useMemo(() => {
    return new Map(viewSpec.columns.map((col) => [col.key, col] as const));
  }, [viewSpec.columns]);

  // Editability Matrix:
  // - User edits are allowed ONLY for EDITABLE_COLUMNS.
  // - Derived/autofill edits are allowed ONLY for DERIVED_READONLY_COLUMNS
  //   (plus any explicitly allowed derived fields).
  const EDITABLE_COLUMNS = useMemo(
    () => new Set(["childSku", "quantity", "activityUsed"]),
    []
  );
  const DERIVED_READONLY_COLUMNS = useMemo(
    () => new Set(["childName", "type", "supplier"]),
    []
  );
  const DERIVED_ALLOWED_COLUMNS = useMemo(
    () => new Set(["childName", "type", "supplier", "activityUsed"]),
    []
  );

  const getRowId = useCallback(
    (row: ProductBomsSheetRow, rowIndex: number) =>
      row?.id ? `line:${row.id}` : `row:${rowIndex}:${row.productId}`,
    []
  );

  const createRowForProduct = useCallback(
    (base: ProductBomsSheetRow): ProductBomsSheetRow => ({
      productId: base.productId,
      productSku: base.productSku,
      productName: base.productName,
      id: null,
      childSku: "",
      childName: "",
      activityUsed: "",
      type: "",
      supplier: "",
      quantity: "",
      groupStart: false,
      disableControls: false,
    }),
    []
  );

  const editableKeys = useMemo(() => Array.from(EDITABLE_COLUMNS), [
    EDITABLE_COLUMNS,
  ]);

  const isMeaningfulValue = useCallback((value: unknown) => {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "boolean") return value;
    return true;
  }, []);

  const isBlankRow = useCallback(
    (row: ProductBomsSheetRow | null | undefined) => {
      if (!row || row.id) return false;
      if (String(row.childSku || "").trim()) return false;
      for (const key of editableKeys) {
        if (isMeaningfulValue((row as any)[key])) return false;
      }
      return true;
    },
    [editableKeys, isMeaningfulValue]
  );

  const ensureTrailingBlankRows = useCallback(
    (rowsToCheck: ProductBomsSheetRow[]) => {
      const nextRows: ProductBomsSheetRow[] = [];
      const insertions: Array<{ from: number; to: number }> = [];
      let cursor = 0;
      while (cursor < rowsToCheck.length) {
        const groupStart = cursor;
        const groupProductId = rowsToCheck[cursor]?.productId;
        while (
          cursor < rowsToCheck.length &&
          rowsToCheck[cursor]?.productId === groupProductId
        ) {
          nextRows.push(rowsToCheck[cursor]);
          cursor += 1;
        }
        const groupRows = rowsToCheck.slice(groupStart, cursor);
        const lastRow = groupRows[groupRows.length - 1];
        if (!lastRow) continue;
        if (!isBlankRow(lastRow)) {
          const insertionStart = nextRows.length;
          nextRows.push(createRowForProduct(lastRow));
          insertions.push({ from: insertionStart, to: insertionStart + 1 });
        }
      }
      return { rows: nextRows, insertions };
    },
    [createRowForProduct, isBlankRow]
  );

  const initialRowsWithBlank = useMemo(
    () =>
      ensureTrailingBlankRows((initialRows || []) as ProductBomsSheetRow[])
        .rows,
    [ensureTrailingBlankRows, initialRows]
  );

  const dataGrid = useDataGrid<ProductBomsSheetRow>({
    initialData: initialRowsWithBlank,
    getRowId: (r) => (r as any)?.id ?? `${r.productId}-${r.childSku}`,
  });
  const sheetController = adaptDataGridController(dataGrid);
  useEffect(() => {
    sheetController.state = { isDirty: dataGrid.gridState.isDirty };
  }, [sheetController, dataGrid.gridState.isDirty]);

  const rows = useMemo<Row[]>(() => {
    const header: Row = {
      rowId: "header",
      height: 34,
      cells: [
        {
          type: "axisHeader",
          text: "#",
          className: "rg-header-cell rg-rownum-cell",
        },
        ...columnSelection.selectedColumns.map((def) => ({
          type: "axisHeader",
          text: def.label,
          className: "rg-header-cell",
        })),
      ],
    };
    const dataRows: Row[] = (dataGrid.value || []).map((row, rowIndex) => {
      const rowId = getRowId(row, rowIndex);
      const cells = [
        {
          type: "axisText",
          text: String(rowIndex + 1),
          nonEditable: true,
          className: "rg-rownum-cell rg-non-editable",
        } as AxisTextCell,
        ...columnSelection.selectedColumns.map((def) => {
        const rawValue = (row as any)[def.key];
        const isApplicable =
          def.editable !== false && def.key !== "product" && def.key !== "id";
        const isUserEditable =
          EDITABLE_COLUMNS.has(def.key) && isApplicable;
        const isDerivedReadOnly = DERIVED_READONLY_COLUMNS.has(def.key);
        const nonEditable = !isUserEditable || isDerivedReadOnly;
        const groupId =
          groupByProduct && row?.productId && !nonEditable
            ? String(row.productId)
            : undefined;
        if (def.key === "product") {
          const label = row.groupStart
            ? `${row.productSku || ""} — ${row.productName || ""}`
            : "";
          return {
            type: "axisText",
            text: label,
            nonEditable: true,
            groupId,
            className: "rg-non-editable",
          } as AxisTextCell;
        }
        return {
          type: "text",
          text: resolveText(rawValue),
          nonEditable,
          groupId,
          className: nonEditable ? "rg-non-editable" : undefined,
        } as any;
      }),
      ];
      return { rowId, height: 34, cells };
    });
    return [header, ...dataRows];
  }, [
    DERIVED_READONLY_COLUMNS,
    EDITABLE_COLUMNS,
    columnSelection.selectedColumns,
    dataGrid.value,
    getRowId,
    groupByProduct,
  ]);

  const rowIndexById = useMemo(() => {
    const map = new Map<Id, number>();
    (dataGrid.value || []).forEach((row, idx) => {
      const rowId = getRowId(row, idx);
      map.set(rowId, idx);
    });
    return map;
  }, [dataGrid.value, getRowId]);

  const rowsSnapshotRef = useRef<ProductBomsSheetRow[]>([]);
  const latestRowsRef = useRef<ProductBomsSheetRow[]>([]);
  const lastRowSnapshotRef = useRef<Map<string, RowSnapshot>>(new Map());
  const selectionRef = useRef<Range[] | null>(null);
  const focusLocationRef = useRef<CellLocation | null>(null);
  const rgDebug = debugEnabled("DEBUG_SHEET_PASTE");
  const eventsRef = useRef<RgEvent[]>([]);
  const lastEventTickRef = useRef(0);
  const [debugTick, setDebugTick] = useState(0);
  const lastWriteViolationRef = useRef<any | null>(null);
  const lastWriteTrapRef = useRef<any | null>(null);
  const lastRevertRef = useRef<any | null>(null);
  const draftShrinkReasonRef = useRef<string | null>(null);
  const writeBarrierThrowRef = useRef(false);
  const proxyCacheRef = useRef(
    new WeakMap<object, { proxy: any; meta: { rowId: string } }>()
  );
  const didInitProxyRef = useRef(false);
  const beforeLookupSnapshotRef = useRef(new Map<number, GroupSnapshot>());
  const afterDerivedSnapshotRef = useRef(new Map<number, GroupSnapshot>());
  const pendingRedoStructuralRef = useRef<{
    productId: number;
    rowCount: number;
  } | null>(null);
  const pendingSkusRef = useRef<Set<string>>(new Set());
  const lookupTimerRef = useRef<number | null>(null);
  const lookupEpochRef = useRef(0);
  const lookupRequestIdRef = useRef(0);
  const pendingSkuAutofillRef = useRef(
    new Map<number, Array<{ rowId: Id; sku: string }>>()
  );
  const lastEditedRowIdRef = useRef<string | null>(null);
  const pendingShrinkRef = useRef<{
    productId: number;
    rowIds: Id[];
  } | null>(null);
  useEffect(() => {
    rowsSnapshotRef.current = dataGrid.value.slice();
    latestRowsRef.current = dataGrid.value.slice();
  }, [dataGrid.value]);
  useEffect(() => {
    const next = new Map<string, RowSnapshot>();
    const now = Date.now();
    dataGrid.value.forEach((row, idx) => {
      const rowId = String(getRowId(row, idx));
      next.set(rowId, {
        rowId,
        childSku: String(row.childSku || ""),
        childName: (row as any)?.childName ?? "",
        type: (row as any)?.type ?? "",
        supplier: (row as any)?.supplier ?? "",
        productId: (row as any)?.productId ?? null,
        updatedAt: now,
      });
    });
    lastRowSnapshotRef.current = next;
  }, [dataGrid.value, getRowId]);
  useEffect(() => {
    if (!isDevEnv) return;
    deepFreeze(dataGrid.value);
  }, [dataGrid.value, isDevEnv]);

  const summarizeSelection = useCallback((ranges: Range[] | null) => {
    const locations = collectSelectedCellLocations(ranges);
    if (!locations.length) return null;
    let minRow = locations[0].rowIdx;
    let maxRow = locations[0].rowIdx;
    let minCol = locations[0].colIdx;
    let maxCol = locations[0].colIdx;
    for (const loc of locations) {
      if (loc.rowIdx < minRow) minRow = loc.rowIdx;
      if (loc.rowIdx > maxRow) maxRow = loc.rowIdx;
      if (loc.colIdx < minCol) minCol = loc.colIdx;
      if (loc.colIdx > maxCol) maxCol = loc.colIdx;
    }
    return {
      count: locations.length,
      rows: [minRow, maxRow],
      cols: [minCol, maxCol],
    };
  }, []);

  const pushEvent = useCallback(
    (event: RgEvent) => {
      if (!rgDebug) return;
      eventsRef.current.push(event);
      if (eventsRef.current.length > 300) {
        eventsRef.current.splice(0, eventsRef.current.length - 300);
      }
      const now = Date.now();
      if (now - lastEventTickRef.current > 250) {
        lastEventTickRef.current = now;
        setDebugTick((tick) => tick + 1);
      }
    },
    [rgDebug]
  );

  const proxyRow = useCallback(
    <T extends Record<string, any>>(row: T, rowId: string): T => {
      if (!row || typeof row !== "object") return row;
      const cached = proxyCacheRef.current.get(row as any);
      if (cached) {
        cached.meta.rowId = rowId;
        return cached.proxy;
      }
      const meta = { rowId };
      const proxy = new Proxy(row as any, {
        set(target, prop, value) {
          if (prop === "childSku") {
            const before = String((target as any)?.childSku || "").trim();
            const after = String(value ?? "").trim();
            if (before && !after) {
              const payload = {
                ts: Date.now(),
                kind: "SKU_WRITE_TRAP",
                rowId: meta.rowId,
                before,
                after,
                stack: new Error().stack,
                focus: focusLocationRef.current
                  ? {
                      rowId: focusLocationRef.current.rowId,
                      columnId: focusLocationRef.current.columnId,
                    }
                  : null,
                selection: summarizeSelection(selectionRef.current),
              };
              lastWriteTrapRef.current = payload;
              if (typeof window !== "undefined") {
                (window as any).__BOMS_RG_LAST_WRITE_TRAP__ = payload;
              }
              setDebugTick((tick) => tick + 1);
              pushEvent({
                t: Date.now(),
                type: "writeTrap.skuCleared",
                data: payload,
              });
              // eslint-disable-next-line no-console
              console.error("[BOMs RG] SKU WRITE TRAP", payload);
              if (isDevEnv && !writeBarrierThrowRef.current) {
                writeBarrierThrowRef.current = true;
                setTimeout(() => {
                  writeBarrierThrowRef.current = false;
                }, 0);
                throw new Error(
                  "SKU cleared by writer. See __BOMS_RG_LAST_WRITE_TRAP__"
                );
              }
            }
          }
          (target as any)[prop] = value;
          return true;
        },
      });
      if (Object.isExtensible(row)) {
        Object.defineProperty(proxy, "__isSkuTrapProxy", {
          value: true,
          enumerable: false,
        });
      }
      proxyCacheRef.current.set(row as any, { proxy, meta });
      return proxy as T;
    },
    [isDevEnv, pushEvent, setDebugTick, summarizeSelection]
  );

  const wrapRowsWithProxy = useCallback(
    (rows: ProductBomsSheetRow[]) =>
      rows.map((row, idx) => proxyRow(row, String(getRowId(row, idx)))),
    [getRowId, proxyRow]
  );

  const writeBarrier = useCallback(
    (
      reason: string,
      prevRows: ProductBomsSheetRow[],
      nextRows: ProductBomsSheetRow[]
    ) => {
      const prevMap = new Map<string, ProductBomsSheetRow>();
      prevRows.forEach((row, idx) => {
        prevMap.set(String(getRowId(row, idx)), row);
      });
      const nextMap = new Map<string, ProductBomsSheetRow>();
      nextRows.forEach((row, idx) => {
        nextMap.set(String(getRowId(row, idx)), row);
      });
      const cleared: Array<{
        rowId: string;
        before: string;
        after: string;
        removed: boolean;
      }> = [];
      prevMap.forEach((row, rowId) => {
        const before = String((row as any)?.childSku || "").trim();
        if (!before) return;
        const nextRow = nextMap.get(rowId);
        const after = String((nextRow as any)?.childSku || "").trim();
        if (!after) {
          cleared.push({
            rowId,
            before,
            after,
            removed: !nextRow,
          });
        }
      });
      if (!cleared.length) return;
      const payload = {
        ts: Date.now(),
        kind: "WRITE_BARRIER_SKU_CLEARED",
        reason,
        cleared,
        stack: new Error().stack,
        focus: focusLocationRef.current
          ? {
              rowId: focusLocationRef.current.rowId,
              columnId: focusLocationRef.current.columnId,
            }
          : null,
        selection: summarizeSelection(selectionRef.current),
      };
      lastWriteViolationRef.current = payload;
      if (typeof window !== "undefined") {
        (window as any).__BOMS_RG_LAST_WRITE__ = payload;
      }
      setDebugTick((tick) => tick + 1);
      pushEvent({
        t: Date.now(),
        type: "writeBarrier.skuCleared",
        data: payload,
      });
      // eslint-disable-next-line no-console
      console.error("[BOMs RG] WRITE BARRIER", payload);
      if (isDevEnv && !writeBarrierThrowRef.current) {
        writeBarrierThrowRef.current = true;
        setTimeout(() => {
          writeBarrierThrowRef.current = false;
        }, 0);
        throw new Error(`SKU cleared by writer: ${reason}`);
      }
    },
    [getRowId, isDevEnv, pushEvent, setDebugTick, summarizeSelection]
  );

  const buildRowMeta = useCallback(
    (rowsForMeta: ProductBomsSheetRow[]) => {
      const rowMetaById = new Map<
        Id,
        { absIndex: number; productId: number | null; inGroupIndex: number | null }
      >();
      const groupRowIds = new Map<number, Id[]>();
      const groupEndIndexByProduct = new Map<number, number>();
      const groupCounts = new Map<number, number>();
      rowsForMeta.forEach((row, absIndex) => {
        const rowId = getRowId(row, absIndex);
        const productId =
          typeof row?.productId === "number" ? row.productId : null;
        let inGroupIndex: number | null = null;
        if (productId != null) {
          const nextIndex = groupCounts.get(productId) ?? 0;
          inGroupIndex = nextIndex;
          groupCounts.set(productId, nextIndex + 1);
          const list = groupRowIds.get(productId) ?? [];
          list.push(rowId);
          groupRowIds.set(productId, list);
          groupEndIndexByProduct.set(productId, absIndex);
        }
        rowMetaById.set(rowId, { absIndex, productId, inGroupIndex });
      });
      return { rowMetaById, groupRowIds, groupEndIndexByProduct };
    },
    [getRowId]
  );

  // Invariant framework (temporary, keep until UAT stabilizes)
  const captureRowState = useCallback(
    (label: string, rowId: string, rowsOverride?: ProductBomsSheetRow[]) => {
      const rowsToUse = rowsOverride ?? latestRowsRef.current;
      let found: ProductBomsSheetRow | null = null;
      for (let i = 0; i < rowsToUse.length; i += 1) {
        if (String(getRowId(rowsToUse[i], i)) === rowId) {
          found = rowsToUse[i];
          break;
        }
      }
      return {
        label,
        rowId,
        exists: !!found,
        childSku: found ? String(found.childSku || "") : null,
        childName: found ? (found as any)?.childName ?? null : null,
        type: found ? (found as any)?.type ?? null : null,
        supplier: found ? (found as any)?.supplier ?? null : null,
        productId: found ? (found as any)?.productId ?? null : null,
        isDraft: rowId.startsWith("row:"),
      };
    },
    [getRowId]
  );

  function getProductIdForRowId(
    rows: ProductBomsSheetRow[],
    rowId: string
  ) {
    for (let i = 0; i < rows.length; i += 1) {
      if (String(getRowId(rows[i], i)) === rowId) {
        const productId = (rows[i] as any)?.productId;
        return typeof productId === "number" ? productId : null;
      }
    }
    return null;
  }

  const isDraftRowId = useCallback((rowId: string) => rowId.startsWith("row:"), []);

  function collectDraftRowIdsByProduct(rows: ProductBomsSheetRow[]) {
    const map = new Map<number, string[]>();
    rows.forEach((row, idx) => {
      const rowId = String(getRowId(row, idx));
      if (!isDraftRowId(rowId)) return;
      const productId = (row as any)?.productId;
      if (typeof productId !== "number") return;
      const list = map.get(productId) ?? [];
      list.push(rowId);
      map.set(productId, list);
    });
    return map;
  }

  function recordDraftShrinkStack(
    prevRows: ProductBomsSheetRow[],
    nextRows: ProductBomsSheetRow[],
    reason: string
  ) {
    const beforeMap = collectDraftRowIdsByProduct(prevRows);
    const afterMap = collectDraftRowIdsByProduct(nextRows);
    beforeMap.forEach((beforeIds, productId) => {
      const afterIds = afterMap.get(productId) ?? [];
      if (afterIds.length >= beforeIds.length) return;
      const payload = {
        ts: Date.now(),
        phase: "draftRows.update",
        reason,
        productId,
        beforeDraftRowIds: beforeIds,
        afterDraftRowIds: afterIds,
        stack: new Error().stack,
      };
      const existing =
        lastRevertRef.current ??
        (typeof window !== "undefined"
          ? (window as any).__BOMS_RG_LAST_REVERT__ ?? null
          : null) ??
        {};
      const merged = {
        ...existing,
        stack: payload.stack,
        shrink: payload,
      };
      lastRevertRef.current = merged;
      if (typeof window !== "undefined") {
        (window as any).__BOMS_RG_LAST_REVERT__ = merged;
      }
      // eslint-disable-next-line no-console
      console.error("[BOMs RG] DRAFT ROWS SHRUNK", payload);
    });
  }

  function getSkuForRowId(rows: ProductBomsSheetRow[], rowId: string) {
    for (let i = 0; i < rows.length; i += 1) {
      if (String(getRowId(rows[i], i)) === rowId) {
        return String((rows[i] as any)?.childSku || "").trim();
      }
    }
    return "";
  }

  const dumpViolation = useCallback(
    (payload: {
      kind: string;
      rowId: string;
      requestId?: number | null;
      phase: string;
      prev?: RowSnapshot;
      now?: any;
    }) => {
      const rowsNow = latestRowsRef.current.slice();
      const meta = buildRowMeta(rowsNow);
      const productId =
        meta.rowMetaById.get(payload.rowId)?.productId ?? null;
      const tailRowIds =
        productId != null
          ? (meta.groupRowIds.get(productId) ?? [])
              .slice(-10)
              .map((id) => String(id))
          : [];
      const dump = {
        ts: Date.now(),
        ...payload,
        groupTail: tailRowIds.map((id) =>
          captureRowState("groupTail", id, rowsNow)
        ),
        events: eventsRef.current.slice(-80),
      };
      (globalThis as any).__BOMS_RG_LAST_DUMP__ = dump;
      // eslint-disable-next-line no-console
      console.error("[BOMs RG] INVARIANT VIOLATION", dump);
    },
    [buildRowMeta, captureRowState]
  );

  const getCurrentGroupRows = useCallback(
    (productId: number, rowsOverride?: ProductBomsSheetRow[]) => {
      const rowsNow = rowsOverride ?? latestRowsRef.current;
      const meta = buildRowMeta(rowsNow);
      const groupRowIds = meta.groupRowIds.get(productId) ?? [];
      const rowById = new Map<Id, ProductBomsSheetRow>();
      rowsNow.forEach((row, idx) => {
        rowById.set(getRowId(row, idx), row);
      });
      return groupRowIds.map((rowId) => ({
        rowId: String(rowId),
        row: rowById.get(rowId) ?? null,
      }));
    },
    [buildRowMeta, getRowId]
  );

  const snapshotGroup = useCallback(
    (productId: number, rowsOverride?: ProductBomsSheetRow[]) => {
      const rows = getCurrentGroupRows(productId, rowsOverride);
      const draftRows = rows.filter((entry) => isDraftRowId(entry.rowId));
      const draftRowIds = draftRows.map((entry) => entry.rowId);
      const tailRowIds = rows.slice(-6).map((entry) => entry.rowId);
      const hasTrailingBlank = draftRows.some(
        (entry) => entry.row && isBlankRow(entry.row)
      );
      return {
        ts: Date.now(),
        productId,
        draftRowIds,
        draftCount: draftRowIds.length,
        tailRowIds,
        hasTrailingBlank,
      };
    },
    [getCurrentGroupRows, isBlankRow, isDraftRowId]
  );

  function appendTrailingBlankIfMissing(
    rows: ProductBomsSheetRow[],
    productId: number
  ) {
    const meta = buildRowMeta(rows);
    const groupEndIndex = meta.groupEndIndexByProduct.get(productId) ?? -1;
    if (groupEndIndex < 0 || groupEndIndex >= rows.length) {
      return { rows, didAppend: false };
    }
    const lastRow = rows[groupEndIndex];
    if (!lastRow || isBlankRow(lastRow)) {
      return { rows, didAppend: false };
    }
    const nextRows = [
      ...rows.slice(0, groupEndIndex + 1),
      createRowForProduct(lastRow),
      ...rows.slice(groupEndIndex + 1),
    ];
    return { rows: nextRows, didAppend: true };
  }

  const reportGroupRevert = useCallback(
    (info: {
      before?: GroupSnapshot | null;
      after: GroupSnapshot;
      editedRowId?: string | null;
      sku?: string | null;
      phase: string;
      reason?: string | null;
      stack?: string | null;
      extraFlags?: string[];
      prevSku?: string | null;
      nextSku?: string | null;
    }) => {
      const before = info.before;
      if (!before) return;
      const missingDraftRowIds = before.draftRowIds.filter(
        (rowId) => !info.after.draftRowIds.includes(rowId)
      );
      const flags: string[] = [];
      if (info.after.draftCount < before.draftCount) {
        flags.push("REVERT_DRAFT_ROWS_SHRUNK");
      }
      if (missingDraftRowIds.length) {
        flags.push("REVERT_DRAFT_ROW_MISSING");
      }
      let expectedTrailingId: string | null = null;
      if (before.hasTrailingBlank && before.draftRowIds.length) {
        expectedTrailingId = before.draftRowIds[before.draftRowIds.length - 1];
        if (!info.after.draftRowIds.includes(expectedTrailingId)) {
          flags.push("REVERT_TRAILING_BLANK_LOST");
        }
      }
      if (info.prevSku && !info.nextSku) {
        flags.push("REVERT_SKU_CLEARED");
      }
      if (info.extraFlags?.length) {
        flags.push(...info.extraFlags);
      }
      if (!flags.length) return;
      const payload = {
        ts: Date.now(),
        phase: info.phase,
        reason: info.reason ?? null,
        productId: info.after.productId,
        editedRowId: info.editedRowId ?? null,
        sku: info.sku ?? null,
        flags,
        before,
        after: info.after,
        missingDraftRowIds,
        expectedTrailingId,
        prevSku: info.prevSku ?? null,
        nextSku: info.nextSku ?? null,
        events: eventsRef.current.slice(-80),
        stack: info.stack ?? null,
      };
      lastRevertRef.current = payload;
      if (typeof window !== "undefined") {
        (window as any).__BOMS_RG_LAST_REVERT__ = payload;
      }
      // eslint-disable-next-line no-console
      console.error("[BOMs RG] DRAFT ROWS REVERTED", payload);
      if (isDevEnv) {
        throw new Error("Draft rows reverted; see __BOMS_RG_LAST_REVERT__");
      }
    },
    [isDevEnv]
  );

  const commitRowsChange = useCallback(
    (
      reason: string,
      nextRows: ProductBomsSheetRow[],
      ops?: Array<{ type: "UPDATE"; fromRowIndex: number; toRowIndex: number }>
    ) => {
      const prevRows = dataGrid.value.slice();
      const proxiedNext = wrapRowsWithProxy(nextRows);
      const frozenNext = isDevEnv ? deepFreeze(proxiedNext) : proxiedNext;
      writeBarrier(reason, prevRows, frozenNext);
      const shrinkReason = draftShrinkReasonRef.current ?? reason;
      recordDraftShrinkStack(prevRows, frozenNext, shrinkReason);
      const editedRowId = lastEditedRowIdRef.current;
      if (editedRowId) {
        const productId =
          getProductIdForRowId(prevRows, editedRowId) ??
          getProductIdForRowId(frozenNext, editedRowId);
        if (productId != null) {
          const prevSku = getSkuForRowId(prevRows, editedRowId);
          const nextSku = getSkuForRowId(frozenNext, editedRowId);
          reportGroupRevert({
            before: snapshotGroup(productId, prevRows),
            after: snapshotGroup(productId, frozenNext),
            editedRowId,
            sku: nextSku || prevSku,
            phase: "domain.commit",
            reason,
            stack: new Error().stack,
            prevSku,
            nextSku,
          });
        }
      }
      if (ops?.length) {
        dataGrid.onChange(frozenNext, ops);
      } else {
        dataGrid.setValue(frozenNext);
      }
    },
    [
      dataGrid,
      getProductIdForRowId,
      getSkuForRowId,
      isDevEnv,
      reportGroupRevert,
      snapshotGroup,
      wrapRowsWithProxy,
      writeBarrier,
    ]
  );

  useEffect(() => {
    if (didInitProxyRef.current) return;
    didInitProxyRef.current = true;
    commitRowsChange("init.proxy", wrapRowsWithProxy(dataGrid.value.slice()));
  }, [commitRowsChange, dataGrid.value, wrapRowsWithProxy]);

  const assertSkuNotCleared = useCallback(
    (info: {
      rowId: string;
      phase: string;
      requestId?: number | null;
      expectedSku?: string | null;
      rowsOverride?: ProductBomsSheetRow[];
    }) => {
      const now = captureRowState(
        info.phase,
        info.rowId,
        info.rowsOverride
      );
      const prev = lastRowSnapshotRef.current.get(info.rowId);
      const expectedSku = String(info.expectedSku || "").trim();
      const nowSku = String(now.childSku || "").trim();
      const prevSku = String(prev?.childSku || "").trim();
      const violation =
        (expectedSku && !nowSku) ||
        (prevSku && !nowSku) ||
        (now.exists && !nowSku && now.childName);
      if (!violation) return;
      dumpViolation({
        kind: "SKU_CLEARED",
        rowId: info.rowId,
        requestId: info.requestId ?? null,
        phase: info.phase,
        prev,
        now,
      });
    },
    [captureRowState, dumpViolation]
  );

  const removeAppendedRowsInGroup = useCallback(
    (info: { productId: number; rowIds: Id[] }, rowsNow: ProductBomsSheetRow[]) => {
      if (!info?.rowIds?.length) return false;
      const metaNow = buildRowMeta(rowsNow);
      const groupRowIds = metaNow.groupRowIds.get(info.productId) ?? [];
      const rowById = new Map<Id, ProductBomsSheetRow>();
      rowsNow.forEach((row, idx) => {
        rowById.set(getRowId(row, idx), row);
      });
      const rowIdSet = new Set(info.rowIds);
      let trailingBlankCount = 0;
      for (let i = groupRowIds.length - 1; i >= 0; i -= 1) {
        const rowId = groupRowIds[i];
        if (rowIdSet.has(rowId)) break;
        const row = rowById.get(rowId);
        if (!row || !isBlankRow(row)) break;
        trailingBlankCount += 1;
        if (trailingBlankCount >= 2) break;
      }
      const effectiveTail = groupRowIds.slice(
        0,
        groupRowIds.length - trailingBlankCount
      );
      const tail = effectiveTail.slice(-info.rowIds.length);
      if (tail.length !== info.rowIds.length) {
        if (rgDebug) {
          pushEvent({
            t: Date.now(),
            type: "undo.end",
            didShrink: false,
            shrinkReason: "tail mismatch",
          });
        }
        return false;
      }
      for (let i = 0; i < tail.length; i += 1) {
        if (tail[i] !== info.rowIds[i]) {
          if (rgDebug) {
            pushEvent({
              t: Date.now(),
              type: "undo.end",
              didShrink: false,
              shrinkReason: "order mismatch",
            });
          }
          return false;
        }
      }
      const targetRows = info.rowIds
        .map((rowId) => rowById.get(rowId))
        .filter(Boolean) as ProductBomsSheetRow[];
      if (targetRows.length !== info.rowIds.length) {
        if (rgDebug) {
          pushEvent({
            t: Date.now(),
            type: "undo.end",
            didShrink: false,
            shrinkReason: "missing rows",
          });
        }
        return false;
      }
      if (!targetRows.every((row) => isBlankRow(row))) {
        const nonBlankRow = targetRows.find(
          (row) => String(row.childSku || "").trim().length > 0
        );
        if (nonBlankRow) {
          const rowId = getRowId(
            nonBlankRow,
            rowsNow.indexOf(nonBlankRow)
          );
          dumpViolation({
            kind: "TRIM_TRIED_TO_REMOVE_NONBLANK",
            rowId: String(rowId),
            phase: "undo.shrink",
          });
        }
        if (rgDebug) {
          pushEvent({
            t: Date.now(),
            type: "undo.end",
            didShrink: false,
            shrinkReason: "not blank",
          });
        }
        return false;
      }
      const nextRows = rowsNow.filter(
        (row, idx) => !rowIdSet.has(getRowId(row, idx))
      );
      const withTrailing = ensureTrailingBlankRows(nextRows).rows;
      commitRowsChange("undo.shrinkRows", withTrailing);
      if (rgDebug) {
        pushEvent({
          t: Date.now(),
          type: "undo.end",
          didShrink: true,
        });
      }
      return true;
    },
    [
      buildRowMeta,
      commitRowsChange,
      dataGrid,
      dumpViolation,
      ensureTrailingBlankRows,
      getRowId,
      isBlankRow,
      pushEvent,
      rgDebug,
    ]
  );

  const appendRowsInGroup = useCallback(
    (info: { productId: number; rowCount: number }) => {
      if (!info?.rowCount) return;
      const rowsNow = dataGrid.value.slice();
      const metaNow = buildRowMeta(rowsNow);
      const groupEndIndex =
        metaNow.groupEndIndexByProduct.get(info.productId) ?? -1;
      if (groupEndIndex < 0) return;
      const anchorRow = rowsNow[groupEndIndex];
      if (!anchorRow) return;
      const inserted = Array.from({ length: info.rowCount }, () =>
        createRowForProduct(anchorRow)
      );
      const nextRows = [
        ...rowsNow.slice(0, groupEndIndex + 1),
        ...inserted,
        ...rowsNow.slice(groupEndIndex + 1),
      ];
      const withTrailing = ensureTrailingBlankRows(nextRows).rows;
      commitRowsChange("redo.appendRows", withTrailing);
    },
    [
      buildRowMeta,
      commitRowsChange,
      createRowForProduct,
      dataGrid,
      ensureTrailingBlankRows,
    ]
  );

  const handleSelectionChanged = useCallback(
    (ranges: Range[]) => {
      selectionRef.current = ranges;
      if (rgDebug) {
        const summary = summarizeSelection(ranges);
        if (summary) {
          pushEvent({
            t: Date.now(),
            type: "selection",
            rows: summary.rows,
            cols: summary.cols,
            count: summary.count,
          });
        }
      }
    },
    [pushEvent, rgDebug, summarizeSelection]
  );

  const handleFocusLocationChanged = useCallback(
    (location: CellLocation) => {
      focusLocationRef.current = location;
      if (rgDebug) {
        const meta = buildRowMeta(latestRowsRef.current);
        const rowMeta = meta.rowMetaById.get(location.rowId);
        const rowIdx = rowMeta?.absIndex ?? null;
        const colIdx = columns.findIndex(
          (col) => col.columnId === location.columnId
        );
        const cell =
          rowIdx != null && rowIdx >= 0 && colIdx >= 0
            ? rows[rowIdx + 1]?.cells?.[colIdx]
            : null;
        pushEvent({
          t: Date.now(),
          type: "focus",
          rowId: String(location.rowId),
          columnId: String(location.columnId),
        });
        if (cell) {
          pushEvent({
            t: Date.now(),
            type: "cellsChanged.filtered",
            stage: "focus.cell",
            before: 1,
            after: 1,
            dropped: {
              type: (cell as any)?.type,
              nonEditable: (cell as any)?.nonEditable,
            },
          });
        }
      }
    },
    [buildRowMeta, columns, pushEvent, rgDebug, rows]
  );


  const notifySkippedUndoRedo = useCallback(
    (info: { kind: "undo" | "redo"; skippedCount: number }) => {
      notifications.show({
        color: "yellow",
        title:
          info.kind === "undo"
            ? "Undo partially applied"
            : "Redo partially applied",
        message: "Some cells could not be changed due to rules.",
      });
    },
    []
  );

  const applyValueChanges = useCallback(
    (
      valueChanges: Array<{ rowId: Id; columnId: Id; nextValue: any }>,
      options?: {
        rows?: ProductBomsSheetRow[];
        rowIndexById?: Map<Id, number>;
        source?: "edit" | "undo" | "redo";
        allowReadOnly?: boolean;
        allowAllColumns?: boolean;
      }
    ) => {
      const baseRows = options?.rows ?? dataGrid.value;
      const rowIndexByIdLocal =
        options?.rowIndexById ??
        new Map(
          baseRows.map((row, idx) => [getRowId(row, idx), idx])
        );
      const workingRows = baseRows.slice();
      const updatedIndexes = new Set<number>();
      const applied: Array<{
        rowId: string;
        colId: string;
        prevValue: any;
        nextValue: any;
      }> = [];
      let skippedCount = 0;
      const updateRowPatch = (
        row: ProductBomsSheetRow,
        patch: Partial<ProductBomsSheetRow>,
        mode: { allowReadOnly?: boolean },
        rowId: Id
      ) => {
        const prevSku = String((row as any)?.childSku || "").trim();
        const nextRow = { ...row, ...patch };
        const nextSku = String((nextRow as any)?.childSku || "").trim();
        if (mode.allowReadOnly && prevSku && !nextSku) {
          dumpViolation({
            kind: "DERIVED_CLEARED_CHILD_SKU",
            rowId: String(rowId),
            phase: "applyValueChanges",
            prev: {
              rowId: String(rowId),
              childSku: prevSku,
              updatedAt: Date.now(),
            },
            now: {
              rowId: String(rowId),
              childSku: nextSku,
            },
          });
          if (isDevEnv) {
            throw new Error("Derived apply cleared childSku.");
          }
        }
        return nextRow;
      };
      for (const change of valueChanges) {
        const hasRowId = rowIndexByIdLocal.has(change.rowId);
        const rowIndex = hasRowId
          ? rowIndexByIdLocal.get(change.rowId)
          : options?.allowReadOnly
          ? null
          : parseRowIndexFromId(change.rowId);
        if (rowIndex == null || rowIndex >= workingRows.length) {
          skippedCount += 1;
          continue;
        }
        const row = workingRows[rowIndex];
        const key = String(change.columnId);
        if (key === "__rownum") {
          skippedCount += 1;
          continue;
        }
        const def = columnDefsByKey.get(key);
        const isApplicable =
          def?.editable !== false && def?.key !== "product" && def?.key !== "id";
        const isUserEditable =
          EDITABLE_COLUMNS.has(key) && isApplicable;
        const isDerivedAllowed = DERIVED_ALLOWED_COLUMNS.has(key);
        if (options?.allowReadOnly && key === "childSku") {
          dumpViolation({
            kind: "DERIVED_TRIED_TO_SET_CHILD_SKU",
            rowId: String(change.rowId),
            phase: "applyValueChanges",
          });
          skippedCount += 1;
          continue;
        }
        const canApply = options?.allowAllColumns
          ? true
          : options?.allowReadOnly
          ? isDerivedAllowed
          : isUserEditable;
        if (!canApply) {
          skippedCount += 1;
          continue;
        }
        const prevValue = (row as any)[key] ?? "";
        const nextRow = updateRowPatch(
          row,
          { [key]: change.nextValue } as Partial<ProductBomsSheetRow>,
          { allowReadOnly: options?.allowReadOnly },
          change.rowId
        );
        workingRows[rowIndex] = nextRow;
        applied.push({
          rowId: String(change.rowId),
          colId: String(change.columnId),
          prevValue,
          nextValue: change.nextValue,
        });
        updatedIndexes.add(rowIndex);
      }
      if (!updatedIndexes.size) {
        return { applied, skippedCount, nextRows: workingRows };
      }
      const ops = Array.from(updatedIndexes).map((idx) => ({
        type: "UPDATE" as const,
        fromRowIndex: idx,
        toRowIndex: idx + 1,
      }));
      commitRowsChange(options?.allowReadOnly ? "autofill.applyValueChanges" : "user.applyValueChanges", workingRows, ops);
      return { applied, skippedCount, nextRows: workingRows };
    },
    [
      EDITABLE_COLUMNS,
      DERIVED_ALLOWED_COLUMNS,
      columnDefsByKey,
      commitRowsChange,
      dataGrid,
      dumpViolation,
      getRowId,
      isDevEnv,
    ]
  );

  const applyRowPatches = useCallback(
    (
      patches: Array<{ rowId: Id; patch: Partial<ProductBomsSheetRow> }>,
      options?: {
        rows?: ProductBomsSheetRow[];
        rowIndexById?: Map<Id, number>;
        source?: "derived" | "edit";
      }
    ) => {
      const baseRows = options?.rows ?? dataGrid.value;
      const rowIndexByIdLocal =
        options?.rowIndexById ??
        new Map(
          baseRows.map((row, idx) => [getRowId(row, idx), idx])
        );
      const workingRows = baseRows.slice();
      const updatedIndexes = new Set<number>();
      const applied: Array<{
        rowId: string;
        colId: string;
        prevValue: any;
        nextValue: any;
      }> = [];
      for (const entry of patches) {
        const rowIndex = rowIndexByIdLocal.get(entry.rowId);
        if (rowIndex == null || rowIndex >= workingRows.length) continue;
        const row = workingRows[rowIndex];
        const prevSku = String((row as any)?.childSku || "").trim();
        const nextRow = { ...row, ...entry.patch };
        const nextSku = String((nextRow as any)?.childSku || "").trim();
        if (prevSku && !nextSku) {
          dumpViolation({
            kind: "PATCH_ROW_CLEARED_SKU",
            rowId: String(entry.rowId),
            phase: "applyRowPatches",
            prev: {
              rowId: String(entry.rowId),
              childSku: prevSku,
              updatedAt: Date.now(),
            },
            now: {
              rowId: String(entry.rowId),
              childSku: nextSku,
              stack: new Error().stack,
            } as any,
          });
          if (isDevEnv) {
            throw new Error("PatchRow cleared childSku.");
          }
        }
        if (options?.source === "derived" && prevSku && prevSku !== nextSku) {
          dumpViolation({
            kind: "DERIVED_TRIED_TO_CHANGE_SKU",
            rowId: String(entry.rowId),
            phase: "applyRowPatches",
            prev: { rowId: String(entry.rowId), childSku: prevSku, updatedAt: Date.now() },
            now: { rowId: String(entry.rowId), childSku: nextSku },
          });
          if (isDevEnv) {
            throw new Error("Derived patch tried to change childSku.");
          }
          (nextRow as any).childSku = prevSku;
        }
        let didUpdate = false;
        Object.keys(entry.patch).forEach((key) => {
          const prevValue = (row as any)[key];
          const nextValue = (nextRow as any)[key];
          if (prevValue === nextValue) return;
          applied.push({
            rowId: String(entry.rowId),
            colId: String(key),
            prevValue,
            nextValue,
          });
          didUpdate = true;
        });
        if (didUpdate) {
          workingRows[rowIndex] = nextRow;
          updatedIndexes.add(rowIndex);
        }
      }
      if (!updatedIndexes.size) {
        return { applied, nextRows: workingRows };
      }
      const ops = Array.from(updatedIndexes).map((idx) => ({
        type: "UPDATE" as const,
        fromRowIndex: idx,
        toRowIndex: idx + 1,
      }));
      commitRowsChange(
        options?.source === "derived" ? "autofill.applyRowPatches" : "user.applyRowPatches",
        workingRows,
        ops
      );
      return { applied, nextRows: workingRows };
    },
    [commitRowsChange, dataGrid, dumpViolation, getRowId, isDevEnv]
  );

  const undoRedo = useReactGridUndoRedo({
    applyCellChanges: (changes, opts) => {
      const result = applyValueChanges(
        changes.map((change) => ({
          rowId: change.rowId,
          columnId: change.colId,
          nextValue: change.value,
        })),
        { source: opts?.source, allowAllColumns: true }
      );
      return {
        appliedCount: result.applied.length,
        skippedCount: result.skippedCount,
      };
    },
    onSkipped: notifySkippedUndoRedo,
  });

  const normalizeSkuKey = useCallback(
    (value: string) => value.trim().toLowerCase(),
    []
  );

  const enqueueSkuLookup = useCallback(
    (requestId: number, skus: string[]) => {
      skus
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .forEach((s) => pendingSkusRef.current.add(s));
      if (lookupTimerRef.current) window.clearTimeout(lookupTimerRef.current);
      lookupTimerRef.current = window.setTimeout(async () => {
        const epoch = lookupEpochRef.current;
        const toFetch = Array.from(pendingSkusRef.current);
        pendingSkusRef.current.clear();
        if (!toFetch.length) return;
        try {
          const map = await lookupProductsBySkus(toFetch);
          if (epoch !== lookupEpochRef.current) return;
          const normalize = (value: string) => value.trim().toLowerCase();
          const requested = toFetch.map((sku) => normalize(sku));
          const lookupBySku = new Map<string, any>();
          requested.forEach((sku) => {
            if (map.has(sku)) lookupBySku.set(sku, map.get(sku));
          });
          const resolvedSkus = requested.filter((sku) => lookupBySku.has(sku));
          const unresolvedSkus = requested.filter(
            (sku) => !lookupBySku.has(sku)
          );
          if (rgDebug) {
            pushEvent({
              t: Date.now(),
              type: "sku.lookup",
              requestId,
              requested: toFetch.length,
              resolved: resolvedSkus.length,
              unresolvedSkus,
            });
          }
          const rowsNow = dataGrid.value.slice();
          const rowIndexByIdLocal = new Map(
            rowsNow.map((row, idx) => [getRowId(row, idx), idx])
          );
          const patches: Array<{
            rowId: Id;
            patch: Partial<ProductBomsSheetRow>;
          }> = [];
          const derivedRowIds = new Set<string>();
          const targets = pendingSkuAutofillRef.current.get(requestId) || [];
          targets.forEach((target) => {
            assertSkuNotCleared({
              rowId: String(target.rowId),
              phase: "before derived apply",
              requestId,
              expectedSku: target.sku,
              rowsOverride: rowsNow,
            });
          });
          targets.forEach((target) => {
            const rowIdx = rowsNow.findIndex(
              (row, idx) => getRowId(row, idx) === target.rowId
            );
            if (rowIdx < 0) return;
            const row = rowsNow[rowIdx];
            const sku = String(target.sku || "").trim();
            if (!sku) return;
            const key = normalizeSkuKey(sku);
            const info = key ? lookupBySku.get(key) : null;
            if (!info) return;
            const rowId = target.rowId;
            const patch: Partial<ProductBomsSheetRow> = {
              childName: info?.name || "",
              type: info?.type || "",
              supplier: (info as any)?.supplierName || "",
            };
            if (!row.activityUsed) {
              const guessed = normalizeUsageValue(
                (info as any)?.usage || (info as any)?.activityUsed || ""
              );
              if (guessed) {
                patch.activityUsed = guessed;
              }
            }
            patches.push({ rowId, patch });
            derivedRowIds.add(String(rowId));
          });
          if (!patches.length) return;
          if (rgDebug) {
            pushEvent({
              t: Date.now(),
              type: "sku.derived.apply",
              requestId,
              count: patches.length,
              sample: patches.slice(0, 6),
            });
            // eslint-disable-next-line no-console
            console.info("[BOMs RG] derived apply", {
              requestId,
              rows: targets.map((t) => String(t.rowId)),
            });
          }
          draftShrinkReasonRef.current = "sku.lookup.derived";
          let derived: ReturnType<typeof applyRowPatches> | null = null;
          try {
            derived = applyRowPatches(patches, {
              source: "derived",
              rows: rowsNow,
              rowIndexById: rowIndexByIdLocal,
            });
          } finally {
            draftShrinkReasonRef.current = null;
          }
          if (!derived) return;
          const derivedRows = derived.nextRows ?? rowsNow;
          const metaAfterDerived = buildRowMeta(derivedRows);
          const processedProductIds = new Set<number>();
          targets.forEach((target) => {
            const rowId = String(target.rowId);
            const productId =
              metaAfterDerived.rowMetaById.get(rowId)?.productId ?? null;
            if (productId == null || processedProductIds.has(productId)) return;
            processedProductIds.add(productId);
            const before = beforeLookupSnapshotRef.current.get(productId);
            const after = snapshotGroup(productId, derivedRows);
            afterDerivedSnapshotRef.current.set(productId, after);
            reportGroupRevert({
              before,
              after,
              editedRowId: rowId,
              sku: String(target.sku || ""),
              phase: "after derived apply",
              reason: "sku.lookup.derived",
              prevSku: getSkuForRowId(rowsNow, rowId),
              nextSku: getSkuForRowId(derivedRows, rowId),
            });
          });
          targets.forEach((target) => {
            assertSkuNotCleared({
              rowId: String(target.rowId),
              phase: "after derived apply",
              requestId,
              expectedSku: target.sku,
              rowsOverride: derivedRows,
            });
          });
          let trailingRows = derivedRows;
          let didAppendTrailing = false;
          processedProductIds.forEach((productId) => {
            const before = beforeLookupSnapshotRef.current.get(productId);
            if (!before?.hasTrailingBlank) return;
            const after = snapshotGroup(productId, trailingRows);
            if (after.hasTrailingBlank) return;
            const appended = appendTrailingBlankIfMissing(
              trailingRows,
              productId
            );
            if (appended.didAppend) {
              trailingRows = appended.rows;
              didAppendTrailing = true;
              afterDerivedSnapshotRef.current.set(
                productId,
                snapshotGroup(productId, trailingRows)
              );
            }
          });
          if (didAppendTrailing) {
            commitRowsChange(
              "autofill.ensureTrailingBlank.append",
              trailingRows
            );
          }
          if (derived.applied.length) {
            undoRedo.recordAppliedBatch(derived.applied, { kind: "edit" });
            if (rgDebug) {
              const meta = buildRowMeta(latestRowsRef.current);
              derivedRowIds.forEach((rowId) => {
                pushEvent({
                  t: Date.now(),
                  type: "row.exists.check",
                  label: "after derived apply",
                  rowId,
                  exists: meta.rowMetaById.has(rowId),
                });
              });
              const invalidTargets = derived.applied
                .map((change) => String(change.rowId))
                .filter(
                  (rowId) =>
                    targets.findIndex((t) => String(t.rowId) === rowId) === -1
                );
              if (invalidTargets.length) {
                pushEvent({
                  t: Date.now(),
                  type: "error",
                  message: "Derived apply targeted unexpected rows.",
                  stack: JSON.stringify(invalidTargets),
                });
              }
            }
          }
          pendingSkuAutofillRef.current.delete(requestId);
        } catch {}
      }, 120);
    },
    [
      applyRowPatches,
      applyValueChanges,
      assertSkuNotCleared,
      buildRowMeta,
      commitRowsChange,
      dataGrid.value,
      getRowId,
      getSkuForRowId,
      normalizeSkuKey,
      pushEvent,
      rgDebug,
      reportGroupRevert,
      snapshotGroup,
      undoRedo,
    ]
  );

  const handleUndo = useCallback(
    (source: "button" | "hotkey") => {
      if (rgDebug) {
        pushEvent({ t: Date.now(), type: "undo.begin" });
      }
      lookupEpochRef.current += 1;
      pendingSkusRef.current.clear();
      if (lookupTimerRef.current) {
        window.clearTimeout(lookupTimerRef.current);
        lookupTimerRef.current = null;
      }
      const batch = undoRedo.undo(source);
      const structural = batch?.meta?.structural;
      if (structural?.type === "appendRowsInGroup") {
        pendingShrinkRef.current = structural;
        setTimeout(() => {
          const pending = pendingShrinkRef.current;
          if (!pending) return;
          const removed = removeAppendedRowsInGroup(
            pending,
            latestRowsRef.current.slice()
          );
          if (removed) {
            pendingRedoStructuralRef.current = {
              productId: pending.productId,
              rowCount: pending.rowIds.length,
            };
            if (rgDebug) {
              pushEvent({
                t: Date.now(),
                type: "undo.end",
                didShrink: true,
              });
            }
          }
          pendingShrinkRef.current = null;
        }, 0);
      } else if (rgDebug) {
        pushEvent({ t: Date.now(), type: "undo.end" });
      }
    },
    [pushEvent, removeAppendedRowsInGroup, rgDebug, undoRedo]
  );

  const handleRedo = useCallback(
    (source: "button" | "hotkey") => {
      if (rgDebug) {
        pushEvent({ t: Date.now(), type: "undo.begin" });
      }
      lookupEpochRef.current += 1;
      pendingSkusRef.current.clear();
      if (lookupTimerRef.current) {
        window.clearTimeout(lookupTimerRef.current);
        lookupTimerRef.current = null;
      }
      const pending = pendingRedoStructuralRef.current;
      if (pending) {
        appendRowsInGroup(pending);
        pendingRedoStructuralRef.current = null;
      }
      undoRedo.redo(source);
      if (rgDebug) {
        pushEvent({ t: Date.now(), type: "undo.end" });
      }
    },
    [appendRowsInGroup, pushEvent, rgDebug, undoRedo]
  );

  useEffect(() => {
    sheetController.triggerUndo = () => handleUndo("button");
    sheetController.triggerRedo = () => handleRedo("button");
    sheetController.canUndo = undoRedo.canUndo;
    sheetController.canRedo = undoRedo.canRedo;
    sheetController.historyVersion = undoRedo.historyVersion;
  }, [handleRedo, handleUndo, sheetController, undoRedo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isUndo =
        (event.metaKey && key === "z" && !event.shiftKey) ||
        (event.ctrlKey && key === "z" && !event.shiftKey);
      const isRedo =
        (event.metaKey && key === "z" && event.shiftKey) ||
        (event.ctrlKey && (key === "y" || (key === "z" && event.shiftKey)));
      if (!isUndo && !isRedo) return;
      event.preventDefault();
      event.stopPropagation();
      if (isRedo) {
        handleRedo("hotkey");
      } else {
        handleUndo("hotkey");
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [handleRedo, handleUndo]);

  useEffect(() => {
    if (!rgDebug) return;
    // eslint-disable-next-line no-console
    console.info("[BOMs RG] DEBUG_SHEET_PASTE enabled");
  }, [rgDebug]);

  const onCellsChanged = useCallback(
    (changes: CellChange[]) => {
      if (!changes?.length) return;
      // Pipeline: clip to anchor group -> grow rows -> map changes -> apply -> history -> trailing blank.
      const baseRows = rowsSnapshotRef.current.length
        ? rowsSnapshotRef.current.slice()
        : dataGrid.value.slice();
      let workingRows = baseRows.slice();
      let rowMeta = buildRowMeta(workingRows);
      const parseProductIdFromRowId = (rowId: Id) => {
        if (typeof rowId !== "string") return null;
        const match = rowId.match(/^row:\d+:(\d+)/);
        if (!match) return null;
        const id = Number(match[1]);
        return Number.isFinite(id) ? id : null;
      };
      const resolveAnchorRowId = () => {
        const focusedId = focusLocationRef.current?.rowId;
        if (focusedId && rowMeta.rowMetaById.has(focusedId)) return focusedId;
        const firstMatch = changes.find((change) =>
          rowMeta.rowMetaById.has(change.rowId)
        );
        return firstMatch?.rowId ?? changes[0]?.rowId;
      };
      const anchorRowId = resolveAnchorRowId();
      const anchorMeta = anchorRowId
        ? rowMeta.rowMetaById.get(anchorRowId)
        : null;
      const anchorProductId = anchorMeta?.productId ?? null;
      let changesForPipeline = changes;
      let structuralMeta: {
        type: "appendRowsInGroup";
        productId: number;
        rowIds: Id[];
      } | null = null;
      const anchorForMeta = focusLocationRef.current
        ? {
            rowId: focusLocationRef.current.rowId,
            columnId: focusLocationRef.current.columnId,
          }
        : null;
      const uniqueCols = new Set(changes.map((change) => String(change.columnId)));
      const isVerticalSingleCol = changes.length > 1 && uniqueCols.size === 1;
      if (
        isVerticalSingleCol &&
        anchorProductId != null &&
        anchorMeta?.inGroupIndex != null
      ) {
        const startInGroupIndex = anchorMeta.inGroupIndex;
        const currentCount = rowMeta.groupRowIds.get(anchorProductId)?.length ?? 0;
        const required = startInGroupIndex + changes.length;
        const appendCount = Math.max(0, required - currentCount);
        if (appendCount > 0) {
          const groupEndIndex =
            rowMeta.groupEndIndexByProduct.get(anchorProductId) ?? -1;
          const anchorRowForNew =
            groupEndIndex >= 0 && groupEndIndex < workingRows.length
              ? workingRows[groupEndIndex]
              : anchorMeta?.absIndex != null
              ? workingRows[anchorMeta.absIndex]
              : null;
          if (anchorRowForNew) {
            const inserted = Array.from({ length: appendCount }, () =>
              createRowForProduct(anchorRowForNew)
            );
            workingRows = [
              ...workingRows.slice(0, groupEndIndex + 1),
              ...inserted,
              ...workingRows.slice(groupEndIndex + 1),
            ];
            rowMeta = buildRowMeta(workingRows);
            const groupRowIds = rowMeta.groupRowIds.get(anchorProductId) ?? [];
            const appendedRowIds = groupRowIds.slice(
              currentCount,
              currentCount + appendCount
            );
            structuralMeta = {
              type: "appendRowsInGroup",
              productId: anchorProductId,
              rowIds: appendedRowIds,
            };
            if (rgDebug) {
              pushEvent({
                t: Date.now(),
                type: "rows.append",
                productId: anchorProductId,
                count: appendCount,
                rowIds: appendedRowIds.map((id) => String(id)),
              });
            }
          }
        }
        const groupRowIds = rowMeta.groupRowIds.get(anchorProductId) ?? [];
        const remapped = changes.map((change, idx) => {
          const targetRowId = groupRowIds[startInGroupIndex + idx];
          return targetRowId ? { ...change, rowId: targetRowId } : change;
        });
        changesForPipeline = remapped;
        if (rgDebug) {
          pushEvent({
            t: Date.now(),
            type: "cellsChanged.filtered",
            stage: "groupRemap",
            before: changes.length,
            after: remapped.length,
          });
        }
      }
      if (rgDebug) {
        // eslint-disable-next-line no-console
        pushEvent({
          t: Date.now(),
          type: "cellsChanged.raw",
          count: changes.length,
          focus: focusLocationRef.current
            ? {
                rowId: focusLocationRef.current.rowId,
                columnId: focusLocationRef.current.columnId,
              }
            : null,
          selection: summarizeSelection(selectionRef.current),
          sample: changes.slice(0, 10).map((change) => ({
            rowId: change.rowId,
            colId: change.columnId,
            groupId: rowMeta.rowMetaById.get(change.rowId)?.productId ?? null,
            prev:
              (change as any).previousCell?.text ??
              (change as any).previousCell?.value ??
              null,
            next:
              (change as any).newCell?.text ??
              (change as any).newCell?.value ??
              null,
            typePrev: (change as any).previousCell?.type,
            typeNext: (change as any).newCell?.type,
          })),
        });
      }
      if (anchorProductId == null && changesForPipeline.length > 1) {
        notifications.show({
          color: "yellow",
          title: "Paste clipped",
          message: "Paste exceeds group bounds; clipped to one group.",
        });
        if (rgDebug) {
          pushEvent({
            t: Date.now(),
            type: "error",
            message: "Paste blocked: unknown anchor group.",
          });
        }
        return;
      }
      let droppedOutOfGroup = 0;
      let droppedUnknownRow = 0;
      const droppedSamples: Array<{ rowId: Id; columnId: Id; reason: string }> =
        [];
      const filteredChanges: CellChange[] = [];
      for (const change of changesForPipeline) {
        const meta = rowMeta.rowMetaById.get(change.rowId);
        if (!meta) {
          droppedUnknownRow += 1;
          if (droppedSamples.length < 10) {
            droppedSamples.push({
              rowId: change.rowId,
              columnId: change.columnId,
              reason: "unknownRow",
            });
          }
          continue;
        }
        const rowProductId =
          meta.productId ?? parseProductIdFromRowId(change.rowId);
        if (anchorProductId != null && rowProductId !== anchorProductId) {
          droppedOutOfGroup += 1;
          if (droppedSamples.length < 10) {
            droppedSamples.push({
              rowId: change.rowId,
              columnId: change.columnId,
              reason: "outOfGroup",
            });
          }
          continue;
        }
        filteredChanges.push(change);
      }
      if (anchorProductId != null && droppedOutOfGroup > 0) {
        notifications.show({
          color: "yellow",
          title: "Paste clipped",
          message: "Paste exceeds group bounds; clipped to one group.",
        });
        if (rgDebug) {
          // eslint-disable-next-line no-console
          pushEvent({
            t: Date.now(),
            type: "cellsChanged.filtered",
            stage: "clip",
            before: changesForPipeline.length,
            after: filteredChanges.length,
            dropped: { droppedOutOfGroup, droppedUnknownRow },
          });
        }
      }
      if (rgDebug) {
        pushEvent({
          t: Date.now(),
          type: "cellsChanged.filtered",
          stage: "clip.summary",
          before: changesForPipeline.length,
          after: filteredChanges.length,
          dropped: { droppedOutOfGroup, droppedUnknownRow, samples: droppedSamples },
        });
      }
      const resolvedFilteredChanges = filteredChanges
        .map((change) => ({
          change,
          absIndex: rowMeta.rowMetaById.get(change.rowId)?.absIndex ?? null,
        }))
        .filter((item) => item.absIndex != null);
      const groupEndIndex =
        anchorProductId != null
          ? rowMeta.groupEndIndexByProduct.get(anchorProductId) ?? -1
          : -1;
      const anchorRow =
        anchorMeta?.absIndex != null
          ? workingRows[anchorMeta.absIndex]
          : null;
      const prototypeRow = anchorRow ? createRowForProduct(anchorRow) : null;
      const shouldApplyChange = (
        change: CellChange,
        rowIndex: number | null,
        row: ProductBomsSheetRow | null
      ) => {
        if (rowIndex == null) return false;
        const key = String(change.columnId);
        if (key === "__rownum") return false;
        const def = columnDefsByKey.get(key);
        const isApplicable =
          def?.editable !== false && def?.key !== "product" && def?.key !== "id";
        const isUserEditable =
          EDITABLE_COLUMNS.has(key) && isApplicable;
        const newCell = change.newCell as any;
        if (!isUserEditable || newCell?.nonEditable) return false;
        if (!row && !prototypeRow) return false;
        return true;
      };
      let maxTargetRowIndex = -1;
      for (const item of resolvedFilteredChanges) {
        if (
          !shouldApplyChange(
            item.change,
            item.absIndex as number,
            (item.absIndex as number) < workingRows.length
              ? workingRows[item.absIndex as number]
              : prototypeRow
          )
        ) {
          continue;
        }
        if ((item.absIndex as number) > maxTargetRowIndex) {
          maxTargetRowIndex = item.absIndex as number;
        }
      }
      const growthNeeded =
        groupEndIndex >= 0 && maxTargetRowIndex > groupEndIndex;
      const allowGrowth =
        growthNeeded && anchorProductId != null && !!anchorRow;
      let growthAppendedCount = 0;
      if (allowGrowth) {
        const required = maxTargetRowIndex - groupEndIndex;
        growthAppendedCount = required;
        const inserted = Array.from({ length: required }, () =>
          createRowForProduct(anchorRow as ProductBomsSheetRow)
        );
        workingRows = [
          ...workingRows.slice(0, groupEndIndex + 1),
          ...inserted,
          ...workingRows.slice(groupEndIndex + 1),
        ];
        rowMeta = buildRowMeta(workingRows);
        if (rgDebug) {
          pushEvent({
            t: Date.now(),
            type: "rows.append",
            productId: anchorProductId ?? 0,
            count: required,
            rowIds: [],
          });
        }
      } else if (growthNeeded) {
        notifications.show({
          color: "yellow",
          title: "Paste clipped",
          message: "Paste exceeds group bounds; rows were not added.",
        });
        if (rgDebug) {
          pushEvent({
            t: Date.now(),
            type: "error",
            message: "Paste clipped: rows not added due to group bounds.",
          });
        }
      }

      const postRowIds = workingRows.map((row, idx) => getRowId(row, idx));
      const mappedChanges: CellChange[] = [];
      let droppedNonEditable = 0;
      let droppedUnknownCol = 0;
      for (const change of filteredChanges) {
        const absIndex = rowMeta.rowMetaById.get(change.rowId)?.absIndex ?? null;
        if (absIndex == null || absIndex < 0 || absIndex >= postRowIds.length) {
          droppedUnknownRow += 1;
          continue;
        }
        const mappedRowId = postRowIds[absIndex];
        const mappedChange =
          mappedRowId === change.rowId
            ? change
            : { ...change, rowId: mappedRowId };
        const row = absIndex < workingRows.length ? workingRows[absIndex] : null;
        const key = String(mappedChange.columnId);
        const def = columnDefsByKey.get(key);
        if (!def && key !== "__rownum") {
          droppedUnknownCol += 1;
        }
        if (!shouldApplyChange(mappedChange, absIndex, row)) {
          droppedNonEditable += 1;
          continue;
        }
        mappedChanges.push(mappedChange);
      }

      const rowIndexByIdLocal = allowGrowth
        ? new Map<Id, number>(
            workingRows.map((row, idx) => [getRowId(row, idx), idx])
          )
        : rowIndexById;
      const valueChanges = mappedChanges
        .filter((change) => change.rowId !== "header")
        .map((change) => {
          const newCell = change.newCell as any;
          const nextValue =
            newCell?.text ?? newCell?.value ?? "";
          return {
            rowId: change.rowId,
            columnId: change.columnId,
            nextValue,
          };
        });
      if (rgDebug) {
        pushEvent({
          t: Date.now(),
          type: "apply.begin",
          changeCount: valueChanges.length,
          source: changes.length > 1 ? "paste" : "edit",
        });
      }
      const result = applyValueChanges(valueChanges, {
        rows: workingRows,
        rowIndexById: rowIndexByIdLocal,
        source: "edit",
      });
      let appliedChanges = result.applied.slice();
      let skuRowIds: string[] = [];
      const skuByRowId = new Map<string, string>();
      let skuRequestId: number | null = null;
      if (result.applied.length) {
        const skuChanges = result.applied.filter(
          (change) => change.colId === "childSku"
        );
        if (skuChanges.length) {
          skuRequestId = (lookupRequestIdRef.current += 1);
          skuRowIds = skuChanges.map((change) => String(change.rowId));
          lastEditedRowIdRef.current = skuRowIds[0] ?? null;
          skuChanges.forEach((change) => {
            skuByRowId.set(String(change.rowId), String(change.nextValue || ""));
          });
          const rowsWithSku = skuChanges.map((change) => ({
            rowId: change.rowId,
            sku: String(change.nextValue || "").trim(),
          }));
          pendingSkuAutofillRef.current.set(skuRequestId, rowsWithSku);
          if (rgDebug) {
            pushEvent({
              t: Date.now(),
              type: "sku.change",
              requestId: skuRequestId,
              rowIds: skuRowIds,
              skus: skuChanges.map((change) => String(change.nextValue || "")),
            });
            // eslint-disable-next-line no-console
            console.info("[BOMs RG] user edit sku", {
              requestId: skuRequestId,
              rows: skuRowIds,
            });
          }
        }
        const clearChanges: Array<{
          rowId: Id;
          columnId: Id;
          nextValue: any;
        }> = [];
        const skuToLookup: string[] = [];
        for (const change of skuChanges) {
          const nextSku = String(change.nextValue || "").trim();
          if (String(change.prevValue || "").trim() !== nextSku) {
            clearChanges.push(
              { rowId: change.rowId, columnId: "childName", nextValue: "" },
              { rowId: change.rowId, columnId: "type", nextValue: "" },
              { rowId: change.rowId, columnId: "supplier", nextValue: "" }
            );
          }
          if (nextSku) skuToLookup.push(nextSku);
        }
        if (clearChanges.length) {
          if (rgDebug) {
            pushEvent({
              t: Date.now(),
              type: "cellsChanged.filtered",
              stage: "sku.clear",
              before: clearChanges.length,
              after: clearChanges.length,
            });
          }
          const cleared = applyValueChanges(clearChanges, {
            rows: result.nextRows ?? workingRows,
            rowIndexById: rowIndexByIdLocal,
            source: "edit",
            allowReadOnly: true,
          });
          if (cleared.applied.length) {
            appliedChanges = appliedChanges.concat(cleared.applied);
          }
        }
        if (skuToLookup.length && skuRequestId != null) {
          enqueueSkuLookup(skuRequestId, skuToLookup);
        }
      }
      if (rgDebug) {
        pushEvent({
          t: Date.now(),
          type: "apply.end",
          applied: appliedChanges.length,
          rejected: valueChanges.length - appliedChanges.length,
          reasons: {
            droppedOutOfGroup,
            droppedUnknownRow,
            droppedUnknownCol,
            droppedNonEditable,
          },
        });
        if (
          changes.length > 1 ||
          droppedNonEditable > 0 ||
          droppedOutOfGroup > 0 ||
          droppedUnknownCol > 0
        ) {
          // eslint-disable-next-line no-console
          console.info("[BOMs RG] apply", {
            incoming: changes.length,
            applied: appliedChanges.length,
            droppedNonEditable,
            droppedOutOfGroup,
            droppedUnknownCol,
          });
        }
      }
      const rowsAfterApply = result.nextRows ?? workingRows;
      if (skuRowIds.length) {
        const metaAfterApply = buildRowMeta(rowsAfterApply);
        skuRowIds.forEach((rowId) => {
          assertSkuNotCleared({
            rowId,
            phase: "after user apply",
            requestId: skuRequestId,
            expectedSku: skuByRowId.get(rowId),
            rowsOverride: rowsAfterApply,
          });
          pushEvent({
            t: Date.now(),
            type: "row.exists.check",
            label: "after user apply",
            rowId,
            exists: metaAfterApply.rowMetaById.has(rowId),
          });
        });
      }
      const applyTrailing = () => {
        const beforeMeta = anchorProductId != null ? buildRowMeta(rowsAfterApply) : null;
        const trailingResult = ensureTrailingBlankRows(rowsAfterApply);
        if (trailingResult.rows.length !== rowsAfterApply.length) {
          commitRowsChange("user.ensureTrailingBlank", trailingResult.rows);
        }
        if (rgDebug && anchorProductId != null && beforeMeta) {
          const beforeCount =
            beforeMeta.groupRowIds.get(anchorProductId)?.length ?? 0;
          const afterCount =
            buildRowMeta(trailingResult.rows).groupRowIds.get(anchorProductId)
              ?.length ?? 0;
          pushEvent({
            t: Date.now(),
            type: "rows.trailingBlank.ensure",
            productId: anchorProductId,
            before: beforeCount,
            after: afterCount,
          });
        }
        if (skuRowIds.length) {
          const metaAfterTrailing = buildRowMeta(trailingResult.rows);
          skuRowIds.forEach((rowId) => {
            const productId = metaAfterTrailing.rowMetaById.get(rowId)?.productId;
            if (productId != null) {
              beforeLookupSnapshotRef.current.set(
                productId,
                snapshotGroup(productId, trailingResult.rows)
              );
            }
            assertSkuNotCleared({
              rowId,
              phase: "after trailing blank",
              requestId: skuRequestId,
              expectedSku: skuByRowId.get(rowId),
              rowsOverride: trailingResult.rows,
            });
            pushEvent({
              t: Date.now(),
              type: "row.exists.check",
              label: "after trailingBlank",
              rowId,
              exists: metaAfterTrailing.rowMetaById.has(rowId),
            });
          });
        }
      };
      const shouldDeferTrailing = mappedChanges.length > 1;
      if (shouldDeferTrailing && typeof window !== "undefined") {
        requestAnimationFrame(applyTrailing);
      } else {
        applyTrailing();
      }
      setChangeStats({
        total: changes.length,
        applied: appliedChanges.length,
        ignored: changes.length - appliedChanges.length,
      });
      if (appliedChanges.length) {
        undoRedo.recordAppliedBatch(appliedChanges, {
          kind: changes.length > 1 ? "paste" : "edit",
          structural: structuralMeta,
          anchor: anchorForMeta,
        });
      }
    },
    [
      applyValueChanges,
      assertSkuNotCleared,
      buildRowMeta,
      EDITABLE_COLUMNS,
      columnDefsByKey,
      commitRowsChange,
      createRowForProduct,
      dataGrid,
      ensureTrailingBlankRows,
      enqueueSkuLookup,
      getRowId,
      rgDebug,
      rowIndexById,
      summarizeSelection,
      undoRedo,
    ]
  );


  const buildClearChanges = useCallback(
    (selectedRanges: any[]) => {
      const locations = collectSelectedCellLocations(selectedRanges);
      const changes: CellChange[] = [];
      for (const location of locations) {
        if (location.rowId === "header") continue;
        if (String(location.columnId) === "__rownum") continue;
        const row = rows[location.rowIdx];
        const previousCell = row?.cells?.[location.colIdx] as any;
        if (!previousCell) continue;
        let newCell = previousCell;
        if (previousCell.type === "axisText" || previousCell.type === "text") {
          newCell = { ...previousCell, text: "" };
        }
        changes.push({
          rowId: location.rowId,
          columnId: location.columnId,
          type: newCell.type,
          previousCell,
          newCell,
        });
      }
      return changes;
    },
    [rows]
  );

  const buildFillDownChanges = useCallback(
    (selectedRanges: any[]) => {
      const changes: CellChange[] = [];
      for (const range of selectedRanges || []) {
        const rangeRows = Array.isArray(range?.rows) ? range.rows : [];
        const rangeColumns = Array.isArray(range?.columns) ? range.columns : [];
        if (rangeRows.length < 2 || !rangeColumns.length) continue;
        const sortedRows = [...rangeRows].sort(
          (a, b) => (a?.idx ?? 0) - (b?.idx ?? 0)
        );
        const sourceRow = sortedRows[0];
        if (!sourceRow || sourceRow.idx <= 0) continue;
        for (const column of rangeColumns) {
          if (column?.idx == null || column.idx <= 0) continue;
          const sourceCell = rows[sourceRow.idx]?.cells?.[column.idx] as any;
          if (!sourceCell) continue;
          for (const row of sortedRows.slice(1)) {
            if (!row || row.idx <= 0) continue;
            const targetCell = rows[row.idx]?.cells?.[column.idx] as any;
            if (!targetCell) continue;
            let newCell = targetCell;
            if (sourceCell.type === "axisText" || sourceCell.type === "text") {
              newCell = { ...targetCell, text: sourceCell.text ?? "" };
            }
            changes.push({
              rowId: row.rowId,
              columnId: column.columnId,
              type: newCell.type,
              previousCell: targetCell,
              newCell,
            });
          }
        }
      }
      return changes;
    },
    [rows]
  );

  const handleContextMenu = useCallback(
    (
      _selectedRowIds: Id[],
      _selectedColIds: Id[],
      _selectionMode: string,
      menuOptions: MenuOption[],
      selectedRanges: any[]
    ) => {
      const options = menuOptions ? [...menuOptions] : [];
      options.push({
        id: "clear-contents",
        label: "Clear contents",
        handler: () => {
          const changes = buildClearChanges(selectedRanges);
          if (changes.length) onCellsChanged(changes);
        },
      });
      options.push({
        id: "fill-down",
        label: "Fill down",
        handler: () => {
          const changes = buildFillDownChanges(selectedRanges);
          if (changes.length) onCellsChanged(changes);
        },
      });
      options.push({
        id: "reset-column-widths",
        label: "Reset column widths",
        handler: () => {
          setColumnWidthOverrides({});
          if (typeof window !== "undefined") {
            try {
              window.localStorage.removeItem(widthStorageKey);
            } catch {
              // ignore
            }
          }
        },
      });
      return options;
    },
    [
      buildClearChanges,
      buildFillDownChanges,
      onCellsChanged,
      widthStorageKey,
    ]
  );

  const handleColumnResized = useCallback(
    (columnId: Id, width: number) => {
      setColumnWidthOverrides((prev) => {
        const next = { ...prev, [String(columnId)]: width };
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(widthStorageKey, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        return next;
      });
    },
    [widthStorageKey]
  );

  const addTestRow = useCallback(() => {
    const next = dataGrid.value.slice();
    const last = next[next.length - 1];
    next.push({
      productId: last?.productId ?? 0,
      productSku: last?.productSku ?? "",
      productName: last?.productName ?? "",
      id: null,
      childSku: "",
      childName: "[TEST ROW]",
      activityUsed: "",
      type: "",
      supplier: "",
      quantity: "",
      groupStart: false,
      disableControls: false,
      __testRow: true,
    } as ProductBomsSheetRow);
    commitRowsChange("test.addRow", next);
  }, [commitRowsChange, dataGrid]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const rowsForSave = dataGrid
        .getValues()
        .filter((row) => !(row as any)?.__testRow);
      if (rgDebug) {
        pushEvent({
          t: Date.now(),
          type: "save.enqueue",
          count: rowsForSave.length,
        });
      }
      const payload = {
        _intent: "products.boms.batchSave",
        rows: rowsForSave,
      };
      const resp = await fetch("/products/boms/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        // eslint-disable-next-line no-alert
        alert("Save failed");
        return;
      }
      navigate("/products?refreshed=1");
    } finally {
      setSaving(false);
    }
  }, [dataGrid, navigate, pushEvent, rgDebug]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset: () => {
        commitRowsChange("form.reset", initialRowsWithBlank);
        undoRedo.clearHistory();
      },
      formState: { isDirty: dataGrid.gridState.isDirty },
    }),
    [commitRowsChange, dataGrid, initialRowsWithBlank, undoRedo]
  );
  useInitGlobalFormContext(formHandlers as any, () => save(), formHandlers.reset);

  const debugPayload = useMemo<DebugExplainPayload | null>(() => {
    const ids = searchParams.get("ids");
    const rowsNow = dataGrid.value;
    const meta = buildRowMeta(rowsNow);
    const editedRowId = lastEditedRowIdRef.current;
    const editedRowSnapshot = editedRowId
      ? captureRowState("editedRow", editedRowId, rowsNow)
      : null;
    const groupTailSnapshot =
      editedRowSnapshot?.productId != null
        ? (meta.groupRowIds.get(editedRowSnapshot.productId) ?? [])
            .slice(-10)
            .map((rowId) =>
              captureRowState("groupTail", String(rowId), rowsNow)
            )
        : null;
    const lastDump =
      typeof window !== "undefined"
        ? (window as any).__BOMS_RG_LAST_DUMP__ ?? null
        : null;
    return {
      context: {
        module: "poLine",
        entity: { type: "bomsSheet", id: ids ?? "batch" },
        generatedAt: new Date().toISOString(),
        version: "boms-sheet-rg",
      },
      inputs: {
        params: { ids },
        flags: listDebug(),
      },
      derived: {
        focus: focusLocationRef.current
          ? {
              rowId: focusLocationRef.current.rowId,
              columnId: focusLocationRef.current.columnId,
            }
          : null,
        selection: summarizeSelection(selectionRef.current),
        editedRowSnapshot,
        groupTailSnapshot,
        events: eventsRef.current,
        lastDump,
        lastWriteViolation:
          lastWriteViolationRef.current ??
          (typeof window !== "undefined"
            ? (window as any).__BOMS_RG_LAST_WRITE__ ?? null
            : null),
        lastWriteTrap:
          lastWriteTrapRef.current ??
          (typeof window !== "undefined"
            ? (window as any).__BOMS_RG_LAST_WRITE_TRAP__ ?? null
            : null),
        lastRevert:
          lastRevertRef.current ??
          (typeof window !== "undefined"
            ? (window as any).__BOMS_RG_LAST_REVERT__ ?? null
            : null),
      },
      reasoning: [],
    } satisfies DebugExplainPayload;
  }, [
    buildRowMeta,
    captureRowState,
    dataGrid.value,
    debugTick,
    searchParams,
    summarizeSelection,
  ]);


  return (
    <SheetShell
      title="Batch Edit BOMs"
      controller={sheetController}
      backTo={exitUrl}
      saveState={saving ? "saving" : "idle"}
      dsgLink="/products/boms/sheet-dsg"
      debugPayload={debugPayload}
      columnPicker={{
        moduleKey: "products",
        viewId: viewSpec.id,
        scope: "index",
        viewSpec,
        rowsForRelevance: dataGrid.value,
        selection: columnSelection,
      }}
      rightExtra={
        <Group gap="xs" wrap="nowrap">
          <Checkbox
            size="xs"
            label="Group paste/fill by product"
            checked={groupByProduct}
            onChange={(e) => setGroupByProduct(e.currentTarget.checked)}
          />
          <Button size="xs" variant="default" onClick={addTestRow}>
            Add test row
          </Button>
        </Group>
      }
      footer={
        <div
          style={{
            padding: "6px 10px",
            borderTop: "1px solid var(--mantine-color-gray-3)",
          }}
        >
          <Group gap="sm">
            <Text size="xs" c="dimmed">
              Changes: {changeStats.total} total / {changeStats.applied} applied
              / {changeStats.ignored} ignored
            </Text>
          </Group>
        </div>
      }
    >
      {(gridHeight) => (
        <SheetFrame gridHeight={gridHeight}>
          {(bodyHeight) => (
            <div
              ref={gridContainerRef}
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                height: bodyHeight,
                overflow: "hidden",
              }}
            >
              <div className="axisReactGridScroller">
                <div
                  className="axisReactGrid"
                  ref={setGridRefs}
                  onPointerMove={handlePointerMove}
                  onPointerLeave={handlePointerLeave}
                  tabIndex={0}
                >
                  {ReactGridComponent ? (
                    <ReactGridComponent
                      rows={rows}
                      columns={columns}
                      customCellTemplates={customCellTemplates}
                      onCellsChanged={onCellsChanged}
                      enableColumnResizeOnAllHeaders
                      stickyTopRows={1}
                      stickyLeftColumns={1}
                      onColumnResized={handleColumnResized}
                      enableRangeSelection
                      enableRowSelection
                      enableColumnSelection
                      enableFillHandle
                      onSelectionChanged={handleSelectionChanged}
                      onFocusLocationChanged={handleFocusLocationChanged}
                      onContextMenu={handleContextMenu}
                    />
                  ) : (
                    <div style={{ padding: 12 }}>Loading grid…</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetFrame>
      )}
    </SheetShell>
  );
}
