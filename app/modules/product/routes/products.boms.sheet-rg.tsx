import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import type {
  CellChange,
  Column,
  Id,
  MenuOption,
  ReactGridProps,
  Row,
} from "@silevis/reactgrid";
import { Button, Checkbox, Group, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { useInitGlobalFormContext } from "@aa/timber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import { SheetShell } from "~/components/sheets/SheetShell";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { useDataGrid } from "~/components/sheets/useDataGrid";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { adaptDataGridController } from "~/components/sheets/SheetController";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
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
  const [gridActive, setGridActive] = useState(false);
  const gridWrapperRef = useRef<HTMLDivElement | null>(null);
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
      gridWrapperRef.current = node;
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

  const dataGrid = useDataGrid<ProductBomsSheetRow>({
    initialData: (initialRows || []) as ProductBomsSheetRow[],
    getRowId: (r) => (r as any)?.id ?? `${r.productId}-${r.childSku}`,
  });
  const sheetController = adaptDataGridController(dataGrid);
  useEffect(() => {
    sheetController.state = { isDirty: dataGrid.gridState.isDirty };
  }, [sheetController, dataGrid.gridState.isDirty]);

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
        const isReadOnly =
          def.editable === false || def.key === "product" || def.key === "id";
        const nonEditable = isReadOnly;
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
          type: "axisText",
          text: resolveText(rawValue),
          nonEditable,
          groupId,
          className: nonEditable ? "rg-non-editable" : undefined,
        } as AxisTextCell;
      }),
      ];
      return { rowId, height: 34, cells };
    });
    return [header, ...dataRows];
  }, [
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
        const def = columnDefsByKey.get(key);
        const readOnly =
          def?.editable === false || def?.key === "product" || def?.key === "id";
        if (readOnly) {
          skippedCount += 1;
          continue;
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
        updatedIndexes.add(rowIndex);
      }
      if (!updatedIndexes.size) {
        return { applied, skippedCount };
      }
      const ops = Array.from(updatedIndexes).map((idx) => ({
        type: "UPDATE" as const,
        fromRowIndex: idx,
        toRowIndex: idx + 1,
      }));
      dataGrid.onChange(workingRows, ops);
      return { applied, skippedCount };
    },
    [columnDefsByKey, dataGrid, getRowId]
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
      const baseRows = dataGrid.value.slice();
      const parseProductIdFromRowId = (rowId: Id) => {
        if (typeof rowId !== "string") return null;
        const match = rowId.match(/^row:\d+:(\d+)/);
        if (!match) return null;
        const id = Number(match[1]);
        return Number.isFinite(id) ? id : null;
      };
      const resolvedChanges = changes
        .map((change) => ({
          change,
          rowIndex:
            rowIndexById.get(change.rowId) ??
            parseRowIndexFromId(change.rowId),
        }))
        .filter((item) => item.rowIndex != null);
      const anchorItem = resolvedChanges.find(
        (item) => (item.rowIndex as number) < baseRows.length
      );
      const anchorRow =
        anchorItem && anchorItem.rowIndex != null
          ? baseRows[anchorItem.rowIndex as number]
          : null;
      const anchorProductId =
        anchorRow?.productId ??
        (anchorItem ? parseProductIdFromRowId(anchorItem.change.rowId) : null);
      let multiGroup = false;
      if (anchorProductId != null) {
        for (const item of resolvedChanges) {
          if (item.rowIndex == null) continue;
          if (item.rowIndex >= baseRows.length) continue;
          const row = baseRows[item.rowIndex];
          if (row?.productId !== anchorProductId) {
            multiGroup = true;
            break;
          }
        }
      }
      let groupEndIndex = -1;
      if (anchorProductId != null) {
        for (let i = baseRows.length - 1; i >= 0; i--) {
          if (baseRows[i]?.productId === anchorProductId) {
            groupEndIndex = i;
            break;
          }
        }
      }
      const prototypeRow = anchorRow
        ? createRowForProduct(anchorRow)
        : null;
      const shouldApplyChange = (
        change: CellChange,
        rowIndex: number | null,
        row: ProductBomsSheetRow | null
      ) => {
        if (rowIndex == null) return false;
        const key = String(change.columnId);
        if (key === "__rownum") return false;
        const def = columnDefsByKey.get(key);
        const readOnly =
          def?.editable === false || def?.key === "product" || def?.key === "id";
        const newCell = change.newCell as any;
        if (readOnly || newCell?.nonEditable) return false;
        if (!row && !prototypeRow) return false;
        return true;
      };
      let maxTargetRowIndex = -1;
      for (const item of resolvedChanges) {
        if (
          !shouldApplyChange(
            item.change,
            item.rowIndex as number,
            (item.rowIndex as number) < baseRows.length
              ? baseRows[item.rowIndex as number]
              : prototypeRow
          )
        ) {
          continue;
        }
        if ((item.rowIndex as number) > maxTargetRowIndex) {
          maxTargetRowIndex = item.rowIndex as number;
        }
      }
      const growthNeeded =
        groupEndIndex >= 0 && maxTargetRowIndex > groupEndIndex;
      const allowGrowth =
        growthNeeded && anchorProductId != null && !multiGroup && !!anchorRow;
      let workingRows = baseRows.slice();
      if (allowGrowth) {
        const required = maxTargetRowIndex - groupEndIndex;
        const inserted = Array.from({ length: required }, () =>
          createRowForProduct(anchorRow as ProductBomsSheetRow)
        );
        workingRows = [
          ...baseRows.slice(0, groupEndIndex + 1),
          ...inserted,
          ...baseRows.slice(groupEndIndex + 1),
        ];
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.info("[reactgrid] auto rows appended", required);
        }
      } else if (growthNeeded) {
        notifications.show({
          color: "yellow",
          title: "Paste clipped",
          message: "Paste exceeds group bounds; rows were not added.",
        });
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.info("[reactgrid] blocked multi-group overflow paste");
        }
      }

      const rowIndexByIdLocal = allowGrowth
        ? new Map<Id, number>(
            workingRows.map((row, idx) => [getRowId(row, idx), idx])
          )
        : rowIndexById;
      const valueChanges = changes
        .filter((change) => change.rowId !== "header")
        .map((change) => {
          const newCell = change.newCell as any;
          const nextValue =
            newCell?.type === "axisText" ? newCell.text ?? "" : "";
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
      setChangeStats({
        total: changes.length,
        applied: result.applied.length,
        ignored: changes.length - result.applied.length,
      });
      if (result.applied.length) {
        undoRedo.recordAppliedBatch(result.applied, {
          kind: changes.length > 1 ? "paste" : "edit",
        });
      }
    },
    [
      applyValueChanges,
      columnDefsByKey,
      createRowForProduct,
      dataGrid,
      getRowId,
      rowIndexById,
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
        if (previousCell.type === "axisText") {
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
            if (sourceCell.type === "axisText") {
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
    dataGrid.setValue(next);
  }, [dataGrid]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const rowsForSave = dataGrid
        .getValues()
        .filter((row) => !(row as any)?.__testRow);
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
  }, [dataGrid, navigate]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset: () => {
        dataGrid.setValue((initialRows || []) as ProductBomsSheetRow[]);
        undoRedo.clearHistory();
      },
      formState: { isDirty: dataGrid.gridState.isDirty },
    }),
    [dataGrid, initialRows, undoRedo]
  );
  useInitGlobalFormContext(formHandlers as any, () => save(), formHandlers.reset);

  return (
    <SheetShell
      title="Batch Edit BOMs"
      controller={sheetController}
      backTo={exitUrl}
      saveState={saving ? "saving" : "idle"}
      dsgLink="/products/boms/sheet-dsg"
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
