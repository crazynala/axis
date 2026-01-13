import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import type {
  CellChange,
  Column,
  Id,
  ReactGridProps,
  Row,
} from "@silevis/reactgrid";
import { Button, Checkbox, Group, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { useInitGlobalFormContext } from "@aa/timber";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SheetShell } from "~/components/sheets/SheetShell";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { useDataGrid } from "~/components/sheets/useDataGrid";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { adaptDataGridController } from "~/components/sheets/SheetController";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { computeSheetColumnWidths } from "~/components/sheets/computeSheetColumnWidths";
import {
  axisTextCellTemplate,
  type AxisTextCell,
} from "~/components/sheets/reactGridCells";
import { productSpec } from "~/modules/product/spec";
import type { ProductBomsSheetRow } from "~/modules/product/spec/sheets";

export async function loader(args: LoaderFunctionArgs) {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not Found", { status: 404 });
  }
  const { loader: baseLoader } = await import("./products.boms.sheet");
  return baseLoader(args as any);
}

export async function action(args: any) {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not Found", { status: 404 });
  }
  const { action: baseAction } = await import("./products.boms.sheet");
  return baseAction(args);
}

const customCellTemplates = {
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
  const { rows: initialRows } = useLoaderData<{
    rows: ProductBomsSheetRow[];
  }>();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { ref: gridContainerRef, width: gridContainerWidth } =
    useElementSize();
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

  const rows = useMemo<Row[]>(() => {
    const header: Row = {
      rowId: "header",
      height: 34,
      cells: [
        {
          type: "header",
          text: "#",
          className: "rg-header-cell rg-rownum-cell",
        },
        ...columnSelection.selectedColumns.map((def) => ({
          type: "header",
          text: def.label,
          className: "rg-header-cell",
        })),
      ],
    };
    const dataRows: Row[] = (dataGrid.value || []).map((row, rowIndex) => {
      const rowId = row?.id
        ? `line:${row.id}`
        : `row:${rowIndex}:${row.productId}`;
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
    groupByProduct,
  ]);

  const rowIndexById = useMemo(() => {
    const map = new Map<Id, number>();
    (dataGrid.value || []).forEach((row, idx) => {
      const rowId = row?.id
        ? `line:${row.id}`
        : `row:${idx}:${row.productId}`;
      map.set(rowId, idx);
    });
    return map;
  }, [dataGrid.value]);

  const onCellsChanged = useCallback(
    (changes: CellChange[]) => {
      if (!changes?.length) return;
      const nextRows = dataGrid.value.slice();
      const updatedIndexes = new Set<number>();
      const ignored: Array<{
        rowId: Id;
        columnId: Id;
        reason: string;
      }> = [];
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
        const def = columnDefsByKey.get(key);
        const readOnly =
          def?.editable === false || def?.key === "product" || def?.key === "id";
        if (readOnly) {
          ignored.push({
            rowId: change.rowId,
            columnId: change.columnId,
            reason: "Read-only column",
          });
          continue;
        }
        const newCell = change.newCell as any;
        if (newCell?.nonEditable) {
          ignored.push({
            rowId: change.rowId,
            columnId: change.columnId,
            reason: "Non-editable cell",
          });
          continue;
        }
        const nextValue =
          newCell?.type === "axisText" ? newCell.text ?? "" : "";
        (row as any)[key] = nextValue;
        nextRows[rowIndex] = row;
        updatedIndexes.add(rowIndex);
      }
      if (ignored.length) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.info("[reactgrid] ignored cell changes", ignored);
        }
      }
      setChangeStats({
        total: changes.length,
        applied: updatedIndexes.size,
        ignored: ignored.length,
      });
      if (!updatedIndexes.size) return;
      const ops = Array.from(updatedIndexes).map((idx) => ({
        type: "UPDATE" as const,
        fromRowIndex: idx,
        toRowIndex: idx + 1,
      }));
      dataGrid.onChange(nextRows, ops);
    },
    [columnDefsByKey, dataGrid, rowIndexById]
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
      reset: () => dataGrid.setValue((initialRows || []) as ProductBomsSheetRow[]),
      formState: { isDirty: dataGrid.gridState.isDirty },
    }),
    [dataGrid, initialRows]
  );
  useInitGlobalFormContext(formHandlers as any, () => save(), formHandlers.reset);

  return (
    <SheetShell
      title="Batch Edit BOMs (ReactGrid)"
      controller={sheetController}
      backTo={exitUrl}
      saveState={saving ? "saving" : "idle"}
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
              className="axisReactGrid"
            >
              {ReactGridComponent ? (
                <ReactGridComponent
                  rows={rows}
                  columns={columns}
                  customCellTemplates={customCellTemplates}
                  onCellsChanged={onCellsChanged}
                  enableColumnResizeOnAllHeaders
                  stickyTopRows={1}
                  onColumnResized={handleColumnResized}
                  enableRangeSelection
                  enableRowSelection
                  enableColumnSelection
                  enableFillHandle
                />
              ) : (
                <div style={{ padding: 12 }}>Loading grid…</div>
              )}
            </div>
          )}
        </SheetFrame>
      )}
    </SheetShell>
  );
}
