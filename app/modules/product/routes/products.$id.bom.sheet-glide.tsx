import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useParams } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInitGlobalFormContext } from "@aa/timber";
import { useElementSize } from "@mantine/hooks";
import { useMantineColorScheme, useMantineTheme } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { SheetShell } from "~/components/sheets/SheetShell";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { productSpec } from "~/modules/product/spec";
import {
  normalizeUsageValue,
} from "~/components/sheets/UsageSelectCell";
import { lookupProductsBySkus } from "~/modules/product/utils/productLookup.client";
import {
  DataEditor,
  GridCellKind,
  type GridCell,
  type GridColumn,
} from "@glideapps/glide-data-grid";
import {
  normalizeTrailingDrafts,
  pushHistory,
  useColumnWidths,
} from "~/modules/sheets/glide/helpers";
import { DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";
import type { DebugExplainPayload } from "~/modules/debug/types";
import { prismaBase } from "~/utils/prisma.server";

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

type LineRow = BOMRow & { kind: "line"; rowId: string };
type DraftRow = BOMRow & { kind: "draft"; rowId: string; draftId: string };
type RowSnapshot = {
  rowId: string;
  row: LineRow | DraftRow | null;
  kind: "line" | "draft";
};
type PatchBatch = {
  before: RowSnapshot[];
  after: RowSnapshot[];
};

const usageOptions: Array<{ label: string; value: string }> = [
  { label: "", value: "" },
  { label: "Cut", value: "cut" },
  { label: "Sew", value: "sew" },
  { label: "Finish", value: "finish" },
  { label: "Make", value: "make" },
  { label: "Wash", value: "wash" },
  { label: "Embroidery", value: "embroidery" },
  { label: "Dye", value: "dye" },
];

const resolveText = (value: unknown) => (value == null ? "" : String(value));

const createDraftId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `draft-${Math.random().toString(36).slice(2)}`;
};

const buildRowId = (row: { id: number | null; draftId?: string }) => {
  if (row.draftId) return `draft:${row.draftId}`;
  if (row.id != null) return `line:${row.id}`;
  return `line:unknown`;
};

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

