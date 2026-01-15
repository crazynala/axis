import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInitGlobalFormContext } from "@aa/timber";
import { useElementSize } from "@mantine/hooks";
import { useMantineColorScheme, useMantineTheme } from "@mantine/core";
import { SheetShell } from "~/components/sheets/SheetShell";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { jobSpec } from "~/modules/job/spec";
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
import { lookupProductsBySkus } from "~/modules/product/utils/productLookup.client";
import type { DebugExplainPayload } from "~/modules/debug/types";
import { normalizeUsageValue } from "~/components/sheets/UsageSelectCell";
import { prismaBase } from "~/utils/prisma.server";

export type CostingEditRow = {
  id: number | null;
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

type HeaderRow = {
  kind: "header";
  rowId: string;
  assemblyId: number;
  assemblyName: string;
};
type LineRow = CostingEditRow & { kind: "line"; rowId: string };
type DraftRow = CostingEditRow & { kind: "draft"; rowId: string; draftId: string };
type VisibleRow = HeaderRow | LineRow | DraftRow;

type RowSnapshot = {
  rowId: string;
  kind: "line" | "draft";
  assemblyId: number;
  row: LineRow | DraftRow | null;
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
const FILL_KEYS = new Set(["activityUsed", "quantityPerUnit"]);

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

const isBlankDraft = (row: CostingEditRow) => {
  const sku = String(row.productSku || "").trim();
  const name = String(row.productName || "").trim();
  const activity = String(row.activityUsed || "").trim();
  const hasQty =
    row.quantityPerUnit !== "" &&
    row.quantityPerUnit !== null &&
    row.quantityPerUnit !== undefined;
  return !(sku || name || activity || hasQty);
};

const blankCostingRow = (
  assemblyId: number,
  assemblyName: string
): CostingEditRow => ({
  id: null,
  assemblyId,
  assemblyName,
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
  localKey: `draft-${assemblyId}-${Date.now().toString(36)}`,
});

export async function loader(args: LoaderFunctionArgs) {
  const assemblyParam = args.params.assemblyId || "";
  const jobId = Number(args.params.jobId);
  const assemblyIds = assemblyParam
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  if (!assemblyIds.length || !Number.isFinite(jobId)) {
    return json({ rows: [], assemblies: [], exitUrl: "/jobs", actionPath: "" });
  }
  const assemblies = await prismaBase.assembly.findMany({
    where: { id: { in: assemblyIds }, jobId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      costings: {
        select: {
          id: true,
          productId: true,
          quantityPerUnit: true,
          unitCost: true,
          activityUsed: true,
          externalStepType: true,
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              externalStepType: true,
            },
          },
        },
      },
    },
  });
  const rows: CostingEditRow[] = [];
  assemblies.forEach((assembly) => {
    (assembly.costings || []).forEach((costing) => {
      rows.push({
        id: costing.id,
        assemblyId: assembly.id,
        assemblyName: assembly.name || "",
        productId: costing.productId ?? costing.product?.id ?? null,
        productSku: costing.product?.sku || "",
        productName: costing.product?.name || "",
        activityUsed: normalizeUsageValue(costing.activityUsed),
        externalStepType:
          costing.externalStepType ?? costing.product?.externalStepType ?? null,
        quantityPerUnit:
          costing.quantityPerUnit == null
            ? ""
            : Number(costing.quantityPerUnit) || 0,
        unitCost:
          costing.unitCost == null ? "" : Number(costing.unitCost) || 0,
        required: "",
        disableControls: false,
        localKey: `costing-${costing.id}`,
      });
    });
  });
  const actionPath = new URL(args.request.url).pathname;
  const exitUrl = `/jobs/${jobId}/assembly/${assemblyParam}`;
  return json({
    rows,
    assemblies: assemblies.map((assembly) => ({
      id: assembly.id,
      name: assembly.name || "",
    })),
    exitUrl,
    actionPath,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json().catch(() => null);
  const intent = String(body?._intent || "");
  if (intent !== "costings.batchSave") {
    return json({ ok: false, error: "Unknown intent" }, { status: 400 });
  }
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const skuSet = new Set<string>();
  rows.forEach((row: CostingEditRow) => {
    const sku = String(row?.productSku || "").trim();
    if (sku) skuSet.add(sku);
  });
  const skuList = Array.from(skuSet);
  const products = skuList.length
    ? await prismaBase.product.findMany({
        where: { sku: { in: skuList } },
        select: { id: true, sku: true },
      })
    : [];
  const productIdBySku = new Map(
    products.map((product) => [product.sku || "", product.id])
  );
  const updateRows = rows.filter((row: CostingEditRow) => row?.id);
  const createRows = rows.filter(
    (row: CostingEditRow) => !row?.id && String(row?.productSku || "").trim()
  );
  for (const row of updateRows) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    const sku = String(row.productSku || "").trim();
    const productId =
      row.productId != null ? Number(row.productId) : productIdBySku.get(sku);
    const quantityPerUnit =
      row.quantityPerUnit === "" || row.quantityPerUnit == null
        ? null
        : Number(row.quantityPerUnit) || 0;
    const activityUsed = normalizeUsageValue(row.activityUsed);
    await prismaBase.costing.updateMany({
      where: { id },
      data: {
        ...(productId ? { productId } : {}),
        quantityPerUnit,
        activityUsed: activityUsed || null,
      },
    });
  }
  for (const row of createRows) {
    const assemblyId = Number(row.assemblyId);
    if (!Number.isFinite(assemblyId)) continue;
    const sku = String(row.productSku || "").trim();
    const productId =
      row.productId != null ? Number(row.productId) : productIdBySku.get(sku);
    if (!productId) continue;
    const quantityPerUnit =
      row.quantityPerUnit === "" || row.quantityPerUnit == null
        ? null
        : Number(row.quantityPerUnit) || 0;
    const activityUsed = normalizeUsageValue(row.activityUsed);
    await prismaBase.costing.create({
      data: {
        assemblyId,
        productId,
        quantityPerUnit,
        activityUsed: activityUsed || null,
      },
    });
  }
  return json({ ok: true });
}

export default function CostingsSheetGlide() {
  const { rows: initialRows, assemblies, exitUrl, actionPath } =
    useLoaderData<{
      rows: CostingEditRow[];
      assemblies: Array<{ id: number; name: string }>;
      exitUrl: string;
      actionPath: string;
    }>();
  const navigate = useNavigate();
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

  useSheetDirtyPrompt();
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

  const assemblyOrder = useMemo(() => {
    const seen = new Set<number>();
    const order: number[] = [];
    (initialRows || []).forEach((row) => {
      const id = Number(row.assemblyId || 0);
      if (!id || seen.has(id)) return;
      seen.add(id);
      order.push(id);
    });
    (assemblies || []).forEach((assembly) => {
      if (seen.has(assembly.id)) return;
      seen.add(assembly.id);
      order.push(assembly.id);
    });
    return order;
  }, [assemblies, initialRows]);

  const assemblyNameById = useMemo(() => {
    const map = new Map<number, string>();
    (initialRows || []).forEach((row) => {
      const id = Number(row.assemblyId || 0);
      if (!id || map.has(id)) return;
      map.set(id, row.assemblyName || "");
    });
    (assemblies || []).forEach((assembly) => {
      if (map.has(assembly.id)) return;
      map.set(assembly.id, assembly.name || "");
    });
    return map;
  }, [assemblies, initialRows]);

  const initialLines = useMemo<LineRow[]>(() => {
    return (initialRows || []).map((row) => ({
      ...row,
      activityUsed: normalizeUsageValue(row.activityUsed),
      kind: "line",
      rowId: buildRowId({ id: row.id }),
    }));
  }, [initialRows]);

  const initialDrafts = useMemo<Record<number, DraftRow[]>>(() => {
    const drafts: Record<number, DraftRow[]> = {};
    assemblyOrder.forEach((assemblyId) => {
      const name = assemblyNameById.get(assemblyId) || "";
      const draft = blankCostingRow(assemblyId, name);
      const draftId = createDraftId();
      drafts[assemblyId] = [
        {
          ...draft,
          kind: "draft",
          draftId,
          rowId: buildRowId({ id: null, draftId }),
        },
      ];
    });
    return drafts;
  }, [assemblyNameById, assemblyOrder]);

  const [gridState, setGridState] = useState<{
    lines: LineRow[];
    draftsByAssemblyId: Record<number, DraftRow[]>;
  }>(() => ({
    lines: initialLines,
    draftsByAssemblyId: initialDrafts,
  }));

  useEffect(() => {
    setGridState({ lines: initialLines, draftsByAssemblyId: initialDrafts });
  }, [initialDrafts, initialLines]);

  const normalizeDraftsForAssembly = useCallback(
    (drafts: DraftRow[], assemblyId: number, lineCount: number) => {
      const name = assemblyNameById.get(assemblyId) || "";
      const createDraft = () => {
        const base = blankCostingRow(assemblyId, name);
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
        isBlankDraft,
        createDraft,
        1,
        lineCount
      );
    },
    [assemblyNameById]
  );

  const normalizedDrafts = useMemo(() => {
    const next: Record<number, DraftRow[]> = {};
    assemblyOrder.forEach((assemblyId) => {
      const drafts = gridState.draftsByAssemblyId[assemblyId] || [];
      const lineCount = gridState.lines.filter(
        (row) => Number(row.assemblyId) === assemblyId
      ).length;
      next[assemblyId] = normalizeDraftsForAssembly(
        drafts,
        assemblyId,
        lineCount
      );
    });
    return next;
  }, [assemblyOrder, gridState.draftsByAssemblyId, gridState.lines, normalizeDraftsForAssembly]);

  useEffect(() => {
    setGridState((prev) => ({
      lines: prev.lines,
      draftsByAssemblyId: normalizedDrafts,
    }));
  }, [normalizedDrafts]);

  const visibleRows = useMemo<VisibleRow[]>(() => {
    const rows: VisibleRow[] = [];
    assemblyOrder.forEach((assemblyId) => {
      rows.push({
        kind: "header",
        rowId: `hdr:${assemblyId}`,
        assemblyId,
        assemblyName: assemblyNameById.get(assemblyId) || "",
      });
      gridState.lines
        .filter((row) => Number(row.assemblyId) === assemblyId)
        .forEach((row) => rows.push(row));
      const drafts = gridState.draftsByAssemblyId[assemblyId] || [];
      drafts.forEach((draft) => rows.push(draft));
    });
    return rows;
  }, [assemblyNameById, assemblyOrder, gridState.draftsByAssemblyId, gridState.lines]);

  const selectedColumns = columnSelection.selectedColumns.length
    ? columnSelection.selectedColumns
    : viewSpec.columns;

  const widthStorageKey = `axis:sheet-columns-widths:v1:jobs:${viewSpec.id}:assembly`;
  const { widthsByKey, setWidthsByKey } = useColumnWidths(widthStorageKey);

  const columns = useMemo<GridColumn[]>(() => {
    return selectedColumns.map((col) => ({
      id: col.key,
      title: col.label,
      width: widthsByKey[col.key] ?? col.baseWidthPx ?? 140,
    }));
  }, [selectedColumns, widthsByKey]);

  const applySnapshots = useCallback((snapshots: RowSnapshot[]) => {
    setGridState((prev) => {
      const nextLines = prev.lines.slice();
      const nextDrafts: Record<number, DraftRow[]> = {
        ...prev.draftsByAssemblyId,
      };
      snapshots.forEach((snap) => {
        if (snap.kind === "line") {
          const idx = nextLines.findIndex((row) => row.rowId === snap.rowId);
          if (snap.row && idx >= 0) {
            nextLines[idx] = snap.row as LineRow;
          } else if (!snap.row && idx >= 0) {
            nextLines.splice(idx, 1);
          }
        } else {
          const list = nextDrafts[snap.assemblyId] || [];
          const idx = list.findIndex((row) => row.rowId === snap.rowId);
          if (snap.row && idx >= 0) {
            list[idx] = snap.row as DraftRow;
            nextDrafts[snap.assemblyId] = list.slice();
          } else if (!snap.row && idx >= 0) {
            const copy = list.slice();
            copy.splice(idx, 1);
            nextDrafts[snap.assemblyId] = copy;
          } else if (snap.row && idx < 0) {
            nextDrafts[snap.assemblyId] = list.concat([snap.row as DraftRow]);
          }
        }
      });
      return { lines: nextLines, draftsByAssemblyId: nextDrafts };
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
    (
      patches: Array<{ rowId: string; patch: Partial<CostingEditRow> }>,
      options?: { extraDrafts?: DraftRow[] }
    ) => {
      let batch: PatchBatch | null = null;
      setGridState((prev) => {
        const beforeSnapshots: RowSnapshot[] = [];
        const afterSnapshots: RowSnapshot[] = [];
        const nextLines = prev.lines.slice();
        const nextDrafts: Record<number, DraftRow[]> = {
          ...prev.draftsByAssemblyId,
        };

        if (options?.extraDrafts?.length) {
          options.extraDrafts.forEach((draft) => {
            const list = nextDrafts[Number(draft.assemblyId)] || [];
            beforeSnapshots.push({
              rowId: draft.rowId,
              kind: "draft",
              assemblyId: Number(draft.assemblyId),
              row: null,
            });
            afterSnapshots.push({
              rowId: draft.rowId,
              kind: "draft",
              assemblyId: Number(draft.assemblyId),
              row: draft,
            });
            nextDrafts[Number(draft.assemblyId)] = list.concat([draft]);
          });
        }

        patches.forEach(({ rowId, patch }) => {
          if (rowId.startsWith("line:")) {
            const idx = nextLines.findIndex((row) => row.rowId === rowId);
            if (idx < 0) return;
            const prevRow = nextLines[idx];
            const nextRow = { ...prevRow, ...patch };
            beforeSnapshots.push({
              rowId,
              kind: "line",
              assemblyId: Number(prevRow.assemblyId),
              row: prevRow,
            });
            afterSnapshots.push({
              rowId,
              kind: "line",
              assemblyId: Number(prevRow.assemblyId),
              row: nextRow,
            });
            nextLines[idx] = nextRow;
          } else {
            const assemblyId = Number(
              patch.assemblyId ||
                (rowId.startsWith("draft:") &&
                prev.draftsByAssemblyId
                  ? Object.entries(prev.draftsByAssemblyId).find(([, list]) =>
                      list.some((row) => row.rowId === rowId)
                    )?.[0]
                  : null)
            );
            const list = nextDrafts[assemblyId] || [];
            const idx = list.findIndex((row) => row.rowId === rowId);
            if (idx < 0) return;
            const prevRow = list[idx];
            const nextRow = { ...prevRow, ...patch };
            beforeSnapshots.push({
              rowId,
              kind: "draft",
              assemblyId,
              row: prevRow,
            });
            afterSnapshots.push({
              rowId,
              kind: "draft",
              assemblyId,
              row: nextRow,
            });
            const copy = list.slice();
            copy[idx] = nextRow;
            nextDrafts[assemblyId] = copy;
          }
        });

        if (beforeSnapshots.length || afterSnapshots.length) {
          batch = { before: beforeSnapshots, after: afterSnapshots };
        }
        return { lines: nextLines, draftsByAssemblyId: nextDrafts };
      });
      if (batch) {
        pushHistory(historyRef, batch);
        setIsDirty(true);
      }
    },
    []
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
          const patches: Array<{ rowId: string; patch: Partial<CostingEditRow> }> = [];
          entries.forEach(([rowId, sku]) => {
            const info = lookup.get(String(sku).trim().toLowerCase());
            if (!info) return;
            patches.push({
              rowId,
              patch: {
                productId: info?.id ?? null,
                productName: info?.name || "",
              },
            });
          });
          if (!patches.length) return;
          applyUserPatches(patches);
        } catch {}
      }, 120);
    },
    [applyUserPatches]
  );

  const isEditableCell = useCallback(
    (row: VisibleRow, key: string) => {
      if (row.kind === "header") return false;
      if (row.disableControls) return false;
      if (key === "productSku") return true;
      if (key === "activityUsed") return !row.externalStepType;
      if (key === "quantityPerUnit") return true;
      return false;
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
      if (rowData.kind === "header") {
        if (key === "assemblyName") {
          return {
            kind: GridCellKind.Text,
            data: rowData.assemblyName,
            displayData: rowData.assemblyName,
            allowOverlay: false,
            readonly: true,
          } as GridCell;
        }
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
        } as GridCell;
      }
      if (key === "activityUsed" && dropdownRenderer) {
        return {
          kind: GridCellKind.Custom,
          allowOverlay: isEditableCell(rowData, key),
          readonly: !isEditableCell(rowData, key),
          copyData: String(rowData.activityUsed || ""),
          data: {
            kind: "dropdown-cell",
            allowedValues: usageOptions,
            value: String(rowData.activityUsed || ""),
          },
        } as GridCell;
      }
      return {
        kind: GridCellKind.Text,
        data: String((rowData as any)[key] ?? ""),
        displayData: String((rowData as any)[key] ?? ""),
        allowOverlay: isEditableCell(rowData, key),
        readonly: !isEditableCell(rowData, key),
      } as GridCell;
    },
    [columns, dropdownRenderer, isEditableCell, visibleRows]
  );

  const onCellEdited = useCallback(
    ([col, row]: readonly [number, number], newValue: any) => {
      const column = columns[col];
      const rowData = visibleRows[row];
      if (!column || !rowData || rowData.kind === "header") return;
      const key = String(column.id);
      if (!isEditableCell(rowData, key)) return;
      const value =
        newValue?.kind === GridCellKind.Custom &&
        newValue?.data?.kind === "dropdown-cell"
          ? String(newValue.data.value ?? "")
          : String(newValue?.data ?? newValue?.value ?? "");
      applyUserPatches([{ rowId: rowData.rowId, patch: { [key]: value } }]);
      if (key === "productSku") {
        enqueueSkuLookup([{ rowId: rowData.rowId, sku: value }]);
      }
    },
    [applyUserPatches, columns, enqueueSkuLookup, isEditableCell, visibleRows]
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
      const [colIdx, rowIdx] = cell as [number, number];
      const column = columns[colIdx];
      const rowData = visibleRows[rowIdx];
      if (!column || !rowData || rowData.kind === "header") return false;
      if (!values.length) return false;
      const key = String(column.id);
      if (!isEditableCell(rowData, key)) return false;
      const assemblyId = Number(rowData.assemblyId || 0);
      const groupRows = visibleRows.filter(
        (r) => r.kind !== "header" && Number((r as any).assemblyId || 0) === assemblyId
      ) as Array<LineRow | DraftRow>;
      const startIndex = groupRows.findIndex((r) => r.rowId === rowData.rowId);
      if (startIndex < 0) return false;
      const updates: Array<{ rowId: string; patch: Partial<CostingEditRow> }> = [];
      const extraDrafts: DraftRow[] = [];
      for (let i = 0; i < values.length; i += 1) {
        const targetRow = groupRows[startIndex + i];
        let rowTarget: LineRow | DraftRow;
        if (targetRow) {
          rowTarget = targetRow;
        } else {
          const name = assemblyNameById.get(assemblyId) || "";
          const draft = blankCostingRow(assemblyId, name);
          const draftId = createDraftId();
          rowTarget = {
            ...draft,
            kind: "draft",
            draftId,
            rowId: buildRowId({ id: null, draftId }),
          } as DraftRow;
          extraDrafts.push(rowTarget);
          groupRows.push(rowTarget);
        }
        const raw = String(values[i]?.[0] ?? "");
        updates.push({ rowId: rowTarget.rowId, patch: { [key]: raw } });
      }
      if (updates.length) {
        applyUserPatches(updates, { extraDrafts });
        const skuUpdates = updates
          .filter((u) => "productSku" in u.patch)
          .map((u) => ({
            rowId: u.rowId,
            sku: String(u.patch.productSku || ""),
          }));
        if (skuUpdates.length) enqueueSkuLookup(skuUpdates);
      }
      return true;
    },
    [
      applyUserPatches,
      assemblyNameById,
      columns,
      enqueueSkuLookup,
      isEditableCell,
      visibleRows,
    ]
  );

  const handleFillPattern = useCallback(
    (event: any) => {
      const patternSource = event?.patternSource;
      const fillDestination = event?.fillDestination;
      if (!patternSource || !fillDestination) return;
      if (
        patternSource.width <= 0 ||
        patternSource.height <= 0 ||
        fillDestination.width <= 0 ||
        fillDestination.height <= 0
      )
        return;
      if (typeof event?.preventDefault === "function") event.preventDefault();
      const rowsSnapshot = visibleRows;
      const firstSourceRow = rowsSnapshot[patternSource.y];
      if (!firstSourceRow || firstSourceRow.kind === "header") return;
      const assemblyId = Number((firstSourceRow as any).assemblyId || 0);
      for (
        let rowIdx = patternSource.y;
        rowIdx < patternSource.y + patternSource.height;
        rowIdx += 1
      ) {
        const rowData = rowsSnapshot[rowIdx];
        if (
          !rowData ||
          rowData.kind === "header" ||
          Number((rowData as any).assemblyId || 0) !== assemblyId
        )
          return;
      }
      for (
        let rowIdx = fillDestination.y;
        rowIdx < fillDestination.y + fillDestination.height;
        rowIdx += 1
      ) {
        const rowData = rowsSnapshot[rowIdx];
        if (
          !rowData ||
          rowData.kind === "header" ||
          Number((rowData as any).assemblyId || 0) !== assemblyId
        )
          return;
      }
      const patchesByRow = new Map<string, Partial<CostingEditRow>>();
      for (
        let rowOffset = 0;
        rowOffset < fillDestination.height;
        rowOffset += 1
      ) {
        const targetRowIdx = fillDestination.y + rowOffset;
        const targetRow = rowsSnapshot[targetRowIdx] as LineRow | DraftRow;
        if (!targetRow) continue;
        for (
          let colOffset = 0;
          colOffset < fillDestination.width;
          colOffset += 1
        ) {
          const targetColIdx = fillDestination.x + colOffset;
          const targetColumn = columns[targetColIdx];
          if (!targetColumn) continue;
          const targetKey = String(targetColumn.id);
          if (!FILL_KEYS.has(targetKey)) continue;
          if (!isEditableCell(targetRow, targetKey)) continue;
          const sourceRowIdx =
            patternSource.y + (rowOffset % patternSource.height);
          const sourceColIdx =
            patternSource.x + (colOffset % patternSource.width);
          const sourceRow = rowsSnapshot[sourceRowIdx] as LineRow | DraftRow;
          const sourceColumn = columns[sourceColIdx];
          if (!sourceRow || !sourceColumn) continue;
          const sourceKey = String(sourceColumn.id);
          if (!FILL_KEYS.has(sourceKey)) continue;
          if (!isEditableCell(sourceRow, sourceKey)) continue;
          const value = (sourceRow as any)[sourceKey];
          const patch = patchesByRow.get(targetRow.rowId) || {};
          (patch as any)[targetKey] = value;
          patchesByRow.set(targetRow.rowId, patch);
        }
      }
      const updates = Array.from(patchesByRow, ([rowId, patch]) => ({
        rowId,
        patch,
      }));
      if (updates.length) applyUserPatches(updates);
    },
    [applyUserPatches, columns, isEditableCell, visibleRows]
  );

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset: () => {
        setGridState({ lines: initialLines, draftsByAssemblyId: initialDrafts });
        historyRef.current = { past: [], future: [] };
        setIsDirty(false);
      },
      formState: { isDirty },
    }),
    [initialDrafts, initialLines, isDirty]
  );
  useInitGlobalFormContext(
    formHandlers as any,
    async () => {
      setSaving(true);
      try {
        const rowsForSave: CostingEditRow[] = [];
        gridState.lines.forEach((row) => rowsForSave.push(row));
        Object.values(gridState.draftsByAssemblyId).forEach((drafts) => {
          drafts.forEach((draft) => rowsForSave.push(draft));
        });
        const payload = {
          _intent: "costings.batchSave",
          rows: rowsForSave,
        };
        const resp = await fetch(actionPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) return;
        setIsDirty(false);
        navigate(exitUrl);
      } finally {
        setSaving(false);
      }
    },
    formHandlers.reset
  );

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
        module: "jobs",
        entity: { type: "assemblyCostings", id: actionPath },
        generatedAt: new Date().toISOString(),
        version: "costings-glide",
      },
      inputs: { params: {}, flags: [] },
      derived: {
        rowsCount: visibleRows.length,
        columnKeys: selectedColumns.map((col) => col.key),
      },
      reasoning: [],
    };
  }, [actionPath, selectedColumns, visibleRows.length]);

  return (
    <SheetShell
      title="Batch Edit Costings"
      backTo={exitUrl}
      saveState={saving ? "saving" : "idle"}
      debugPayload={debugPayload}
      columnPicker={{
        moduleKey: "jobs",
        viewId: viewSpec.id,
        scope: "assembly",
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
                  fillHandle={true}
                  allowedFillDirections="orthogonal"
                  onFillPattern={handleFillPattern as any}
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
