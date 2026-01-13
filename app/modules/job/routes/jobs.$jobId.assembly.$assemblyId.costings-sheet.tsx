export { loader, action } from "./jobs.$jobId.assembly.$assemblyId.costings-sheet-dsg";

import { useLoaderData, useNavigate } from "@remix-run/react";
import type {
  CellChange,
  Column,
  Id,
  MenuOption,
  ReactGridProps,
  Row,
} from "@silevis/reactgrid";
import { useElementSize } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInitGlobalFormContext } from "@aa/timber";
import { SheetShell } from "~/components/sheets/SheetShell";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";
import { padRowsWithDisableControls } from "~/components/sheets/disableControls";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { adaptRdgController } from "~/components/sheets/SheetController";
import {
  axisHeaderCellTemplate,
  axisSelectCellTemplate,
  axisSkuCellTemplate,
  axisTextCellTemplate,
  type AxisSelectCell,
  type AxisSkuCell,
  type AxisTextCell,
} from "~/components/sheets/reactGridCells";
import { computeSheetColumnWidths } from "~/components/sheets/computeSheetColumnWidths";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { jobSpec } from "~/modules/job/spec";
import { normalizeUsageValue, type UsageValue } from "~/components/sheets/UsageSelectCell";
import { withGroupTrailingBlank } from "~/components/sheets/groupRows";
import {
  ProductPickerModal,
  type ProductPickerItem,
} from "~/modules/product/components/ProductPickerModal";
import {
  lookupProductsBySkus,
  type ProductLookupInfo,
} from "~/modules/product/utils/productLookup.client";
import { useReactGridHover } from "~/components/sheets/useReactGridHover";
import { collectSelectedCellLocations } from "~/components/sheets/reactGridSelection";
import * as RDG from "react-datasheet-grid";

export type CostingEditRow = {
  id: number | null; // costing id
  assemblyId: number | null;
  assemblyName: string;
  productId: number | null;
  productSku: string;
  productName: string;
  activityUsed: string;
  externalStepType?: string | null;
  quantityPerUnit: number | string;
  unitCost: number | string;
  required: number | string;
  groupStart?: boolean;
  isGroupPad?: boolean;
  disableControls?: boolean;
  localKey: string;
};

let localKeyCounter = 0;
const nextLocalKey = () => {
  localKeyCounter += 1;
  return `costing-${Date.now().toString(36)}-${localKeyCounter}`;
};

const blankCostingRow = (): CostingEditRow => ({
  id: null,
  assemblyId: null,
  assemblyName: "",
  productId: null,
  productSku: "",
  productName: "",
  activityUsed: "",
  externalStepType: null,
  quantityPerUnit: "",
  unitCost: "",
  required: "",
  groupStart: false,
  isGroupPad: false,
  disableControls: false,
  localKey: nextLocalKey(),
});

const toNumberOrNull = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

type LoaderData = {
  rows: CostingEditRow[];
  exitUrl: string;
  actionPath: string;
};

const usageOptions: { label: string; value: UsageValue }[] = [
  { label: "", value: "" },
  { label: "Cut", value: "cut" },
  { label: "Sew", value: "sew" },
  { label: "Finish", value: "finish" },
  { label: "Make", value: "make" },
  { label: "Wash", value: "wash" },
  { label: "Embroidery", value: "embroidery" },
  { label: "Dye", value: "dye" },
];

const customCellTemplates = {
  axisHeader: axisHeaderCellTemplate,
  axisText: axisTextCellTemplate,
  axisSelect: axisSelectCellTemplate,
  axisSku: axisSkuCellTemplate,
};