export async function loader(args: LoaderFunctionArgs) {
  const idStr = args.params.id;
  const productId = Number(idStr);
  if (!idStr || Number.isNaN(productId)) {
    throw new Response("Invalid product id", { status: 400 });
  }
  const product = await prismaBase.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      sku: true,
      productLines: {
        select: {
          id: true,
          quantity: true,
          activityUsed: true,
          child: {
            select: {
              sku: true,
              name: true,
              type: true,
              supplier: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }
  const rows = (product.productLines || []).map((line) => ({
    id: line.id ?? null,
    childSku: line.child?.sku || "",
    childName: line.child?.name || "",
    activityUsed: String(line.activityUsed || ""),
    type: line.child?.type ? String(line.child.type) : "",
    supplier: line.child?.supplier?.name || "",
    quantity: line.quantity == null ? "" : Number(line.quantity) || 0,
    disableControls: false,
  }));
  return json({
    rows,
    product: { id: product.id, name: product.name || "", sku: product.sku || "" },
  });
}

export default function ProductBomRouteGlide() {
  const { rows, product } = useLoaderData<typeof loader>();
  const params = useParams();
  const productId = Number(params.id);
  const viewSpec = productSpec.sheet?.views["detail-bom"];
  if (!viewSpec) {
    throw new Error("Missing product sheet spec: detail-bom");
  }
  useSheetDirtyPrompt();

  const { ref: gridRef, width: gridWidth, height: gridHeight } =
    useElementSize();
  const { colorScheme } = useMantineColorScheme();
  const mantineTheme = useMantineTheme();
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const historyRef = useRef<{ past: PatchBatch[]; future: PatchBatch[] }>({
    past: [],
    future: [],
  });
  const [dropdownRenderer, setDropdownRenderer] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    import("@glideapps/glide-data-grid-cells")
      .then((mod) => {
        if (!mounted) return;
        setDropdownRenderer(() => mod.DropdownCell);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const columnSelection = useSheetColumnSelection({
    moduleKey: "products",
    viewId: viewSpec.id,
    scope: "detail",
    viewSpec,
  });
  const selectedColumns = columnSelection.selectedColumns.length
    ? columnSelection.selectedColumns
    : viewSpec.defaultColumns.length
    ? viewSpec.columns.filter((col) => viewSpec.defaultColumns.includes(col.key))
    : viewSpec.columns;

  const widthStorageKey = `axis:sheet-columns-widths:v1:products:${viewSpec.id}:detail`;
  const { widthsByKey, setWidthsByKey } = useColumnWidths(widthStorageKey);

  const initialLines = useMemo<LineRow[]>(() => {
    return (rows || []).map((row: BOMRow) => ({
      ...row,
      activityUsed: normalizeUsageValue(row.activityUsed),
      kind: "line",
      rowId: buildRowId({ id: row.id }),
    }));
  }, [rows]);

  const [gridState, setGridState] = useState<{
    lines: LineRow[];
    drafts: DraftRow[];
  }>(() => ({
    lines: initialLines,
    drafts: [],
  }));

  useEffect(() => {
    setGridState({ lines: initialLines, drafts: [] });
  }, [initialLines]);

  const normalizeDrafts = useCallback(
    (drafts: DraftRow[], lineCount: number) => {
      const createDraft = () => {
        const base = blankRow();
        const draftId = createDraftId();
        return {
          ...base,
          kind: "draft",
          draftId,
          rowId: buildRowId({ id: null, draftId }),
        } as DraftRow;
      };
      return normalizeTrailingDrafts(
        drafts,
        isBlank,
        createDraft,
        DEFAULT_MIN_ROWS,
        lineCount
      );
    },
    []
  );

  const normalizedDrafts = useMemo(
    () => normalizeDrafts(gridState.drafts, gridState.lines.length),
    [gridState.drafts, gridState.lines.length, normalizeDrafts]
  );

  useEffect(() => {
    if (normalizedDrafts === gridState.drafts) return;
    setGridState((prev) => ({
      lines: prev.lines,
      drafts: normalizedDrafts,
    }));
  }, [gridState.drafts, normalizedDrafts]);

  const visibleRows = useMemo(
    () => [...gridState.lines, ...normalizedDrafts],
    [gridState.lines, normalizedDrafts]
  );

  const columns = useMemo<GridColumn[]>(() => {
    return selectedColumns.map((col) => ({
      id: col.key,
      title: col.label,
      width: widthsByKey[col.key] ?? col.baseWidthPx ?? 140,
    }));
  }, [selectedColumns, widthsByKey]);

  const applySnapshots = useCallback(
    (snapshots: RowSnapshot[]) => {
      setGridState((prev) => {
        const nextLines = prev.lines.slice();
        let nextDrafts = prev.drafts.slice();
        snapshots.forEach((snap) => {
          if (snap.kind === "line") {
            const idx = nextLines.findIndex((row) => row.rowId === snap.rowId);
            if (snap.row && idx >= 0) {
              nextLines[idx] = snap.row as LineRow;
            } else if (!snap.row && idx >= 0) {
              nextLines.splice(idx, 1);
            }
          } else {
            const idx = nextDrafts.findIndex((row) => row.rowId === snap.rowId);
            if (snap.row && idx >= 0) {
              nextDrafts[idx] = snap.row as DraftRow;
            } else if (!snap.row && idx >= 0) {
              const copy = nextDrafts.slice();
              copy.splice(idx, 1);
              nextDrafts = copy;
            } else if (snap.row && idx < 0) {
              nextDrafts = nextDrafts.concat([snap.row as DraftRow]);
            }
          }
        });
        nextDrafts = normalizeDrafts(nextDrafts, nextLines.length);
        return { lines: nextLines, drafts: nextDrafts };
      });
    },
    [normalizeDrafts]
  );

  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    const batch = history.past.pop();
    if (!batch) return;
    history.future.push(batch);
    applySnapshots(batch.before);
    if (history.past.length === 0) {
      setIsDirty(false);
    }
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
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [handleRedo, handleUndo]);

  const applyUserPatches = useCallback(
    (
      patches: Array<{ rowId: string; patch: Partial<BOMRow> }>,
      options?: { extraDrafts?: DraftRow[] }
    ) => {
      let batch: PatchBatch | null = null;
      setGridState((prev) => {
        const beforeSnapshots: RowSnapshot[] = [];
        const afterSnapshots: RowSnapshot[] = [];
        let nextLines = prev.lines.slice();
        let nextDrafts = prev.drafts.slice();

        if (options?.extraDrafts?.length) {
          options.extraDrafts.forEach((draft) => {
            beforeSnapshots.push({
              rowId: draft.rowId,
              kind: "draft",
              row: null,
            });
            afterSnapshots.push({
              rowId: draft.rowId,
              kind: "draft",
              row: draft,
            });
          });
          nextDrafts = nextDrafts.concat(options.extraDrafts);
        }

        patches.forEach(({ rowId, patch }) => {
          if (rowId.startsWith("line:")) {
            const idx = nextLines.findIndex((row) => row.rowId === rowId);
            if (idx < 0) return;
            const prevRow = nextLines[idx];
            const nextRow = { ...prevRow, ...patch };
            if ("childSku" in patch) {
              nextRow.childName = "";
              nextRow.type = "";
              nextRow.supplier = "";
            }
            beforeSnapshots.push({ rowId, kind: "line", row: prevRow });
            afterSnapshots.push({ rowId, kind: "line", row: nextRow });
            nextLines[idx] = nextRow;
          } else {
            const idx = nextDrafts.findIndex((row) => row.rowId === rowId);
            if (idx < 0) return;
            const prevRow = nextDrafts[idx];
            const nextRow = { ...prevRow, ...patch };
            if ("childSku" in patch) {
              nextRow.childName = "";
              nextRow.type = "";
              nextRow.supplier = "";
            }
            beforeSnapshots.push({ rowId, kind: "draft", row: prevRow });
            afterSnapshots.push({ rowId, kind: "draft", row: nextRow });
            const copy = nextDrafts.slice();
            copy[idx] = nextRow;
            nextDrafts = copy;
          }
        });

        nextDrafts = normalizeDrafts(nextDrafts, nextLines.length);
        if (beforeSnapshots.length || afterSnapshots.length) {
          batch = { before: beforeSnapshots, after: afterSnapshots };
        }
        return { lines: nextLines, drafts: nextDrafts };
      });
      if (batch) {
        pushHistory(historyRef, batch);
        setIsDirty(true);
      }
    },
    [normalizeDrafts]
  );

  const lookupTimerRef = useRef<number | null>(null);
  const pendingLookupRef = useRef<Map<string, string>>(new Map());

  const enqueueSkuLookup = useCallback(
    (rows: Array<{ rowId: string; sku: string }>) => {
      rows.forEach(({ rowId, sku }) => {
        const trimmed = String(sku || "").trim();
        if (!trimmed) return;
        pendingLookupRef.current.set(rowId, trimmed);
      });
      if (lookupTimerRef.current) {
        window.clearTimeout(lookupTimerRef.current);
      }
      lookupTimerRef.current = window.setTimeout(async () => {
        const entries = Array.from(pendingLookupRef.current.entries());
        pendingLookupRef.current.clear();
        if (!entries.length) return;
        const skus = Array.from(new Set(entries.map(([, sku]) => sku)));
        try {
          const lookup = await lookupProductsBySkus(skus);
          const patches: Array<{ rowId: string; patch: Partial<BOMRow> }> = [];
          entries.forEach(([rowId, sku]) => {
            const info = lookup.get(String(sku).trim().toLowerCase());
            if (!info) return;
            patches.push({
              rowId,
              patch: {
                childName: info?.name || "",
                type: info?.type || "",
                supplier: (info as any)?.supplierName || "",
              },
            });
          });
          if (!patches.length) return;
          setGridState((prev) => {
            const nextLines = prev.lines.slice();
            const nextDrafts = prev.drafts.slice();
            patches.forEach(({ rowId, patch }) => {
              if (rowId.startsWith("line:")) {
                const idx = nextLines.findIndex((row) => row.rowId === rowId);
                if (idx < 0) return;
                nextLines[idx] = { ...nextLines[idx], ...patch };
              } else {
                const idx = nextDrafts.findIndex((row) => row.rowId === rowId);
                if (idx < 0) return;
                const copy = nextDrafts.slice();
                copy[idx] = { ...copy[idx], ...patch };
                nextDrafts.splice(0, nextDrafts.length, ...copy);
              }
            });
            return { lines: nextLines, drafts: nextDrafts };
          });
        } catch {}
      }, 120);
    },
    []
  );

  const getCellContent = useCallback(
    ([col, row]: readonly [number, number]): GridCell => {
      const column = columns[col];
      const rowData = visibleRows[row];
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
      const isEditable =
        key === "childSku" || key === "quantity" || key === "activityUsed";
      if (key === "activityUsed") {
        const value = String(rowData.activityUsed || "");
        if (dropdownRenderer) {
          return {
            kind: GridCellKind.Custom,
            allowOverlay: isEditable,
            readonly: !isEditable,
            copyData: value,
            data: {
              kind: "dropdown-cell",
              allowedValues: usageOptions,
              value,
            },
          } as GridCell;
        }
      }
      return {
        kind: GridCellKind.Text,
        data: resolveText((rowData as any)[key]),
        displayData: resolveText((rowData as any)[key]),
        allowOverlay: isEditable,
        readonly: !isEditable,
      } as GridCell;
    },
    [columns, dropdownRenderer, visibleRows]
  );

  const onCellEdited = useCallback(
    ([col, row]: readonly [number, number], newValue: any) => {
      const column = columns[col];
      const rowData = visibleRows[row];
      if (!column || !rowData) return;
      const key = String(column.id);
      if (!(key === "childSku" || key === "quantity" || key === "activityUsed"))
        return;
      const value =
        newValue?.kind === GridCellKind.Custom &&
        newValue?.data?.kind === "dropdown-cell"
          ? String(newValue.data.value ?? "")
          : String(newValue?.data ?? newValue?.value ?? "");
      applyUserPatches([{ rowId: rowData.rowId, patch: { [key]: value } }]);
      if (key === "childSku") {
        enqueueSkuLookup([{ rowId: rowData.rowId, sku: value }]);
      }
    },
    [applyUserPatches, columns, enqueueSkuLookup, visibleRows]
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
      const updates: Array<{ rowId: string; patch: Partial<BOMRow> }> = [];
      const extraDrafts: DraftRow[] = [];
      const rowsSnapshot = visibleRows.slice();
      for (let rowOffset = 0; rowOffset < values.length; rowOffset += 1) {
        const targetRowIdx = startRow + rowOffset;
        let rowData = rowsSnapshot[targetRowIdx];
        if (!rowData) {
          const base = blankRow();
          const draftId = createDraftId();
          rowData = {
            ...base,
            kind: "draft",
            draftId,
            rowId: buildRowId({ id: null, draftId }),
          } as DraftRow;
          extraDrafts.push(rowData);
          rowsSnapshot.push(rowData);
        }
        for (let colOffset = 0; colOffset < values[rowOffset].length; colOffset += 1) {
          const colIdx = startCol + colOffset;
          const column = columns[colIdx];
          if (!column) continue;
          const key = String(column.id);
          if (!(key === "childSku" || key === "quantity" || key === "activityUsed"))
            continue;
          const raw = String(values[rowOffset][colOffset] ?? "");
          updates.push({
            rowId: rowData.rowId,
            patch: { [key]: raw },
          });
        }
      }
      if (updates.length) {
        applyUserPatches(updates, { extraDrafts });
        const skuUpdates = updates
          .filter((u) => "childSku" in u.patch)
          .map((u) => ({ rowId: u.rowId, sku: String(u.patch.childSku || "") }));
        if (skuUpdates.length) enqueueSkuLookup(skuUpdates);
      }
      return true;
    },
    [applyUserPatches, columns, enqueueSkuLookup, visibleRows]
  );

  const reset = useCallback(() => {
    setGridState({ lines: initialLines, drafts: [] });
    historyRef.current = { past: [], future: [] };
    setIsDirty(false);
  }, [initialLines]);

  const save = useCallback(async () => {
    if (!Number.isFinite(productId)) return;
    setSaving(true);
    const origById = new Map<number, LineRow>();
    initialLines.forEach((r) => {
      if (r.id != null) origById.set(r.id, r);
    });
    const editedRows = [...gridState.lines, ...gridState.drafts];
    const editedById = new Map<number, BOMRow>();
    editedRows.forEach((r) => {
      if (r.id != null) editedById.set(r.id, r);
    });
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
    for (const r of editedRows) {
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
        const msg = data?.ok
          ? `Saved: +${data.created || 0} / ~${data.updated || 0} / -${
              data.deleted || 0
            }`
          : "Saved";
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
        setIsDirty(false);
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
  }, [gridState.drafts, gridState.lines, initialLines, productId]);

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
        module: "products",
        entity: { type: "detailBom", id: String(productId || "") },
        generatedAt: new Date().toISOString(),
        version: "product-bom-glide",
      },
      inputs: {
        params: { id: String(productId || "") },
        flags: [],
      },
      derived: {
        rowsCount: visibleRows.length,
        columnKeys: selectedColumns.map((col) => col.key),
      },
      reasoning: [],
    };
  }, [productId, selectedColumns, visibleRows.length]);

  return (
    <SheetShell
      title={`BOM: ${product?.name || ""}`}
      backTo={Number.isFinite(productId) ? `/products/${productId}` : "/products"}
      saveState={saving ? "saving" : "idle"}
      debugPayload={debugPayload}
      columnPicker={{
        moduleKey: "products",
        viewId: viewSpec.id,
        scope: "detail",
        viewSpec,
        rowsForRelevance: visibleRows,
        selection: columnSelection,
      }}
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
                  customRenderers={
                    dropdownRenderer ? [dropdownRenderer] : undefined
                  }
                  rows={visibleRows.length}
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
