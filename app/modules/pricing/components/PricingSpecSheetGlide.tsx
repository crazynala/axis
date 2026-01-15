import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@remix-run/react";
import { useElementSize } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useInitGlobalFormContext } from "@aa/timber";
import { SheetShell } from "~/components/sheets/SheetShell";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";
import {
  normalizeTrailingDrafts,
  pushHistory,
  useColumnWidths,
} from "~/modules/sheets/glide/helpers";
import {
  isPricingSpecRangeMeaningful,
  sanitizePricingSpecRanges,
  validatePricingSpecRanges,
  type PricingSpecRangeInput,
} from "~/modules/pricing/utils/pricingSpecRanges";
import {
  DataEditor,
  GridCellKind,
  type GridCell,
  type GridColumn,
} from "@glideapps/glide-data-grid";
import type { DebugExplainPayload } from "~/modules/debug/types";
import { useMantineColorScheme, useMantineTheme } from "@mantine/core";

type RangeRow = PricingSpecRangeInput & {
  localKey: string;
  disableControls?: boolean;
};

type RowSnapshot = {
  rowId: string;
  row: RangeRow | null;
};
type PatchBatch = {
  before: RowSnapshot[];
  after: RowSnapshot[];
};

type PricingSpecSheetProps = {
  mode: "new" | "edit";
  actionPath: string;
  exitUrl: string;
  initialRows: RangeRow[];
  title: string;
  storageKey: string;
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

const resolveText = (value: unknown) =>
  value == null ? "" : String(value);

const parseNullableNumber = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

export function PricingSpecSheetGlide({
  mode,
  actionPath,
  exitUrl,
  initialRows,
  title,
  storageKey,
}: PricingSpecSheetProps) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<number, string[]>>({});
  const historyRef = useRef<{ past: PatchBatch[]; future: PatchBatch[] }>({
    past: [],
    future: [],
  });
  const { ref: gridRef, width: gridWidth, height: gridHeight } =
    useElementSize();
  const { colorScheme } = useMantineColorScheme();
  const mantineTheme = useMantineTheme();

  useSheetDirtyPrompt();

  const { widthsByKey, setWidthsByKey } = useColumnWidths(storageKey);

  const [rowsState, setRowsState] = useState<RangeRow[]>(
    () => initialRows || []
  );

  useEffect(() => {
    setRowsState(initialRows || []);
  }, [initialRows]);

  const normalizedRows = useMemo(() => {
    const drafts = normalizeTrailingDrafts(
      rowsState,
      (row) => !isPricingSpecRangeMeaningful(row),
      createBlankRow,
      DEFAULT_MIN_ROWS,
      0
    );
    return drafts;
  }, [rowsState]);

  useEffect(() => {
    if (normalizedRows === rowsState) return;
    setRowsState(normalizedRows);
  }, [normalizedRows, rowsState]);

  const columns = useMemo<GridColumn[]>(() => {
    return [
      { id: "rangeFrom", title: "From Qty", width: widthsByKey.rangeFrom ?? 140 },
      { id: "rangeTo", title: "To Qty", width: widthsByKey.rangeTo ?? 140 },
      { id: "multiplier", title: "Multiplier", width: widthsByKey.multiplier ?? 160 },
    ];
  }, [widthsByKey]);

  const applySnapshots = useCallback((snapshots: RowSnapshot[]) => {
    setRowsState((prev) => {
      let next = prev.slice();
      snapshots.forEach((snap) => {
        const idx = next.findIndex((row) =>
          String(row.id ?? row.localKey) === snap.rowId
        );
        if (snap.row && idx >= 0) {
          next[idx] = snap.row;
        } else if (!snap.row && idx >= 0) {
          next.splice(idx, 1);
        } else if (snap.row && idx < 0) {
          next = next.concat([snap.row]);
        }
      });
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    const batch = history.past.pop();
    if (!batch) return;
    history.future.push(batch);
    applySnapshots(batch.before);
    if (history.past.length === 0) setIsDirty(false);
  }, [applySnapshots]);

  const handleRedo = useCallback(() => {
    const history = historyRef.current;
    const batch = history.future.pop();
    if (!batch) return;
    history.past.push(batch);
    applySnapshots(batch.after);
    setIsDirty(true);
  }, [applySnapshots]);

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
      if (isRedo) handleRedo();
      else handleUndo();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [handleRedo, handleUndo]);

  const applyUserPatches = useCallback(
    (patches: Array<{ rowId: string; patch: Partial<RangeRow> }>) => {
      let batch: PatchBatch | null = null;
      setRowsState((prev) => {
        const beforeSnapshots: RowSnapshot[] = [];
        const afterSnapshots: RowSnapshot[] = [];
        const next = prev.slice();
        patches.forEach(({ rowId, patch }) => {
          const idx = next.findIndex(
            (row) => String(row.id ?? row.localKey) === rowId
          );
          if (idx < 0) return;
          const prevRow = next[idx];
          const nextRow = { ...prevRow, ...patch };
          beforeSnapshots.push({ rowId, row: prevRow });
          afterSnapshots.push({ rowId, row: nextRow });
          next[idx] = nextRow;
        });
        if (beforeSnapshots.length || afterSnapshots.length) {
          batch = { before: beforeSnapshots, after: afterSnapshots };
        }
        return next;
      });
      if (batch) {
        pushHistory(historyRef, batch);
        setIsDirty(true);
      }
    },
    []
  );

  const getCellContent = useCallback(
    ([col, row]: readonly [number, number]): GridCell => {
      const column = columns[col];
      const rowData = normalizedRows[row];
      if (!column || !rowData) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
        } as GridCell;
      }
      const key = String(column.id);
      const value = resolveText((rowData as any)[key]);
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: true,
        readonly: false,
      } as GridCell;
    },
    [columns, normalizedRows]
  );

  const onCellEdited = useCallback(
    ([col, row]: readonly [number, number], newValue: any) => {
      const column = columns[col];
      const rowData = normalizedRows[row];
      if (!column || !rowData) return;
      const key = String(column.id);
      const raw = String(newValue?.data ?? newValue?.value ?? "");
      const value = parseNullableNumber(raw);
      const rowId = String(rowData.id ?? rowData.localKey);
      applyUserPatches([{ rowId, patch: { [key]: value } }]);
    },
    [applyUserPatches, columns, normalizedRows]
  );

  const getCellsForSelection = useCallback(
    (selection: any) => {
      if (!selection || selection === true) return [];
      const { x, y, width, height } = selection;
      const cells: GridCell[][] = [];
      for (let rowIdx = y; rowIdx < y + height; rowIdx += 1) {
        const rowCells: GridCell[] = [];
        for (let colIdx = x; colIdx < x + width; colIdx += 1) {
          rowCells.push(getCellContent([colIdx, rowIdx] as const));
        }
        cells.push(rowCells);
      }
      return cells;
    },
    [getCellContent]
  );

  const onPaste = useCallback(
    (target: any, values: readonly (readonly string[])[]) => {
      const cell = target?.cell ?? target;
      if (!cell || !Array.isArray(cell)) return false;
      const [startCol, startRow] = cell as [number, number];
      if (!values.length) return false;
      const updates: Array<{ rowId: string; patch: Partial<RangeRow> }> = [];
      const rowsSnapshot = normalizedRows.slice();
      for (let rowOffset = 0; rowOffset < values.length; rowOffset += 1) {
        const rowIdx = startRow + rowOffset;
        const rowData = rowsSnapshot[rowIdx];
        if (!rowData) continue;
        for (let colOffset = 0; colOffset < values[rowOffset].length; colOffset += 1) {
          const colIdx = startCol + colOffset;
          const column = columns[colIdx];
          if (!column) continue;
          const key = String(column.id);
          const raw = String(values[rowOffset][colOffset] ?? "");
          const value = parseNullableNumber(raw);
          updates.push({
            rowId: String(rowData.id ?? rowData.localKey),
            patch: { [key]: value },
          });
        }
      }
      if (updates.length) applyUserPatches(updates);
      return true;
    },
    [applyUserPatches, columns, normalizedRows]
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const rows = rowsState;
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
      const payload = {
        _intent: "pricingSpec.save",
        rows,
      };
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
      setIsDirty(false);
      if (mode === "new" && data?.id) {
        navigate(`/admin/pricing-specs/${data.id}/sheet`);
      }
    } finally {
      setSaving(false);
    }
  }, [actionPath, mode, navigate, rowsState]);

  const reset = useCallback(() => {
    setRowsState(initialRows || []);
    setRowErrors({});
    historyRef.current = { past: [], future: [] };
    setIsDirty(false);
  }, [initialRows]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset,
      formState: { isDirty },
    }),
    [isDirty, reset]
  );
  useInitGlobalFormContext(formHandlers as any, () => save(), reset);

  const themeTokens = useMemo(() => {
    if (colorScheme === "dark") {
      return {
        gridVoidBg: "#000000",
        gridBaseBg: "#121416",
        gridEditableBg: "#171a1d",
        gridHeaderBg: "#0f1114",
        rowHeaderBg: "#0e1113",
        borderSubtle: "rgba(255,255,255,0.06)",
        borderStrong: "rgba(255,255,255,0.10)",
        textPrimary: "rgba(255,255,255,0.92)",
        textMuted: "rgba(255,255,255,0.70)",
        textDim: "rgba(255,255,255,0.55)",
        selectionBg: "rgba(70,140,255,0.22)",
        selectionBorder: "rgba(120,175,255,0.60)",
      };
    }
    return {
      gridVoidBg: "#f1f3f5",
      gridBaseBg: "#ffffff",
      gridEditableBg: "#ffffff",
      gridHeaderBg: "#f1f3f5",
      rowHeaderBg: "#f1f3f5",
      borderSubtle: "#dee2e6",
      borderStrong: "#ced4da",
      textPrimary: "#000000",
      textMuted: "#495057",
      textDim: "#868e96",
      selectionBg: "rgba(70,140,255,0.12)",
      selectionBorder: "rgba(70,140,255,0.5)",
    };
  }, [colorScheme]);

  const glideTheme = useMemo(() => {
    const accent = mantineTheme.colors.blue?.[6] || "#4dabf7";
    return {
      bgCanvas: themeTokens.gridVoidBg,
      bgCell: themeTokens.gridBaseBg,
      bgCellMedium: themeTokens.gridEditableBg,
      bgCellEven: themeTokens.gridBaseBg,
      bgHeader: themeTokens.gridHeaderBg,
      bgHeaderHasFocus: themeTokens.gridHeaderBg,
      bgHeaderHovered: themeTokens.gridHeaderBg,
      bgHeaderSelected: themeTokens.gridHeaderBg,
      headerFontStyle: "600 14px system-ui",
      baseFontStyle: "500 14px system-ui",
      markerFontStyle: "500 14px system-ui",
      textDark: themeTokens.textPrimary,
      textMedium: themeTokens.textMuted,
      textHeader: themeTokens.textMuted,
      textLight: themeTokens.textDim,
      accentColor: themeTokens.selectionBorder,
      accentFg: themeTokens.textPrimary,
      accentLight: themeTokens.selectionBg,
      bgSearchResult: themeTokens.selectionBg,
      borderColor: themeTokens.borderSubtle,
      horizontalBorderColor: themeTokens.borderSubtle,
      headerBottomBorderColor: themeTokens.borderStrong,
    };
  }, [mantineTheme, themeTokens]);

  const debugPayload = useMemo<DebugExplainPayload | null>(() => {
    return {
      context: {
        module: "pricing",
        entity: { type: "pricingSpecSheet", id: actionPath },
        generatedAt: new Date().toISOString(),
        version: "pricing-specs-glide",
      },
      inputs: { params: {}, flags: [] },
      derived: {
        rowsCount: normalizedRows.length,
        columnKeys: columns.map((col) => col.id as string),
        widthsByKey,
      },
      reasoning: [],
    };
  }, [actionPath, columns, normalizedRows.length, widthsByKey]);

  return (
    <SheetShell
      title={title}
      backTo={exitUrl}
      saveState={saving ? "saving" : "idle"}
      debugPayload={debugPayload}
    >
      {(gridHeight) => (
        <SheetFrame gridHeight={gridHeight}>
          {(bodyHeight) => (
            <div
              ref={gridRef}
              style={{
                height: bodyHeight,
                width: "100%",
                backgroundColor: themeTokens.gridVoidBg,
              }}
            >
              {gridWidth > 0 && gridHeight > 0 ? (
                <DataEditor
                  columns={columns}
                  getCellContent={getCellContent}
                  onCellEdited={onCellEdited}
                  getCellsForSelection={getCellsForSelection}
                  onPaste={onPaste as any}
                  rows={normalizedRows.length}
                  rowMarkers={{
                    kind: "number",
                    theme: {
                      bgCell: themeTokens.rowHeaderBg,
                      bgCellMedium: themeTokens.rowHeaderBg,
                      bgCellEven: themeTokens.rowHeaderBg,
                      textDark: themeTokens.textDim,
                      textMedium: themeTokens.textDim,
                      textLight: themeTokens.textDim,
                      borderColor: themeTokens.borderStrong,
                      markerFontStyle: "500 14px system-ui",
                    },
                  }}
                  width={gridWidth}
                  height={gridHeight}
                  theme={glideTheme}
                  onColumnResize={(col, width) => {
                    setWidthsByKey((prev) => ({
                      ...prev,
                      [String(col.id)]: Math.max(60, Math.floor(width)),
                    }));
                  }}
                />
              ) : null}
            </div>
          )}
        </SheetFrame>
      )}
    </SheetShell>
  );
}
