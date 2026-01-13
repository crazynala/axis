import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CellChange,
  Column,
  Id,
  MenuOption,
  ReactGridProps,
  Row,
} from "@silevis/reactgrid";
import { Button, Group, Stack, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useInitGlobalFormContext } from "@aa/timber";
import { useNavigate } from "@remix-run/react";
import { SheetShell } from "~/components/sheets/SheetShell";
import { DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";
import { padRowsWithDisableControls } from "~/components/sheets/disableControls";
import { useDataGrid } from "~/components/sheets/useDataGrid";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { adaptDataGridController } from "~/components/sheets/SheetController";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { computeSheetColumnWidths } from "~/components/sheets/computeSheetColumnWidths";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import {
  axisHeaderCellTemplate,
  axisTextCellTemplate,
  type AxisTextCell,
} from "~/components/sheets/reactGridCells";
import { useReactGridHover } from "~/components/sheets/useReactGridHover";
import { collectSelectedCellLocations } from "~/components/sheets/reactGridSelection";
import {
  isPricingSpecRangeMeaningful,
  sanitizePricingSpecRanges,
  validatePricingSpecRanges,
  type PricingSpecRangeInput,
} from "~/modules/pricing/utils/pricingSpecRanges";
import type { SheetViewSpec } from "~/base/sheets/sheetSpec";

type RangeRow = PricingSpecRangeInput & {
  localKey: string;
  disableControls?: boolean;
};

type PricingSpecSheetRgProps = {
  mode: "new" | "edit";
  title: string;
  actionPath: string;
  exitUrl: string;
  initialRows: RangeRow[];
  dsgLink?: string;
};

const customCellTemplates = {
  axisHeader: axisHeaderCellTemplate,
  axisText: axisTextCellTemplate,
};

const nextLocalKey = (() => {
  let i = 1;
  return () => `range-${i++}`;
})();

const createBlankRow = (): RangeRow => ({
  id: null,
  rangeFrom: null,
  rangeTo: null,
  multiplier: null,
  localKey: nextLocalKey(),
  disableControls: false,
});

const pricingSpecView: SheetViewSpec<RangeRow> = {
  id: "pricing-spec-ranges",
  label: "Pricing Spec",
  columns: [
    {
      key: "rangeFrom",
      label: "From Qty",
      baseWidthPx: 140,
      widthPresets: [
        { id: "sm", label: "Small", px: 120 },
        { id: "md", label: "Medium", px: 140 },
        { id: "lg", label: "Large", px: 180 },
      ],
    },
    {
      key: "rangeTo",
      label: "To Qty",
      baseWidthPx: 140,
      widthPresets: [
        { id: "sm", label: "Small", px: 120 },
        { id: "md", label: "Medium", px: 140 },
        { id: "lg", label: "Large", px: 180 },
      ],
    },
    {
      key: "multiplier",
      label: "Multiplier",
      baseWidthPx: 160,
      widthPresets: [
        { id: "sm", label: "Small", px: 120 },
        { id: "md", label: "Medium", px: 160 },
        { id: "lg", label: "Large", px: 220 },
      ],
    },
  ],
  defaultColumns: ["rangeFrom", "rangeTo", "multiplier"],
};

const resolveText = (value: unknown) =>
  value == null ? "" : String(value);

export function PricingSpecSheetRg({
  mode,
  title,
  actionPath,
  exitUrl,
  initialRows,
  dsgLink,
}: PricingSpecSheetRgProps) {
  const navigate = useNavigate();
  const [ReactGridComponent, setReactGridComponent] =
    useState<React.ComponentType<ReactGridProps> | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<number, string[]>>({});
  const [columnWidthOverrides, setColumnWidthOverrides] = useState<
    Record<string, number>
  >({});
  const { ref: gridContainerRef, width: gridContainerWidth } =
    useElementSize();
  const {
    gridRef: hoverGridRef,
    handlePointerMove,
    handlePointerLeave,
  } = useReactGridHover();

  const dataGrid = useDataGrid<RangeRow>({
    initialData: initialRows || [],
    getRowId: (row) => row.id ?? row.localKey,
    createRow: createBlankRow,
  });
  const sheetController = adaptDataGridController(dataGrid);

  useSheetDirtyPrompt();

  const columnSelection = useSheetColumnSelection({
    moduleKey: "pricing-specs",
    viewId: pricingSpecView.id,
    scope: "admin",
    viewSpec: pricingSpecView,
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
    () => `axis:sheet-columns-widths:v1:pricing-specs:${pricingSpecView.id}:admin`,
    []
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

  const displayRows = useMemo(
    () =>
      padRowsWithDisableControls(
        dataGrid.value,
        DEFAULT_MIN_ROWS,
        () => createBlankRow(),
        { extraInteractiveRows: 1 }
      ),
    [dataGrid.value]
  );

  const errorRowIndexes = useMemo(() => {
    const indexes = new Set<number>();
    Object.keys(rowErrors).forEach((idx) => indexes.add(Number(idx)));
    return indexes;
  }, [rowErrors]);

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
        width: columnWidthOverrides[def.key] ?? widthByKey[def.key] ?? def.baseWidthPx ?? 160,
        resizable: true,
      })),
    ];
  }, [columnSelection.selectedColumns, columnWidthOverrides, widthByKey]);

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
        ...columnSelection.selectedColumns.map((col) => ({
          type: "axisHeader",
          text: col.label,
          className: "rg-header-cell",
        })),
      ],
    };

    const dataRows: Row[] = displayRows.map((row, rowIndex) => {
      const rowId = row.id != null ? `range:${row.id}` : `row:${row.localKey}`;
      const nonEditableRow = Boolean(row.disableControls);
      const hasError = errorRowIndexes.has(rowIndex);
      const cellClassName = [
        nonEditableRow ? "rg-non-editable" : "",
        hasError ? "rg-row-error" : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined;
      const cells = [
        {
          type: "axisText",
          text: String(rowIndex + 1),
          nonEditable: true,
          className: ["rg-rownum-cell rg-non-editable", hasError ? "rg-row-error" : ""]
            .filter(Boolean)
            .join(" "),
        } as AxisTextCell,
        ...columnSelection.selectedColumns.map((col) => ({
          type: "axisText",
          text: resolveText((row as any)[col.key]),
          nonEditable: nonEditableRow,
          className: cellClassName,
        }) as AxisTextCell),
      ];
      return { rowId, height: 34, cells };
    });

    return [header, ...dataRows];
  }, [columnSelection.selectedColumns, displayRows, errorRowIndexes]);

  const rowIndexById = useMemo(() => {
    const map = new Map<Id, number>();
    displayRows.forEach((row, idx) => {
      const rowId = row.id != null ? `range:${row.id}` : `row:${row.localKey}`;
      map.set(rowId, idx);
    });
    return map;
  }, [displayRows]);

  const onCellsChanged = useCallback(
    (changes: CellChange[]) => {
      if (!changes?.length) return;
      const nextRows = displayRows.map((row) => ({ ...row }));
      const updatedIndexes = new Set<number>();
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
        if (row.disableControls) {
          ignored.push({
            rowId: change.rowId,
            columnId: change.columnId,
            reason: "Non-editable row",
          });
          continue;
        }
        const newCell = change.newCell as any;
        const nextValue =
          newCell?.type === "axisText" ? newCell.text ?? "" : newCell?.text ?? "";
        (row as any)[key] = nextValue;
        nextRows[rowIndex] = row;
        updatedIndexes.add(rowIndex);
      }
      if (ignored.length && process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.info("[reactgrid] ignored cell changes", ignored);
      }
      if (!updatedIndexes.size) return;
      const ops = Array.from(updatedIndexes).map((idx) => ({
        type: "UPDATE" as const,
        fromRowIndex: idx,
        toRowIndex: idx + 1,
      }));
      dataGrid.onChange(nextRows, ops);
    },
    [dataGrid, displayRows, rowIndexById]
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
            const newCell =
              sourceCell.type === "axisText"
                ? { ...targetCell, text: sourceCell.text ?? "" }
                : targetCell;
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
      const rows = dataGrid.getValues();
      const sanitized = sanitizePricingSpecRanges(rows);
      const validation = validatePricingSpecRanges(sanitized);
      if (validation.hasErrors) {
        setRowErrors(validation.errorsByIndex);
        notifications.show({
          color: "red",
          title: "Fix sheet errors",
          message: "Please resolve highlighted rows before saving.",
        });
        return;
      }
      setRowErrors({});
      const payload = { _intent: "pricingSpec.save", rows };
      const resp = await fetch(actionPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        notifications.show({
          color: "red",
          title: "Save failed",
          message: data?.error || "Could not save pricing spec.",
        });
        return;
      }
      const msg = data?.ok
        ? `Saved: +${data.created || 0} / ~${data.updated || 0} / -${
            data.deleted || 0
          }`
        : "Saved";
      notifications.show({ color: "teal", title: "Saved", message: msg });
      dataGrid.commit();
      if (mode === "new" && data?.id) {
        navigate(`/admin/pricing-specs/${data.id}/sheet`);
      }
    } finally {
      setSaving(false);
    }
  }, [actionPath, dataGrid, mode, navigate]);

  const reset = useCallback(() => {
    dataGrid.reset();
    setRowErrors({});
  }, [dataGrid]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset,
      formState: { isDirty: dataGrid.gridState.isDirty },
    }),
    [dataGrid.gridState.isDirty, reset]
  );

  useInitGlobalFormContext(formHandlers as any, () => save(), reset);

  useEffect(() => {
    if (!dataGrid.value.length && !dataGrid.gridState.isDirty) {
      dataGrid.setValue([createBlankRow()]);
    }
  }, [dataGrid]);

  return (
    <SheetShell
      title={title}
      controller={sheetController}
      backTo={exitUrl}
      saveState={saving ? "saving" : "idle"}
      dsgLink={dsgLink}
      columnPicker={{
        moduleKey: "pricing-specs",
        viewId: pricingSpecView.id,
        scope: "admin",
        viewSpec: pricingSpecView,
        rowsForRelevance: dataGrid.value,
        selection: columnSelection,
      }}
      footer={
        <div
          style={{
            padding: "6px 10px",
            borderTop: "1px solid var(--mantine-color-gray-3)",
          }}
        >
          <Group gap="sm">
            <Text size="xs" c="dimmed">
              Paste from Excel or edit inline. Empty rows are ignored on save.
            </Text>
            {Object.keys(rowErrors).length ? (
              <Text size="xs" c="red">
                {Object.keys(rowErrors).length} row
                {Object.keys(rowErrors).length === 1 ? "" : "s"} have errors
              </Text>
            ) : null}
            <Button
              variant="subtle"
              size="xs"
              onClick={() =>
                dataGrid.setValue([...dataGrid.value, createBlankRow()])
              }
            >
              Add row
            </Button>
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
              <Stack gap="sm" style={{ height: "100%", minHeight: 0 }}>
                <div className="axisReactGridScroller" style={{ flex: 1 }}>
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
              </Stack>
            </div>
          )}
        </SheetFrame>
      )}
    </SheetShell>
  );
}
