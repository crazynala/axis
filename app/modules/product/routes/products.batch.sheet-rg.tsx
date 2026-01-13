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
import { notifications } from "@mantine/notifications";
import { useElementSize } from "@mantine/hooks";
import { useInitGlobalFormContext } from "@aa/timber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Group, Text } from "@mantine/core";
import { SheetShell } from "~/components/sheets/SheetShell";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { useDataGrid } from "~/components/sheets/useDataGrid";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { adaptDataGridController } from "~/components/sheets/SheetController";
import { useOptions } from "~/base/options/OptionsContext";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { computeSheetColumnWidths } from "~/components/sheets/computeSheetColumnWidths";
import {
  axisSelectCellTemplate,
  axisHeaderCellTemplate,
  axisTextCellTemplate,
  type AxisSelectCell,
  type AxisTextCell,
} from "~/components/sheets/reactGridCells";
import { collectSelectedCellLocations } from "~/components/sheets/reactGridSelection";
import { useReactGridHover } from "~/components/sheets/useReactGridHover";
import {
  ensureRowsForCellChanges,
  parseRowIndexFromId,
} from "~/modules/sheets/reactgrid/autoRows";
import { useReactGridUndoRedo } from "~/modules/sheets/reactgrid/useReactGridUndoRedo";
import { productSpec } from "~/modules/product/spec";
import {
  buildProductBatchSheetViewSpec,
  buildProductMetadataColumnKey,
} from "~/modules/product/spec/sheets";
import type { ProductAttributeDefinition } from "~/modules/productMetadata/types/productMetadata";
import { normalizeEnumOptions } from "~/modules/productMetadata/utils/productMetadataFields";
import { rulesForType } from "~/modules/product/rules/productTypeRules";

export async function loader(args: LoaderFunctionArgs) {
  const { loader: batchLoader } = await import("./products.batch.sheet-dsg");
  return batchLoader(args as any);
}

export async function action(args: any) {
  const { action: batchAction } = await import("./products.batch.sheet-dsg");
  return batchAction(args);
}

type Choice = { label: string; value: string };
type SheetRow = {
  id?: number | "";
  sku: string;
  name: string;
  type: string;
  supplierId?: string | number | "";
  categoryId?: string | number | "";
  subCategoryId?: string | number | "";
  purchaseTaxId?: string | number | "";
  costPrice?: number | string | "" | null;
  manualSalePrice?: number | string | "" | null;
  pricingModel?: string | null;
  pricingSpecId?: string | number | "";
  moqPrice?: number | string | "" | null;
  margin?: number | string | "" | null;
  transferPct?: number | string | "" | null;
  stockTrackingEnabled?: boolean;
  batchTrackingEnabled?: boolean;
  disableControls?: boolean;
  [key: string]: any;
};

const customCellTemplates = {
  axisHeader: axisHeaderCellTemplate,
  axisText: axisTextCellTemplate,
  axisSelect: axisSelectCellTemplate,
};

const isEmptyValue = (value: unknown) =>
  value === null || value === undefined || value === "" || value === "null";

const resolveText = (value: unknown) =>
  value == null ? "" : String(value);

