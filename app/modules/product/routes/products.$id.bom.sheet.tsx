import { json, redirect } from "@remix-run/node";
import { useLoaderData, useParams } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CellChange,
  Column,
  Id,
  MenuOption,
  ReactGridProps,
  Row,
} from "@silevis/reactgrid";
import { Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useElementSize } from "@mantine/hooks";
import { useInitGlobalFormContext } from "@aa/timber";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { SheetShell } from "~/components/sheets/SheetShell";
import type { SheetController } from "~/components/sheets/SheetController";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { productSpec } from "~/modules/product/spec";
import { prismaBase } from "~/utils/prisma.server";
import { DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";
import { computeSheetColumnWidths } from "~/components/sheets/computeSheetColumnWidths";
import {
  axisHeaderCellTemplate,
  axisSelectCellTemplate,
  axisTextCellTemplate,
  type AxisSelectCell,
  type AxisTextCell,
} from "~/components/sheets/reactGridCells";
import {
  normalizeUsageValue,
  type UsageValue,
} from "~/components/sheets/UsageSelectCell";
import { ProductPickerModal } from "~/modules/product/components/ProductPickerModal";
import { useReactGridHover } from "~/components/sheets/useReactGridHover";
import { collectSelectedCellLocations } from "~/components/sheets/reactGridSelection";
import {
  ensureRowsForCellChanges,
  parseRowIndexFromId,
} from "~/modules/sheets/reactgrid/autoRows";
import { useReactGridUndoRedo } from "~/modules/sheets/reactgrid/useReactGridUndoRedo";

export async function loader({ params }: any) {
  const id = Number(params.id);
  if (!id || Number.isNaN(id)) {
    throw new Response("Invalid product id", { status: 400 });
  }
  // Fetch product BOM lines and child info
  const product = await prismaBase.product.findUnique({
    where: { id },
    include: {
      productLines: {
        select: {
          id: true,
          quantity: true,
          activityUsed: true,
          flagAssemblyOmit: true,
          child: {
            select: {
              id: true,
              sku: true,
              name: true,
              type: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!product) return redirect("/products");
  const rows: BOMRow[] = (product.productLines || []).map((pl: any) => ({
    id: pl.id,
    childSku: pl.child?.sku || "",
    childName: pl.child?.name || "",
    activityUsed: pl.activityUsed || "",
    type: pl.child?.type || "",
    supplier: pl.child?.supplier?.name || "",
    quantity: Number(pl.quantity ?? 0) || 0,
  }));
  const categoryId = product.categoryId ?? null;
  const subCategoryId = product.subCategoryId ?? null;

  return json({
    rows,
    product: {
      id: product.id,
      name: product.name,
      type: product.type,
      categoryId,
      subCategoryId,
    },
  });
}

type BOMRow = {
  id: number | null;
  childSku: string;
  childName: string;
  activityUsed: string;
  type: string;
  supplier: string;
  quantity: number | string;
  disableControls?: boolean;
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

const blankRow = (): BOMRow => ({
  id: null,
  childSku: "",
  childName: "",
  activityUsed: "",
  type: "",
  supplier: "",
  quantity: "",
  disableControls: false,
});

const isBlank = (row: BOMRow) =>
  !row.childSku &&
  !row.childName &&
  !row.activityUsed &&
  (row.quantity === "" || row.quantity == null);

const padRows = (rows: BOMRow[]) => {
  const base = rows.slice();
  if (!base.length || !isBlank(base[base.length - 1])) {
    base.push({ ...blankRow() });
  }
  while (base.length < DEFAULT_MIN_ROWS) {
    base.push({ ...blankRow(), disableControls: true });
  }
  return base;
};

const customCellTemplates = {
  axisHeader: axisHeaderCellTemplate,
  axisText: axisTextCellTemplate,
  axisSelect: axisSelectCellTemplate,
};

const resolveText = (value: unknown) => (value == null ? "" : String(value));

export default function ProductBomRoute() {
  const { rows } = useLoaderData<typeof loader>();
  const params = useParams();
  const productId = Number(params.id);

  const [ReactGridComponent, setReactGridComponent] =
    useState<React.ComponentType<ReactGridProps> | null>(null);
  const [editedRows, setEditedRows] = useState<BOMRow[]>(rows);
  const [refreshOnNextRows, setRefreshOnNextRows] = useState(false);
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
      gridWrapperRef.current = node;
    },
    [hoverGridRef]
  );
  useSheetDirtyPrompt();
  const exitUrl = Number.isFinite(productId)
    ? `/products/${productId}`
    : "/products";
  const originalRef = useRef<BOMRow[]>(rows);
  const viewSpec = productSpec.sheet?.views["detail-bom"];
  if (!viewSpec) {
    throw new Error("Missing product sheet spec: detail-bom");
  }
  const columnSelection = useSheetColumnSelection({
    moduleKey: "products",
    viewId: viewSpec.id,
    scope: "detail",
    viewSpec,
  });

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

  useEffect(() => {
    if (!refreshOnNextRows) return;
    originalRef.current = rows;
    setEditedRows(rows);
    setRefreshOnNextRows(false);
  }, [refreshOnNextRows, rows]);

  type RowLite = {
    id: number | null;
    childSku: string;
    quantity?: any;
    activityUsed?: any;
  };
  const dirty = useMemo(() => {
    const a = (originalRef.current || []) as RowLite[];
    const b = (editedRows || []) as RowLite[];
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      const A = a[i];
      const B = b[i];
      if ((A.id || null) !== (B.id || null)) return true;
      if ((A.childSku || "") !== (B.childSku || "")) return true;
      if (String(A.quantity ?? "") !== String(B.quantity ?? "")) return true;
      if ((A.activityUsed || "") !== (B.activityUsed || "")) return true;
    }
    return false;
  }, [editedRows]);

  const sheetController = useMemo(
    () =>
      ({
        state: { isDirty: dirty },
      } as SheetController<BOMRow>),
    []
  );

  useEffect(() => {
    sheetController.state = { isDirty: dirty };
  }, [dirty, sheetController]);

  const pendingSkusRef = useRef<Set<string>>(new Set());
  const lookupTimerRef = useRef<number | null>(null);
  const enqueueLookup = useCallback((skus: string[]) => {
    skus.filter(Boolean).forEach((s) => pendingSkusRef.current.add(s));
    if (lookupTimerRef.current) window.clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = window.setTimeout(async () => {
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
        setEditedRows((curr) => {
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
          return next;
        });
      } catch {}
    }, 120);
  }, []);

  const displayRows = useMemo(() => {
    const normalized = (editedRows || []).map((row) => ({
      ...row,
      activityUsed: normalizeUsageValue(row.activityUsed),
      disableControls: row.disableControls || false,
    }));
    return padRows(normalized);
  }, [editedRows]);

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
  const [gridActive, setGridActive] = useState(false);
  const gridWrapperRef = useRef<HTMLDivElement | null>(null);

  const widthStorageKey = useMemo(
    () => `axis:sheet-columns-widths:v1:products:${viewSpec.id}:detail`,
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

  const columnMeta = useMemo(() => {
    const byKey = new Map(
      [
        { key: "id", label: "ID", width: 80, resizable: false },
        { key: "childSku", label: "SKU", width: 140, resizable: true },
        { key: "childName", label: "Name", width: 200, resizable: true },
        { key: "activityUsed", label: "Usage", width: 120, resizable: true },
        { key: "type", label: "Type", width: 120, resizable: false },
        { key: "supplier", label: "Supplier", width: 160, resizable: false },
        { key: "quantity", label: "Qty", width: 100, resizable: true },
      ].map((col) => [col.key, col] as const)
    );
    const selectedKeys = columnSelection.selectedKeys?.length
      ? columnSelection.selectedKeys
      : [
          "id",
          "childSku",
          "childName",
          "activityUsed",
          "type",
          "supplier",
          "quantity",
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
      const rowId = row.id != null ? `line:${row.id}` : `row:${rowIndex}`;
      const nonEditableRow = Boolean(row.disableControls);
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
            key === "id" ||
            key === "childName" ||
            key === "type" ||
            key === "supplier";
          const nonEditable = nonEditableRow || isReadOnly;
          if (key === "activityUsed") {
            return {
              type: "axisSelect",
              selectedValue: normalizeUsageValue(row.activityUsed),
              values: usageOptions,
              nonEditable,
              className: nonEditable ? "rg-non-editable" : undefined,
            } as AxisSelectCell;
          }
          return {
            type: "axisText",
            text: resolveText((row as any)[key]),
            nonEditable,
            className: nonEditable ? "rg-non-editable" : undefined,
          } as AxisTextCell;
        }),
      ];
      return { rowId, height: 34, cells };
    });

    return [header, ...dataRows];
  }, [columnMeta, displayRows]);

  const rowIndexById = useMemo(() => {
    const map = new Map<Id, number>();
    displayRows.forEach((row, idx) => {
      const rowId = row.id != null ? `line:${row.id}` : `row:${idx}`;
      map.set(rowId, idx);
    });
    return map;
  }, [displayRows]);

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
        rows?: BOMRow[];
        rowIndexById?: Map<Id, number>;
        source?: "edit" | "undo" | "redo";
      }
    ) => {
      const baseRows = options?.rows ?? displayRows;
      const rowIndexByIdLocal =
        options?.rowIndexById ??
        new Map(
          baseRows.map((row, idx) => [
            row.id != null ? `line:${row.id}` : `row:${idx}`,
            idx,
          ])
        );
      const workingRows = baseRows.map((row) => ({ ...row }));
      const applied: Array<{
        rowId: string;
        colId: string;
        prevValue: any;
        nextValue: any;
      }> = [];
      let skippedCount = 0;
      const editableRowCount = baseRows.filter(
        (row) => !row.disableControls
      ).length;
      for (const change of valueChanges) {
        const rowIndex =
          rowIndexByIdLocal.get(change.rowId) ??
          parseRowIndexFromId(change.rowId);
        if (rowIndex == null || rowIndex >= workingRows.length) {
          skippedCount += 1;
          continue;
        }
        const row = { ...workingRows[rowIndex] };
        const key = String(change.columnId);
        if (key === "__rownum") {
          skippedCount += 1;
          continue;
        }
        const readOnly =
          key === "id" || key === "childName" || key === "type" || key === "supplier";
        const overflow = rowIndex >= editableRowCount;
        if ((row.disableControls && !overflow) || readOnly) {
          skippedCount += 1;
          continue;
        }
        if (row.disableControls && overflow) {
          row.disableControls = false;
        }
        const prevValue = (row as any)[key] ?? "";
        (row as any)[key] = change.nextValue;
        workingRows[rowIndex] = row;
        applied.push({
          rowId: String(change.rowId),
          colId: String(change.columnId),
          prevValue,
          nextValue: change.nextValue,
        });
      }
      setEditedRows(workingRows.filter((row) => !isBlank(row)));
      return { applied, skippedCount };
    },
    [displayRows]
  );

  const undoRedo = useReactGridUndoRedo({
    applyCellChanges: (changes, opts) => {
      const result = applyValueChanges(
        changes.map((change) => ({
          rowId: change.rowId,
          columnId: change.colId,
          nextValue: change.value,
        })),
        { source: opts?.source }
      );
      return {
        appliedCount: result.applied.length,
        skippedCount: result.skippedCount,
      };
    },
    onSkipped: notifySkippedUndoRedo,
  });

  useEffect(() => {
    sheetController.triggerUndo = () => undoRedo.undo("button");
    sheetController.triggerRedo = () => undoRedo.redo("button");
    sheetController.canUndo = undoRedo.canUndo;
    sheetController.canRedo = undoRedo.canRedo;
    sheetController.historyVersion = undoRedo.historyVersion;
  }, [sheetController, undoRedo]);

  useEffect(() => {
    if (!gridActive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const metaKey = isMac ? event.metaKey : event.ctrlKey;
      if (!metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          undoRedo.redo("hotkey");
        } else {
          undoRedo.undo("hotkey");
        }
      } else if (!isMac && key === "y") {
        event.preventDefault();
        undoRedo.redo("hotkey");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gridActive, undoRedo]);

  const onCellsChanged = useCallback(
    (changes: CellChange[]) => {
      if (!changes?.length) return;
      const editableRowCount = displayRows.filter(
        (row) => !row.disableControls
      ).length;
      const shouldApplyChange = (
        change: CellChange,
        rowIndex: number | null,
        row: BOMRow | null
      ) => {
        if (rowIndex == null) return false;
        const key = String(change.columnId);
        if (key === "__rownum") return false;
        const readOnly =
          key === "id" || key === "childName" || key === "type" || key === "supplier";
        if (readOnly) return false;
        const newCell = change.newCell as any;
        if (newCell?.nonEditable) return false;
        const overflow = rowIndex >= editableRowCount;
        if (row?.disableControls && !overflow) return false;
        return true;
      };

      const growth = ensureRowsForCellChanges<BOMRow>({
        changes,
        rows: displayRows,
        rowIndexById,
        resolveRowIndexFromId: parseRowIndexFromId,
        shouldGrowForChange: (change, rowIndex, row) =>
          shouldApplyChange(change, rowIndex, row),
        appendRows: (count) =>
          Array.from({ length: count }, () => ({ ...blankRow() })),
      });
      const workingRows = growth.nextRows.map((row) => ({ ...row }));
      if (growth.didGrow && process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.info("[reactgrid] auto rows appended", growth.addedCount);
      }
      const rowIndexByIdLocal = growth.didGrow
        ? new Map<Id, number>(
            workingRows.map((row, idx) => [
              row.id != null ? `line:${row.id}` : `row:${idx}`,
              idx,
            ])
          )
        : rowIndexById;
      const valueChanges = changes
        .filter((change) => change.rowId !== "header")
        .map((change) => {
          const newCell = change.newCell as any;
          const nextValue =
            newCell?.type === "axisSelect"
              ? newCell.selectedValue ?? ""
              : newCell?.type === "axisText"
              ? newCell.text ?? ""
              : newCell?.text ?? "";
          return {
            rowId: change.rowId,
            columnId: change.columnId,
            nextValue,
          };
        });
      const result = applyValueChanges(valueChanges, {
        rows: workingRows,
        rowIndexById: rowIndexByIdLocal,
        source: "edit",
      });
      if (result.applied.length) {
        const skuChanges = result.applied
          .filter((change) => change.colId === "childSku")
          .map((change) => String(change.nextValue || ""))
          .filter(Boolean);
        if (skuChanges.length) enqueueLookup(skuChanges);
        undoRedo.recordAppliedBatch(result.applied, {
          kind: changes.length > 1 ? "paste" : "edit",
        });
      }
    },
    [applyValueChanges, displayRows, enqueueLookup, rowIndexById, undoRedo]
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
        } else if (previousCell.type === "axisText") {
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
            } else if (sourceCell.type === "axisText") {
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
    if (!Number.isFinite(productId)) return;
    setSaving(true);
    const origById = new Map<number, RowLite>();
    for (const r of originalRef.current as RowLite[])
      if (r.id != null) origById.set(r.id, r);
    const editedById = new Map<number, RowLite>();
    for (const r of editedRows as RowLite[])
      if (r.id != null) editedById.set(r.id, r);

    const deletes: number[] = [];
    for (const [id] of origById) if (!editedById.has(id)) deletes.push(id);

    const updates: Array<{
      id: number;
      quantity?: number;
      activityUsed?: string | null;
    }> = [];
    const creates: Array<{
      childSku: string;
      quantity?: number;
      activityUsed?: string | null;
    }> = [];

    for (const r of editedRows as RowLite[]) {
      if (r.id == null) {
        if (r.childSku) {
          creates.push({
            childSku: r.childSku,
            quantity: r.quantity === "" ? undefined : Number(r.quantity) || 0,
            activityUsed: r.activityUsed ? r.activityUsed : null,
          });
        }
      } else {
        const prev = origById.get(r.id);
        if (!prev) {
          if (r.childSku) {
            creates.push({
              childSku: r.childSku,
              quantity: r.quantity === "" ? undefined : Number(r.quantity) || 0,
              activityUsed: r.activityUsed ? r.activityUsed : null,
            });
          }
          continue;
        }
        if ((prev.childSku || "") !== (r.childSku || "")) {
          deletes.push(r.id);
          if (r.childSku) {
            creates.push({
              childSku: r.childSku,
              quantity: r.quantity === "" ? undefined : Number(r.quantity) || 0,
              activityUsed: r.activityUsed ? r.activityUsed : null,
            });
          }
        } else {
          const qtyChanged =
            String(prev.quantity ?? "") !== String(r.quantity ?? "");
          const usageChanged =
            (prev.activityUsed || "") !== (r.activityUsed || "");
          if (qtyChanged || usageChanged) {
            updates.push({
              id: r.id,
              ...(qtyChanged ? { quantity: Number(r.quantity) || 0 } : {}),
              ...(usageChanged ? { activityUsed: r.activityUsed || null } : {}),
            });
          }
        }
      }
    }

    const payload = {
      _intent: "bom.batch",
      creates,
      updates,
      deletes,
    } as const;
    try {
      const resp = await fetch(`/products/${productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        originalRef.current = editedRows;
        // trigger re-render so dirty recomputes to false
        setEditedRows((r) => [...r]);
        const msg = data?.ok
          ? `Saved: +${data.created || 0} / ~${data.updated || 0} / -${
              data.deleted || 0
            }`
          : `Saved`;
        const unknown = Array.isArray(data?.unknownSkus)
          ? data.unknownSkus.length
          : 0;
        notifications.show({
          color: unknown ? "yellow" : "teal",
          title: unknown ? "Saved with warnings" : "Saved",
          message: unknown
            ? `${msg}. ${unknown} unknown SKU${unknown === 1 ? "" : "s"}.`
            : msg,
        });
      } else {
        notifications.show({
          color: "red",
          title: "Save failed",
          message: "Could not save BOM changes.",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [editedRows, productId]);

  const reset = useCallback(() => {
    // clone to force re-render
    setEditedRows([...(originalRef.current || [])]);
    undoRedo.clearHistory();
  }, []);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset,
      formState: { isDirty: dirty },
    }),
    [dirty, reset]
  );
  useInitGlobalFormContext(formHandlers as any, () => save(), reset);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [assemblyItemOnly, setAssemblyItemOnly] = useState(false);
  const [pickerResults, setPickerResults] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
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
    const h = window.setTimeout(async () => {
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
      } finally {
        if (active) setPickerLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(h);
    };
  }, [pickerSearch, pickerOpen, assemblyItemOnly]);
  useEffect(() => {
    if (!pickerOpen) setPickerLoading(false);
  }, [pickerOpen]);

  return (
    <SheetShell
      title="Bill of Materials Spreadsheet"
      controller={sheetController}
      backTo={exitUrl}
      saveState={saving ? "saving" : "idle"}
      columnPicker={{
        moduleKey: "products",
        viewId: viewSpec.id,
        scope: "detail",
        viewSpec,
        rowsForRelevance: editedRows,
        selection: columnSelection,
      }}
      dsgLink={`/products/${productId}/bom/sheet-dsg`}
    >
      {(bodyHeight) => (
        <SheetFrame gridHeight={bodyHeight}>
          {(gridHeight) => (
            <div
              ref={gridContainerRef}
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                height: gridHeight,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Group justify="space-between" align="center" mb={8}>
                <Text fw={600}>Bill of Materials</Text>
                <Button size="xs" variant="light" onClick={() => setPickerOpen(true)}>
                  Add Component
                </Button>
              </Group>
              <div style={{ flex: "1 1 auto", minHeight: 0 }}>
                <div className="axisReactGridScroller">
                  <div
                    className="axisReactGrid"
                    ref={setGridRefs}
                    onPointerMove={handlePointerMove}
                    onPointerLeave={handlePointerLeave}
                    onPointerDown={() => {
                      setGridActive(true);
                      gridWrapperRef.current?.focus();
                    }}
                    onFocus={() => setGridActive(true)}
                    onBlur={() => setGridActive(false)}
                    tabIndex={0}
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
            </div>
          )}
        </SheetFrame>
      )}
      <ProductPickerModal
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        searchValue={pickerSearch}
        onSearchChange={setPickerSearch}
        assemblyItemOnly={assemblyItemOnly}
        onAssemblyItemOnlyChange={setAssemblyItemOnly}
        results={pickerResults}
        loading={pickerLoading}
        onSelect={(p: any) => {
          setEditedRows((curr) => [
            ...curr,
            {
              id: null,
              childSku: p.sku || "",
              childName: p.name || "",
              activityUsed: "",
              type: (p.type as string) || "",
              supplier: (p?.supplier?.name as string) || "",
              quantity: "",
              disableControls: false,
            },
          ]);
          setPickerOpen(false);
        }}
      />
    </SheetShell>
  );
}