export default function CostingsSheetRoute() {
  const { rows: initialRows, exitUrl, actionPath } =
    useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [ReactGridComponent, setReactGridComponent] =
    useState<React.ComponentType<ReactGridProps> | null>(null);
  const { ref: gridContainerRef, width: gridContainerWidth } =
    useElementSize();
  const {
    gridRef: hoverGridRef,
    handlePointerMove,
    handlePointerLeave,
  } = useReactGridHover();

  const controller = RDG.useDataSheetController<CostingEditRow>(
    (initialRows || []).slice().sort((a, b) => {
      const aa = (a.assemblyId ?? 0) - (b.assemblyId ?? 0);
      if (aa !== 0) return aa;
      const pa = (a.productId ?? 0) - (b.productId ?? 0);
      if (pa !== 0) return pa;
      return (a.id ?? 0) - (b.id ?? 0);
    }),
    { sanitize: (list) => list.slice(), historyLimit: 200 }
  );
  const sheetController = adaptRdgController(controller);
  const rows = controller.value;
  const setRows = controller.setValue;
  const viewSpec = jobSpec.sheet?.views["assembly-costings"];
  if (!viewSpec) {
    throw new Error("Missing job sheet spec: assembly-costings");
  }
  const columnSelection = useSheetColumnSelection({
    moduleKey: "jobs",
    viewId: viewSpec.id,
    scope: "assembly",
    viewSpec,
  });

  useSheetDirtyPrompt();
  const prevRowsRef = useRef<CostingEditRow[]>([]);

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

  const isRowMeaningful = useCallback(
    (row: CostingEditRow | null | undefined) => {
      if (!row) return false;
      if (row.id != null) return true;
      const sku = (row.productSku || "").trim();
      const name = (row.productName || "").trim();
      const activity = (row.activityUsed || "").trim();
      const hasQty = !(
        row.quantityPerUnit === "" ||
        row.quantityPerUnit === null ||
        row.quantityPerUnit === undefined
      );
      return Boolean(sku || name || activity || hasQty);
    },
    []
  );

  const normalizeEditableRows = useCallback(
    (list: CostingEditRow[]) => {
      const cleaned: CostingEditRow[] = [];
      (list || []).forEach((row) => {
        if (!row) return;
        const normalized: CostingEditRow = {
          ...row,
          id: toNumberOrNull(row.id),
          assemblyId: toNumberOrNull(row.assemblyId),
          groupStart: undefined,
          isGroupPad: false,
          productId: toNumberOrNull(row.productId),
          productName:
            typeof row.productName === "string" ? row.productName : "",
          productSku:
            typeof row.productSku === "string" ? row.productSku.trim() : "",
          localKey: row.localKey || nextLocalKey(),
          activityUsed: normalizeUsageValue(row.activityUsed),
          externalStepType: row.externalStepType ?? null,
        };
        if (!normalized.productSku) normalized.productSku = "";
        if (!isRowMeaningful(normalized)) {
          return;
        }
        cleaned.push(normalized);
      });
      return cleaned;
    },
    [isRowMeaningful]
  );

  useEffect(() => {
    if (!rows.length || prevRowsRef.current.length) return;
    prevRowsRef.current = normalizeEditableRows(rows);
  }, [rows, normalizeEditableRows]);

  const markBlocks = useCallback((list: CostingEditRow[]) => {
    const keyFor = (row: CostingEditRow, index: number) => {
      if (row.assemblyId != null) return `assembly-${row.assemblyId}`;
      if (row.id != null) return `row-${row.id}`;
      return `idx-${index}`;
    };
    const out: CostingEditRow[] = [];
    let i = 0;
    while (i < list.length) {
      const key = keyFor(list[i], i);
      let j = i;
      let first = true;
      while (j < list.length && keyFor(list[j], j) === key) {
        out.push({ ...list[j], groupStart: first });
        first = false;
        j++;
      }
      i = j;
    }
    return out;
  }, []);

  const normalizeSkuKey = useCallback(
    (sku: string) => sku.trim().toLowerCase(),
    []
  );
  const pendingSkusRef = useRef<Map<string, string>>(new Map());
  const lookupTimerRef = useRef<number | null>(null);

  const applyLookupResults = useCallback(
    (map: Map<string, ProductLookupInfo>) => {
      if (!map.size) return;
      const curr = controller.getValue();
      let dirty = false;
      const next = curr.map((row) => {
        const sku = String(row.productSku || "").trim();
        if (!sku) return row;
        const info =
          map.get(normalizeSkuKey(sku)) ||
          map.get(sku) ||
          map.get(sku.toUpperCase());
        if (!info) return row;
        const nextRow = {
          ...row,
          productName: info.name || "",
          productId:
            typeof info.id === "number"
              ? info.id
              : info.id == null
              ? row.productId ?? null
              : Number(info.id) || row.productId || null,
        } as CostingEditRow;
        if (
          nextRow.productName === row.productName &&
          nextRow.productId === row.productId
        ) {
          return row;
        }
        dirty = true;
        return nextRow;
      });
      if (!dirty) return;
      controller.setValue(next);
      const normalized = normalizeEditableRows(next as CostingEditRow[]);
      prevRowsRef.current = normalized;
    },
    [controller, normalizeEditableRows, normalizeSkuKey]
  );

  const enqueueLookup = useCallback(
    (skus: string[]) => {
      (skus || []).forEach((raw) => {
        const trimmed = String(raw || "").trim();
        if (!trimmed) return;
        const key = normalizeSkuKey(trimmed);
        pendingSkusRef.current.set(key, trimmed);
      });
      if (!pendingSkusRef.current.size) return;
      if (lookupTimerRef.current) window.clearTimeout(lookupTimerRef.current);
      lookupTimerRef.current = window.setTimeout(async () => {
        const nextBatch = Array.from(pendingSkusRef.current.values());
        pendingSkusRef.current.clear();
        if (!nextBatch.length) return;
        try {
          const map = await lookupProductsBySkus(nextBatch);
          applyLookupResults(map);
        } catch {
          // ignore network errors
        } finally {
          lookupTimerRef.current = null;
        }
      }, 160);
    },
    [applyLookupResults, normalizeSkuKey]
  );

  const processNormalizedRows = useCallback(
    (normalized: CostingEditRow[]) => {
      const prevMap = new Map(
        prevRowsRef.current.map((row) => [row.localKey, row])
      );
      const toLookup: string[] = [];
      const cleaned = normalized.map((row) => {
        const sku = String(row.productSku || "").trim();
        const prev = prevMap.get(row.localKey);
        const prevSku = prev ? String(prev.productSku || "").trim() : "";
        const normalizedRow: CostingEditRow = {
          ...row,
          productSku: sku,
        };
        if (!sku) {
          normalizedRow.productId = null;
          normalizedRow.productName = "";
          return normalizedRow;
        }
        if (normalizeSkuKey(sku) !== normalizeSkuKey(prevSku)) {
          normalizedRow.productId = null;
          normalizedRow.productName = "";
          toLookup.push(sku);
        }
        return normalizedRow;
      });
      if (toLookup.length) enqueueLookup(toLookup);
      prevRowsRef.current = cleaned;
      setRows(markBlocks(cleaned));
    },
    [enqueueLookup, markBlocks, normalizeSkuKey, setRows]
  );

  const pickerTargetKeyRef = useRef<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<ProductPickerItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerAssemblyOnly, setPickerAssemblyOnly] = useState(false);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerResults([]);
    pickerTargetKeyRef.current = null;
  }, []);

  const openPickerForRow = useCallback((row: CostingEditRow | null) => {
    if (!row) return;
    if (!row.localKey) row.localKey = nextLocalKey();
    const targetKey = row.localKey;
    pickerTargetKeyRef.current = targetKey;
    setPickerSearch(row.productSku || "");
    setPickerOpen(true);
  }, []);

  const handlePickerSelect = useCallback(
    (product: ProductPickerItem) => {
      if (!pickerTargetKeyRef.current) return;
      const curr = controller.getValue();
      const next = curr.map((row) => {
        if (row.localKey !== pickerTargetKeyRef.current) return row;
        return {
          ...row,
          productId: product.id ?? null,
          productSku: product.sku || "",
          productName: product.name || "",
        } as CostingEditRow;
      });
      controller.setValue(next);
      const normalized = normalizeEditableRows(next as CostingEditRow[]);
      prevRowsRef.current = normalized;
      closePicker();
    },
    [closePicker, controller, normalizeEditableRows]
  );

  useEffect(() => {
    let active = true;
    const q = pickerSearch.trim();
    if (!pickerOpen) return;
    if (!q) {
      setPickerResults([]);
      setPickerLoading(false);
      return;
    }
    setPickerLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const url = new URL(`/api/products/lookup`, window.location.origin);
        url.searchParams.set("q", q);
        const resp = await fetch(url.toString());
        const data = await resp.json().catch(() => ({ products: [] }));
        if (!active) return;
        let arr: ProductPickerItem[] = Array.isArray(data?.products)
          ? (data.products as ProductPickerItem[])
          : [];
        if (pickerAssemblyOnly) {
          arr = arr.filter((p) => (p?._count?.productLines ?? 0) === 0);
        }
        setPickerResults(arr);
      } catch {
        if (active) setPickerResults([]);
      } finally {
        if (active) setPickerLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [pickerOpen, pickerSearch, pickerAssemblyOnly]);

  useEffect(() => {
    setRows(markBlocks(rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columnMeta = useMemo(() => {
    const byKey = new Map(
      [
        { key: "assemblyName", label: "Assembly", width: 180, resizable: true },
        { key: "productSku", label: "SKU", width: 150, resizable: true },
        { key: "productName", label: "Name", width: 220, resizable: true },
        { key: "activityUsed", label: "Usage", width: 130, resizable: true },
        { key: "quantityPerUnit", label: "Qty/Unit", width: 120, resizable: true },
        { key: "unitCost", label: "Unit Cost", width: 120, resizable: true },
      ].map((col) => [col.key, col] as const)
    );
    const selectedKeys = columnSelection.selectedKeys?.length
      ? columnSelection.selectedKeys
      : [
          "assemblyName",
          "productSku",
          "productName",
          "activityUsed",
          "quantityPerUnit",
          "unitCost",
        ];
    return selectedKeys
      .map((key) => byKey.get(String(key)))
      .filter(Boolean) as Array<{
      key: string;
      label: string;
      width: number;
      resizable: boolean;
    }>;
  }, [columnSelection.selectedKeys]);

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

  const [columnWidthOverrides, setColumnWidthOverrides] = useState<
    Record<string, number>
  >({});

  const widthStorageKey = useMemo(
    () => `axis:sheet-columns-widths:v1:jobs:${viewSpec.id}:assembly`,
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
      ...columnMeta.map((def) => ({
        columnId: def.key,
        width: columnWidthOverrides[def.key] ?? widthByKey[def.key] ?? def.width,
        resizable: def.resizable,
      })),
    ];
  }, [columnMeta, columnWidthOverrides, widthByKey]);

  const groupedRows = useMemo(() => {
    return withGroupTrailingBlank(
      rows,
      (row) => row.assemblyId ?? row.id,
      ({ template }) => {
        if (!template?.assemblyId) return null;
        return {
          ...blankCostingRow(),
          assemblyId: template.assemblyId,
          assemblyName: template.assemblyName,
          isGroupPad: true,
        };
      }
    );
  }, [rows]);

  const displayRows = useMemo(() => {
    return padRowsWithDisableControls(
      groupedRows,
      DEFAULT_MIN_ROWS,
      () => ({ ...blankCostingRow() }),
      { extraInteractiveRows: 0 }
    );
  }, [groupedRows]);

  const rowsForGrid = useMemo<Row[]>(() => {
    const header: Row = {
      rowId: "header",
      height: 34,
      cells: [
        {
          type: "axisHeader",
          text: "#",
          className: "rg-header-cell rg-rownum-cell",
        },
        ...columnMeta.map((col) => ({
          type: "axisHeader",
          text: col.label,
          className: "rg-header-cell",
        })),
      ],
    };

    const dataRows: Row[] = displayRows.map((row, rowIndex) => {
      const rowId = row.localKey || row.id || `row:${rowIndex}`;
      const rowDisabled = Boolean(row.disableControls || row.isGroupPad);
      const cells = [
        {
          type: "axisText",
          text: String(rowIndex + 1),
          nonEditable: true,
          className: "rg-rownum-cell rg-non-editable",
        } as AxisTextCell,
        ...columnMeta.map((col) => {
          const key = col.key;
          const isReadOnly =
            key === "assemblyName" ||
            key === "productName" ||
            key === "unitCost";
          const isExternal =
            key === "activityUsed" && Boolean(row.externalStepType);
          const nonEditable = rowDisabled || isReadOnly || isExternal;
          if (key === "productSku") {
            return {
              type: "axisSku",
              text: row.productSku || "",
              nonEditable,
              showLookup: !row.productId && !rowDisabled,
              onLookup: () => openPickerForRow(row),
              className: nonEditable ? "rg-non-editable" : undefined,
            } as AxisSkuCell;
          }
          if (key === "activityUsed") {
            return {
              type: "axisSelect",
              selectedValue: normalizeUsageValue(row.activityUsed),
              values: usageOptions,
              nonEditable,
              className: nonEditable ? "rg-non-editable" : undefined,
            } as AxisSelectCell;
          }
          let value: string | number = "";
          if (key === "assemblyName") {
            value = row.groupStart ? row.assemblyName || row.assemblyId || "" : "";
          } else {
            value = (row as any)[key] ?? "";
          }
          return {
            type: "axisText",
            text: String(value ?? ""),
            nonEditable,
            className: nonEditable ? "rg-non-editable" : undefined,
          } as AxisTextCell;
        }),
      ];
      return { rowId, height: 34, cells };
    });

    return [header, ...dataRows];
  }, [columnMeta, displayRows, openPickerForRow]);

  const rowIndexById = useMemo(() => {
    const map = new Map<Id, number>();
    displayRows.forEach((row, idx) => {
      const rowId = row.localKey || row.id || `row:${idx}`;
      map.set(rowId, idx);
    });
    return map;
  }, [displayRows]);

  const onCellsChanged = useCallback(
    (changes: CellChange[]) => {
      if (!changes?.length) return;
      const nextRows = displayRows.map((row) => ({ ...row }));
      const ignored: Array<{ rowId: Id; columnId: Id; reason: string }> = [];
      for (const change of changes) {
        if (change.rowId === "header") continue;
        const rowIndex = rowIndexById.get(change.rowId);
        if (rowIndex == null) continue;
        const row = { ...nextRows[rowIndex] };
        const key = String(change.columnId);
        if (key === "__rownum") {
          ignored.push({
            rowId: change.rowId,
            columnId: change.columnId,
            reason: "Read-only column",
          });
          continue;
        }
        const readOnly =
          key === "assemblyName" || key === "productName" || key === "unitCost";
        const isExternal =
          key === "activityUsed" && Boolean(row.externalStepType);
        const rowDisabled = Boolean(row.disableControls || row.isGroupPad);
        if (rowDisabled || readOnly || isExternal) {
          ignored.push({
            rowId: change.rowId,
            columnId: change.columnId,
            reason: readOnly
              ? "Read-only column"
              : rowDisabled
              ? "Non-editable row"
              : "External-step costings are locked",
          });
          continue;
        }
        const newCell = change.newCell as any;
        const nextValue =
          newCell?.type === "axisSelect"
            ? newCell.selectedValue ?? ""
            : newCell?.type === "axisSku"
            ? newCell.text ?? ""
            : newCell?.type === "axisText"
            ? newCell.text ?? ""
            : newCell?.text ?? "";
        (row as any)[key] = nextValue;
        nextRows[rowIndex] = row;
      }
      if (ignored.length && process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.info("[reactgrid] ignored cell changes", ignored);
      }
      const normalized = normalizeEditableRows(nextRows as CostingEditRow[]);
      processNormalizedRows(normalized);
    },
    [displayRows, normalizeEditableRows, processNormalizedRows, rowIndexById]
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

  const buildClearChanges = useCallback(
    (selectedRanges: any[]) => {
      const locations = collectSelectedCellLocations(selectedRanges);
      const changes: CellChange[] = [];
      for (const location of locations) {
        if (location.rowId === "header") continue;
        if (String(location.columnId) === "__rownum") continue;
        const row = rowsForGrid[location.rowIdx];
        const previousCell = row?.cells?.[location.colIdx] as any;
        if (!previousCell) continue;
        let newCell = previousCell;
        if (previousCell.type === "axisSelect") {
          newCell = { ...previousCell, selectedValue: "", displayText: "" };
        } else if (
          previousCell.type === "axisText" ||
          previousCell.type === "axisSku"
        ) {
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
    [rowsForGrid]
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
          const sourceCell = rowsForGrid[sourceRow.idx]?.cells?.[column.idx] as any;
          if (!sourceCell) continue;
          for (const row of sortedRows.slice(1)) {
            if (!row || row.idx <= 0) continue;
            const targetCell = rowsForGrid[row.idx]?.cells?.[column.idx] as any;
            if (!targetCell) continue;
            let newCell = targetCell;
            if (sourceCell.type === "axisSelect") {
              newCell = {
                ...targetCell,
                selectedValue: sourceCell.selectedValue ?? "",
                displayText: sourceCell.displayText ?? "",
              };
            } else if (
              sourceCell.type === "axisText" ||
              sourceCell.type === "axisSku"
            ) {
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
    [rowsForGrid]
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

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const payload = { _intent: "costings.batchSave", rows };
      const resp = await fetch(actionPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        // eslint-disable-next-line no-alert
        alert("Save failed");
        return;
      }
      const data = await resp.json().catch(() => null);
      if (Array.isArray(data?.unknownSkus) && data.unknownSkus.length) {
        // eslint-disable-next-line no-alert
        alert(
          `Unknown SKU${
            data.unknownSkus.length === 1 ? "" : "s"
          }: ${data.unknownSkus.join(", ")}`
        );
        return;
      }
      navigate(exitUrl);
    } finally {
      setSaving(false);
    }
  }, [rows, actionPath, navigate, exitUrl]);

  const resetRows = useCallback(() => {
    controller.reset(initialRows || []);
    prevRowsRef.current = normalizeEditableRows(initialRows || []);
  }, [controller, initialRows, normalizeEditableRows]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset: () => resetRows(),
      formState: { isDirty: controller.state.isDirty },
    }),
    [controller.state.isDirty, resetRows]
  );
  useInitGlobalFormContext(
    formHandlers as any,
    () => save(),
    () => resetRows()
  );

  return (
    <>
      <SheetShell
        title="Batch Edit Costings"
        controller={sheetController}
        backTo={exitUrl}
        saveState={saving ? "saving" : "idle"}
        columnPicker={{
          moduleKey: "jobs",
          viewId: viewSpec.id,
          scope: "assembly",
          viewSpec,
          rowsForRelevance: rows,
          selection: columnSelection,
        }}
        dsgLink={actionPath.replace(
          "/costings-sheet",
          "/costings-sheet-dsg"
        )}
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
                    ref={hoverGridRef}
                    onPointerMove={handlePointerMove}
                    onPointerLeave={handlePointerLeave}
                  >
                    {ReactGridComponent ? (
                      <ReactGridComponent
                        rows={rowsForGrid}
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
      <ProductPickerModal
        opened={pickerOpen}
        onClose={closePicker}
        title="Select Product"
        searchValue={pickerSearch}
        onSearchChange={setPickerSearch}
        results={pickerResults}
        loading={pickerLoading}
        assemblyItemOnly={pickerAssemblyOnly}
        onAssemblyItemOnlyChange={setPickerAssemblyOnly}
        onSelect={handlePickerSelect}
      />
    </>
  );
}