export default function ProductsBatchSheetReactGrid() {
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
  const navigate = useNavigate();
  const loaderData = useLoaderData<{
    mode: "create" | "edit";
    rows: SheetRow[];
    metadataDefinitions: ProductAttributeDefinition[];
    pricingSpecOptions: Choice[];
  }>();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const originalRef = useRef<SheetRow[]>([]);
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
  const options = useOptions();
  useSheetDirtyPrompt();
  const exitUrl = "/products";
  const metadataDefinitions = loaderData?.metadataDefinitions || [];
  const pricingSpecOptions = loaderData?.pricingSpecOptions || [];
  const viewSpecBase = productSpec.sheet?.views["batch"];
  if (!viewSpecBase) {
    throw new Error("Missing product sheet spec: batch");
  }
  const viewSpec = useMemo(
    () => buildProductBatchSheetViewSpec(metadataDefinitions),
    [metadataDefinitions]
  );
  const createRow = useCallback(() => {
    const metaFields: Record<string, any> = {};
    for (const def of metadataDefinitions) {
      metaFields[buildProductMetadataColumnKey(def.key)] =
        def.dataType === "BOOLEAN" ? null : "";
    }
    return {
      sku: "",
      name: "",
      type: "",
      supplierId: "",
      categoryId: "",
      subCategoryId: "",
      purchaseTaxId: "",
      costPrice: "",
      manualSalePrice: "",
      pricingModel: "",
      pricingSpecId: "",
      moqPrice: "",
      margin: "",
      transferPct: "",
      stockTrackingEnabled: false,
      batchTrackingEnabled: false,
      disableControls: false,
      ...metaFields,
    } as SheetRow;
  }, [metadataDefinitions]);
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

  const dataGrid = useDataGrid<SheetRow>({
    initialData: loaderData?.rows || [],
    getRowId: (r) => (r as any)?.id,
    lockRows: true,
  });
  const sheetController = adaptDataGridController(dataGrid);
  useEffect(() => {
    sheetController.state = { isDirty: dirty };
  }, [sheetController, dirty]);

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
    () =>
      `axis:sheet-columns-widths:v1:products:${viewSpec.id}:index`,
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

  const pricingModelOptions = useMemo(
    () => [
      { value: "COST_PLUS_MARGIN", label: "Cost + Margin" },
      { value: "COST_PLUS_FIXED_SELL", label: "Cost + Fixed Sell" },
      { value: "TIERED_COST_PLUS_MARGIN", label: "Tiered Cost + Margin" },
      { value: "TIERED_COST_PLUS_FIXED_SELL", label: "Tiered Cost + Fixed Sell" },
      { value: "CURVE_SELL_AT_MOQ", label: "Curve (Sell at MOQ)" },
    ],
    []
  );

  const supplierOptions = useMemo(
    () =>
      (options?.supplierOptions || []).map((opt) => ({
        value: String(opt.value),
        label: opt.label,
      })),
    [options?.supplierOptions]
  );
  const taxOptions = useMemo(
    () =>
      (options?.taxCodeOptions || []).map((opt) => ({
        value: String(opt.value),
        label: opt.label,
      })),
    [options?.taxCodeOptions]
  );
  const categoryOptions = options?.categoryOptions || [];
  const categoryOptionsByGroupCode = options?.categoryOptionsByGroupCode || {};
  const categoryMetaById = options?.categoryMetaById || {};

  const getCategoryOptions = useCallback(
    (row: SheetRow) => {
      const group =
        rulesForType(row?.type).categoryGroupCode?.toUpperCase() || "";
      if (group && categoryOptionsByGroupCode[group]?.length) {
        return categoryOptionsByGroupCode[group].map((opt) => ({
          value: String(opt.value),
          label: opt.label,
        }));
      }
      if (!group) {
        return categoryOptions.map((opt) => ({
          value: String(opt.value),
          label: opt.label,
        }));
      }
      if (Object.keys(categoryMetaById).length) {
        return categoryOptions
          .filter((opt) => {
            const meta = categoryMetaById[String(opt.value)];
            const parent = String(meta?.parentCode || "").toUpperCase();
            return parent === group;
          })
          .map((opt) => ({
            value: String(opt.value),
            label: opt.label,
          }));
      }
      return categoryOptions.map((opt) => ({
        value: String(opt.value),
        label: opt.label,
      }));
    },
    [categoryOptions, categoryOptionsByGroupCode, categoryMetaById]
  );

  const metadataOptionsByKey = useMemo(() => {
    const out = new Map<string, Choice[]>();
    for (const def of metadataDefinitions) {
      if (def.dataType === "ENUM") {
        const choices =
          Array.isArray(def.options) && def.options.length
            ? def.options.map((opt) => ({
                value: String(opt.id),
                label: opt.label,
              }))
            : normalizeEnumOptions(def.enumOptions);
        out.set(buildProductMetadataColumnKey(def.key), choices);
      } else if (def.dataType === "BOOLEAN") {
        out.set(buildProductMetadataColumnKey(def.key), [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]);
      }
    }
    return out;
  }, [metadataDefinitions]);

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
          def.key === "name" ||
          def.key === "supplierId" ||
          def.key === "moqPrice",
      })),
    ];
  }, [columnSelection.selectedColumns, columnWidthOverrides, widthByKey]);

  const columnDefsByKey = useMemo(() => {
    return new Map(viewSpec.columns.map((col) => [col.key, col] as const));
  }, [viewSpec.columns]);

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
        rows?: SheetRow[];
        rowIndexById?: Map<Id, number>;
        source?: "edit" | "undo" | "redo";
      }
    ) => {
      const baseRows = options?.rows ?? dataGrid.value;
      const rowIndexByIdLocal =
        options?.rowIndexById ??
        new Map(
          baseRows.map((row, idx) => [
            row?.id ? `product:${row.id}` : `row:${idx}`,
            idx,
          ])
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
        const applicable = def?.isApplicable ? def.isApplicable(row) : true;
        const readOnly = def?.editable === false || def?.key === "id";
        if (!applicable || readOnly) {
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
      setDirty(true);
      return { applied, skippedCount };
    },
    [columnDefsByKey, dataGrid]
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
      const rowId = row?.id ? `product:${row.id}` : `row:${rowIndex}`;
      const cells = [
        {
          type: "axisText",
          text: String(rowIndex + 1),
          nonEditable: true,
          className: "rg-rownum-cell rg-non-editable",
        } as AxisTextCell,
        ...columnSelection.selectedColumns.map((def) => {
        const rawValue = (row as any)[def.key];
        const isApplicable = def.isApplicable ? def.isApplicable(row) : true;
        const isReadOnly = def.editable === false || def.key === "id";
        const inapplicableReason = !isApplicable
          ? def.getInapplicableReason?.(row) || "Not applicable"
          : undefined;
        const nonEditable = !isApplicable || isReadOnly;
        const cellClassName = nonEditable
          ? `rg-non-editable${!isApplicable ? " rg-inapplicable" : ""}`
          : undefined;
        const showNa = nonEditable && isEmptyValue(rawValue);
        const groupId =
          groupByProduct && row?.id && !nonEditable
            ? String(row.id)
            : undefined;
        if (def.key === "supplierId") {
          const selectedValue = resolveText(rawValue);
          const label =
            supplierOptions.find((opt) => opt.value === selectedValue)?.label ||
            "";
          return {
            type: "axisSelect",
            selectedValue,
            values: supplierOptions,
            searchable: true,
            clearable: true,
            nonEditable,
            tooltip: inapplicableReason,
            showNa,
            displayText: label,
            groupId,
            className: cellClassName,
          } as AxisSelectCell;
        }
        if (def.key === "categoryId") {
          const optionsForRow = getCategoryOptions(row);
          const selectedValue = resolveText(rawValue);
          const label =
            optionsForRow.find((opt) => opt.value === selectedValue)?.label ||
            "";
          return {
            type: "axisSelect",
            selectedValue,
            values: optionsForRow,
            searchable: true,
            clearable: true,
            nonEditable,
            tooltip: inapplicableReason,
            showNa,
            displayText: label,
            groupId,
            className: cellClassName,
          } as AxisSelectCell;
        }
        if (def.key === "purchaseTaxId") {
          const selectedValue = resolveText(rawValue);
          const label =
            taxOptions.find((opt) => opt.value === selectedValue)?.label || "";
          return {
            type: "axisSelect",
            selectedValue,
            values: taxOptions,
            searchable: true,
            clearable: true,
            nonEditable,
            tooltip: inapplicableReason,
            showNa,
            displayText: label,
            groupId,
            className: cellClassName,
          } as AxisSelectCell;
        }
        if (def.key === "pricingModel") {
          const selectedValue = resolveText(rawValue);
          const label =
            pricingModelOptions.find((opt) => opt.value === selectedValue)
              ?.label || "";
          return {
            type: "axisSelect",
            selectedValue,
            values: pricingModelOptions,
            searchable: true,
            clearable: true,
            nonEditable,
            tooltip: inapplicableReason,
            showNa,
            displayText: label,
            groupId,
            className: cellClassName,
          } as AxisSelectCell;
        }
        if (def.key === "pricingSpecId") {
          const selectedValue = resolveText(rawValue);
          const label =
            pricingSpecOptions.find((opt) => opt.value === selectedValue)
              ?.label || "";
          return {
            type: "axisSelect",
            selectedValue,
            values: pricingSpecOptions,
            searchable: true,
            clearable: true,
            nonEditable,
            tooltip: inapplicableReason,
            showNa,
            displayText: label,
            groupId,
            className: nonEditable ? "rg-non-editable" : undefined,
          } as AxisSelectCell;
        }
        const metadataOptions = metadataOptionsByKey.get(def.key);
        if (metadataOptions) {
          const selectedValue = resolveText(rawValue);
          const label =
            metadataOptions.find((opt) => opt.value === selectedValue)?.label ||
            "";
          return {
            type: "axisSelect",
            selectedValue,
            values: metadataOptions,
            searchable: true,
            clearable: true,
            nonEditable,
            tooltip: inapplicableReason,
            showNa,
            displayText: label,
            groupId,
            className: cellClassName,
          } as AxisSelectCell;
        }
        return {
          type: "axisText",
          text: resolveText(rawValue),
          nonEditable,
          tooltip: inapplicableReason,
          showNa,
          groupId,
          className: cellClassName,
        } as AxisTextCell;
      }),
      ];
      return { rowId, height: 34, cells };
    });
    return [header, ...dataRows];
  }, [
    columnSelection.selectedColumns,
    dataGrid.value,
    getCategoryOptions,
    groupByProduct,
    metadataOptionsByKey,
    pricingModelOptions,
    pricingSpecOptions,
    supplierOptions,
    taxOptions,
  ]);

  const rowIndexById = useMemo(() => {
    const map = new Map<Id, number>();
    (dataGrid.value || []).forEach((row, idx) => {
      const rowId = row?.id ? `product:${row.id}` : `row:${idx}`;
      map.set(rowId, idx);
    });
    return map;
  }, [dataGrid.value]);

  const onCellsChanged = useCallback(
    (changes: CellChange[]) => {
      if (!changes?.length) return;
      const shouldApplyChange = (
        change: CellChange,
        rowIndex: number | null,
        row: SheetRow | null
      ) => {
        if (rowIndex == null) return false;
        const key = String(change.columnId);
        if (key === "__rownum") return false;
        const def = columnDefsByKey.get(key);
        const targetRow = row ?? createRow();
        const applicable = def?.isApplicable ? def.isApplicable(targetRow) : true;
        const readOnly = def?.editable === false || def?.key === "id";
        const newCell = change.newCell as any;
        if (!applicable || readOnly || newCell?.nonEditable) return false;
        return true;
      };

      const growth = ensureRowsForCellChanges<SheetRow>({
        changes,
        rows: dataGrid.value,
        rowIndexById,
        resolveRowIndexFromId: parseRowIndexFromId,
        shouldGrowForChange: (change, rowIndex, row) =>
          shouldApplyChange(change, rowIndex, row),
        appendRows: (count) =>
          Array.from({ length: count }, () => createRow()),
      });
      const workingRows = growth.nextRows.slice();
      if (growth.didGrow && process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.info("[reactgrid] auto rows appended", growth.addedCount);
      }

      const rowIndexByIdLocal = growth.didGrow
        ? new Map<Id, number>(
            workingRows.map((row, idx) => [
              row?.id ? `product:${row.id}` : `row:${idx}`,
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
      createRow,
      dataGrid,
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
        if (previousCell.type === "axisSelect") {
          newCell = {
            ...previousCell,
            selectedValue: "",
            displayText: "",
          };
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
            if (sourceCell.type === "axisSelect") {
              newCell = {
                ...targetCell,
                selectedValue: sourceCell.selectedValue ?? "",
                displayText: sourceCell.displayText ?? "",
              };
            } else if (sourceCell.type === "axisText") {
              newCell = {
                ...targetCell,
                text: sourceCell.text ?? "",
              };
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
    next.push({
      id: "",
      sku: "",
      name: "[TEST ROW]",
      type: "",
      supplierId: "",
      categoryId: "",
      subCategoryId: "",
      purchaseTaxId: "",
      costPrice: "",
      manualSalePrice: "",
      pricingModel: "",
      pricingSpecId: "",
      moqPrice: "",
      margin: "",
      transferPct: "",
      stockTrackingEnabled: false,
      batchTrackingEnabled: false,
      __testRow: true,
    } as SheetRow);
    dataGrid.setValue(next);
    setDirty(true);
  }, [dataGrid]);

  const reset = useCallback(() => {
    dataGrid.reset();
    setDirty(false);
    originalRef.current = [];
    undoRedo.clearHistory();
  }, [dataGrid, undoRedo]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const currentRows = dataGrid.getValues();
      const selectedMetaKeys = new Set(
        columnSelection.selectedKeys.filter((key) => key.startsWith("meta:"))
      );
      const rowsForSave = currentRows
        .filter((row) => !(row as any)?.__testRow)
        .map((row) => {
        const next: Record<string, any> = { ...row };
        for (const key of Object.keys(next)) {
          if (!key.startsWith("meta:")) continue;
          if (!selectedMetaKeys.has(key)) delete next[key];
        }
        return next;
      });
      const payload = {
        _intent: "product.batchSaveRows",
        rows: rowsForSave,
      };
      const resp = await fetch("/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok) {
        const updatedCount =
          typeof (data as any)?.updated === "number"
            ? (data as any).updated
            : dataGrid.gridState.updatedRowIds.size;
        notifications.show({
          color: "teal",
          title: "Batch save",
          message: `Saved ${updatedCount} updated`,
        });
        setDirty(false);
        dataGrid.commit();
        navigate("/products?refreshed=1");
      } else {
        notifications.show({
          color: "red",
          title: "Save failed",
          message: data?.error || "Could not save products.",
        });
      }
    } catch (e: any) {
      notifications.show({
        color: "red",
        title: "Save failed",
        message: e?.message || "Unexpected error",
      });
    } finally {
      setSaving(false);
    }
  }, [columnSelection.selectedKeys, dataGrid, navigate]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset,
      formState: { isDirty: dirty },
    }),
    [dirty, reset]
  );
  useInitGlobalFormContext(formHandlers as any, () => save(), reset);

  useMemo(() => {
    originalRef.current = loaderData?.rows || [];
  }, [loaderData]);

  return (
    <SheetShell
      title="Batch Edit Products"
      controller={sheetController}
      backTo={exitUrl}
      saveState={saving ? "saving" : "idle"}
      dsgLink="/products/batch/sheet-dsg"
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
                  {/* Note: to achieve single-click edit for select cells, this spike renders Mantine Select inline. */}
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
