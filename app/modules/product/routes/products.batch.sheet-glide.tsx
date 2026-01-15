import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useInitGlobalFormContext } from "@aa/timber";
import { useElementSize } from "@mantine/hooks";
import {
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SheetShell } from "~/components/sheets/SheetShell";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { useOptions } from "~/base/options/OptionsContext";
import { productSpec } from "~/modules/product/spec";
import {
  buildProductBatchSheetViewSpec,
  buildProductMetadataColumnKey,
} from "~/modules/product/spec/sheets";
import { getAllProductAttributeDefinitions } from "~/modules/productMetadata/services/productMetadata.server";
import { normalizeEnumOptions } from "~/modules/productMetadata/utils/productMetadataFields";
import type { ProductAttributeDefinition } from "~/modules/productMetadata/types/productMetadata";
import { rulesForType } from "~/modules/product/rules/productTypeRules";
import { formatUSD } from "~/utils/format";
import type { DebugExplainPayload } from "~/modules/debug/types";
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
import { prismaBase } from "~/utils/prisma.server";

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

type LineRow = SheetRow & { kind: "line"; rowId: string };
type DraftRow = SheetRow & { kind: "draft"; rowId: string; draftId: string };
type RowSnapshot = {
  rowId: string;
  row: LineRow | DraftRow | null;
  kind: "line" | "draft";
};
type PatchBatch = {
  before: RowSnapshot[];
  after: RowSnapshot[];
};

const IS_DEV = process.env.NODE_ENV !== "production";
const PRIMARY_COLUMNS = new Set([
  "sku",
  "name",
  "type",
  "supplierId",
  "categoryId",
  "subCategoryId",
  "purchaseTaxId",
  "costPrice",
  "manualSalePrice",
  "pricingModel",
  "pricingSpecId",
  "moqPrice",
  "margin",
  "transferPct",
  "stockTrackingEnabled",
  "batchTrackingEnabled",
]);

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const ids = (url.searchParams.get("ids") || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  const metadataDefinitions = await getAllProductAttributeDefinitions();
  const pricingSpecs = await prismaBase.pricingSpec.findMany({
    where: { target: "SELL" },
    orderBy: { id: "asc" },
    select: { id: true, name: true, code: true, curveFamily: true },
  });
  const pricingSpecOptions = pricingSpecs.map((spec) => ({
    value: String(spec.id),
    label: spec.name || spec.code || spec.curveFamily || `#${spec.id}`,
  }));
  if (!ids.length) {
    return json({
      mode: "create" as const,
      rows: [],
      metadataDefinitions,
      pricingSpecOptions,
    });
  }
  const products = await prismaBase.product.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      type: true,
      supplierId: true,
      categoryId: true,
      subCategoryId: true,
      purchaseTaxId: true,
      costPrice: true,
      manualSalePrice: true,
      pricingModel: true,
      pricingSpecId: true,
      baselinePriceAtMoq: true,
      manualMargin: true,
      transferPercent: true,
      stockTrackingEnabled: true,
      batchTrackingEnabled: true,
    },
  });
  const rows: SheetRow[] = products.map((product) => ({
    id: product.id,
    sku: product.sku || "",
    name: product.name || "",
    type: String(product.type || ""),
    supplierId: product.supplierId ?? "",
    categoryId: product.categoryId ?? "",
    subCategoryId: product.subCategoryId ?? "",
    purchaseTaxId: product.purchaseTaxId ?? "",
    costPrice: product.costPrice ?? "",
    manualSalePrice: product.manualSalePrice ?? "",
    pricingModel: product.pricingModel ? String(product.pricingModel) : "",
    pricingSpecId: product.pricingSpecId ?? "",
    moqPrice: product.baselinePriceAtMoq ?? "",
    margin: product.manualMargin ?? "",
    transferPct: product.transferPercent ?? "",
    stockTrackingEnabled: product.stockTrackingEnabled ?? false,
    batchTrackingEnabled: product.batchTrackingEnabled ?? false,
    disableControls: false,
  }));
  const values = await prismaBase.productAttributeValue.findMany({
    where: { productId: { in: ids } },
    select: {
      productId: true,
      definitionId: true,
      optionId: true,
      valueString: true,
      valueNumber: true,
      valueBool: true,
    },
  });
  const defById = new Map(
    metadataDefinitions.map((def) => [def.id, def])
  );
  const rowById = new Map<number, SheetRow>(
    rows.map((row) => [Number(row.id), row])
  );
  values.forEach((entry) => {
    const def = defById.get(entry.definitionId);
    const row = rowById.get(entry.productId);
    if (!def || !row) return;
    const key = buildProductMetadataColumnKey(def.key);
    if (def.dataType === "BOOLEAN") {
      (row as any)[key] =
        entry.valueBool == null ? "" : entry.valueBool ? "true" : "false";
    } else if (def.dataType === "NUMBER") {
      (row as any)[key] = entry.valueNumber ?? "";
    } else if (def.dataType === "ENUM") {
      (row as any)[key] =
        entry.optionId != null
          ? String(entry.optionId)
          : entry.valueString ?? "";
    } else {
      (row as any)[key] = entry.valueString ?? "";
    }
  });
  return json({
    mode: "edit" as const,
    rows,
    metadataDefinitions,
    pricingSpecOptions,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json().catch(() => null);
  const intent = String(body?._intent || "");
  if (intent === "product.batchCreate") {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const { batchCreateProducts } = await import(
      "~/modules/product/services/batchCreateProducts.server"
    );
    const result = await batchCreateProducts(rows);
    return json(result);
  }
  if (intent === "product.batchSaveRows") {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const { batchSaveProductRows } = await import(
      "~/modules/product/services/batchSaveProductRows.server"
    );
    const result = await batchSaveProductRows(rows);
    return json(result);
  }
  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
}

const resolveText = (value: unknown) =>
  value == null ? "" : String(value);

const createDraftId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `draft-${Math.random().toString(36).slice(2)}`;
};

const buildRowId = (row: { id?: number | ""; draftId?: string }) => {
  if (row.draftId) return `draft:${row.draftId}`;
  if (row.id != null && row.id !== "") return `line:${row.id}`;
  return `line:unknown`;
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

function createBlankRow(
  metadataDefinitions: ProductAttributeDefinition[]
): SheetRow {
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
  };
}

function isBlankRow(row: SheetRow) {
  return (
    !String(row.sku || "").trim() &&
    !String(row.name || "").trim() &&
    !String(row.type || "").trim() &&
    !String(row.supplierId || "").trim() &&
    !String(row.categoryId || "").trim() &&
    !String(row.subCategoryId || "").trim() &&
    !String(row.purchaseTaxId || "").trim() &&
    !String(row.costPrice || "").trim() &&
    !String(row.manualSalePrice || "").trim() &&
    !String(row.pricingModel || "").trim() &&
    !String(row.pricingSpecId || "").trim() &&
    !String(row.moqPrice || "").trim() &&
    !String(row.margin || "").trim() &&
    !String(row.transferPct || "").trim() &&
    !row.stockTrackingEnabled &&
    !row.batchTrackingEnabled
  );
}

const parseNumber = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

const parseMoney = (value: string) => {
  const raw = String(value || "").replace(/[$,]/g, "").trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

const parsePercent = (value: string) => {
  const raw = String(value || "").replace(/[%]/g, "").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return num > 1 ? num / 100 : num;
};

const pricingModelOptions = [
  { value: "", label: "" },
  { value: "COST_PLUS_MARGIN", label: "Cost + Margin" },
  { value: "COST_PLUS_FIXED_SELL", label: "Cost + Fixed Sell" },
  { value: "TIERED_COST_PLUS_MARGIN", label: "Tiered Cost + Margin" },
  { value: "TIERED_COST_PLUS_FIXED_SELL", label: "Tiered Cost + Fixed Sell" },
  { value: "CURVE_SELL_AT_MOQ", label: "Curve (Sell at MOQ)" },
];

export default function ProductsBatchSheetGlide() {
  const loaderData = useLoaderData<{
    mode: "create" | "edit";
    rows: SheetRow[];
    metadataDefinitions: ProductAttributeDefinition[];
    pricingSpecOptions: Choice[];
  }>();
  const mode = loaderData?.mode ?? "edit";
  const metadataDefinitions = loaderData?.metadataDefinitions || [];
  const pricingSpecOptions = loaderData?.pricingSpecOptions || [];
  const options = useOptions();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const { ref: gridRef, width: gridWidth, height: gridHeight } =
    useElementSize();
  const { colorScheme } = useMantineColorScheme();
  const mantineTheme = useMantineTheme();
  const [dropdownRenderer, setDropdownRenderer] = useState<any>(null);
  const historyRef = useRef<{ past: PatchBatch[]; future: PatchBatch[] }>({
    past: [],
    future: [],
  });

  useEffect(() => {
    let mounted = true;
    import("@glideapps/glide-data-grid-cells")
      .then((mod) => {
        if (!mounted) return;
        setDropdownRenderer(() => mod.DropdownCell);
      })
      .catch(() => {
        // ignore missing optional renderer
      });
    return () => {
      mounted = false;
    };
  }, []);

  useSheetDirtyPrompt();
  const viewSpecBase = productSpec.sheet?.views["batch"];
  if (!viewSpecBase) {
    throw new Error("Missing product sheet spec: batch");
  }
  const viewSpec = useMemo(
    () => buildProductBatchSheetViewSpec(metadataDefinitions),
    [metadataDefinitions]
  );
  const columnSelection = useSheetColumnSelection({
    moduleKey: "products",
    viewId: viewSpec.id,
    scope: "index",
    viewSpec,
  });

  const columnMetaByKey = useMemo(() => {
    return new Map(viewSpec.columns.map((col) => [col.key, col]));
  }, [viewSpec.columns]);

  const selectedColumns = columnSelection.selectedColumns.length
    ? columnSelection.selectedColumns
    : viewSpec.defaultColumns.length
    ? viewSpec.columns.filter((col) => viewSpec.defaultColumns.includes(col.key))
    : viewSpec.columns;
  const visibleColumns = useMemo(
    () =>
      selectedColumns.filter(
        (col) => !(mode !== "edit" && col.key === "id")
      ),
    [mode, selectedColumns]
  );

  const widthStorageKey = `axis:sheet-columns-widths:v1:products:${viewSpec.id}:index`;
  const { widthsByKey, setWidthsByKey } = useColumnWidths(widthStorageKey);

  const initialRows = useMemo(() => loaderData?.rows || [], [loaderData]);
  const initialLines = useMemo<LineRow[]>(() => {
    return initialRows
      .filter((row) => row.id != null && row.id !== "")
      .map((row) => ({
        ...(row as SheetRow),
        kind: "line",
        rowId: buildRowId({ id: row.id }),
      }));
  }, [initialRows]);
  const initialDrafts = useMemo<DraftRow[]>(() => {
    return initialRows
      .filter((row) => row.id == null || row.id === "")
      .map((row) => {
        const draftId = createDraftId();
        return {
          ...(row as SheetRow),
          kind: "draft",
          draftId,
          rowId: buildRowId({ draftId }),
        };
      });
  }, [initialRows]);

  const [gridState, setGridState] = useState<{
    lines: LineRow[];
    drafts: DraftRow[];
  }>(() => ({
    lines: initialLines,
    drafts: initialDrafts,
  }));

  useEffect(() => {
    setGridState({ lines: initialLines, drafts: initialDrafts });
  }, [initialDrafts, initialLines]);

  const normalizeDraftRows = useCallback(
    (drafts: DraftRow[], lineCount: number) => {
      const createDraft = () => {
        const base = createBlankRow(metadataDefinitions);
        const draftId = createDraftId();
        return {
          ...base,
          kind: "draft",
          draftId,
          rowId: buildRowId({ draftId }),
        } as DraftRow;
      };
      return normalizeTrailingDrafts(
        drafts,
        isBlankRow,
        createDraft,
        DEFAULT_MIN_ROWS,
        lineCount
      );
    },
    [metadataDefinitions]
  );

  const normalizedDrafts = useMemo(
    () => normalizeDraftRows(gridState.drafts, gridState.lines.length),
    [gridState.drafts, gridState.lines.length, normalizeDraftRows]
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

  const resolveDropdownLabel = useCallback(
    (value: string, options: Array<{ label: string; value: string }>) => {
      const match = options.find((opt) => opt.value === value);
      return match?.label ?? value ?? "";
    },
    []
  );

  const resolveDropdownValue = useCallback(
    (value: string, options: Array<{ label: string; value: string }>) => {
      const raw = String(value ?? "").trim();
      if (!raw) return "";
      const matchByValue = options.find(
        (opt) => String(opt.value).toLowerCase() === raw.toLowerCase()
      );
      if (matchByValue) return matchByValue.value;
      const matchByLabel = options.find(
        (opt) => String(opt.label).toLowerCase() === raw.toLowerCase()
      );
      return matchByLabel?.value ?? raw;
    },
    []
  );

  const supplierOptions = useMemo(() => {
    const opts = options?.supplierOptions || [];
    return [{ label: "", value: "" }].concat(
      opts.map((opt) => ({
        label: opt.label,
        value: String(opt.value),
      }))
    );
  }, [options?.supplierOptions]);

  const taxOptions = useMemo(() => {
    const opts = options?.taxCodeOptions || [];
    return [{ label: "", value: "" }].concat(
      opts.map((opt) => ({
        label: opt.label,
        value: String(opt.value),
      }))
    );
  }, [options?.taxCodeOptions]);

  const pricingSpecChoices = useMemo(() => {
    return [{ label: "", value: "" }].concat(
      pricingSpecOptions.map((opt) => ({
        label: opt.label,
        value: String(opt.value),
      }))
    );
  }, [pricingSpecOptions]);

  const categoryOptionsByType = useCallback(
    (row: SheetRow) => {
      const categoryOptions = options?.categoryOptions || [];
      const byGroup = options?.categoryOptionsByGroupCode || {};
      const meta = options?.categoryMetaById || {};
      const group =
        rulesForType(String(row?.type || "").trim())
          .categoryGroupCode?.toUpperCase() || "";
      if (group && byGroup[group]?.length) {
        return byGroup[group].map((opt) => ({
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
      if (Object.keys(meta).length) {
        return categoryOptions
          .filter((opt) => {
            const metaRow = meta[String(opt.value)];
            const parent = String(metaRow?.parentCode || "").toUpperCase();
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
    [
      options?.categoryOptions,
      options?.categoryOptionsByGroupCode,
      options?.categoryMetaById,
    ]
  );

  const enumOptionsByKey = useMemo(() => {
    const map = new Map<string, Array<{ label: string; value: string }>>();
    metadataDefinitions.forEach((def) => {
      const key = buildProductMetadataColumnKey(def.key);
      if (def.dataType === "ENUM") {
        const options =
          Array.isArray(def.options) && def.options.length
            ? def.options.map((opt) => ({
                value: String(opt.id),
                label: opt.label,
              }))
            : normalizeEnumOptions(def.enumOptions);
        map.set(
          key,
          [{ label: "", value: "" }].concat(
            options.map((opt) => ({
              value: String(opt.value),
              label: opt.label,
            }))
          )
        );
      } else if (def.dataType === "BOOLEAN") {
        map.set(key, [
          { value: "", label: "" },
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]);
      }
    });
    return map;
  }, [metadataDefinitions]);

  const isEditableCell = useCallback((key: string, row: SheetRow) => {
    if (!PRIMARY_COLUMNS.has(key) && !key.startsWith("meta:")) return false;
    if (key === "id") return false;
    const columnMeta = columnMetaByKey.get(key);
    if (columnMeta?.isApplicable && !columnMeta.isApplicable(row as any))
      return false;
    if (key === "supplierId") {
      const type = String(row?.type || "").trim();
      if (!type) return true;
      return rulesForType(type).showSupplier;
    }
    return true;
  }, [columnMetaByKey]);

  const columns = useMemo<GridColumn[]>(() => {
    return visibleColumns.map((col) => ({
      id: col.key,
      title: col.label,
      width: widthsByKey[col.key] ?? col.baseWidthPx ?? 140,
    }));
  }, [visibleColumns, widthsByKey]);

  const applySnapshots = useCallback((snapshots: RowSnapshot[]) => {
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
      nextDrafts = normalizeDraftRows(nextDrafts, nextLines.length);
      return { lines: nextLines, drafts: nextDrafts };
    });
  }, [normalizeDraftRows]);

  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    const batch = history.past.pop();
    if (!batch) return;
    history.future.push(batch);
    applySnapshots(batch.before);
  }, [applySnapshots]);

  const handleRedo = useCallback(() => {
    const history = historyRef.current;
    const batch = history.future.pop();
    if (!batch) return;
    history.past.push(batch);
    applySnapshots(batch.after);
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
      patches: Array<{ rowId: string; patch: Partial<SheetRow> }>,
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
            beforeSnapshots.push({ rowId, kind: "line", row: prevRow });
            afterSnapshots.push({ rowId, kind: "line", row: nextRow });
            nextLines[idx] = nextRow;
          } else {
            const idx = nextDrafts.findIndex((row) => row.rowId === rowId);
            if (idx < 0) return;
            const prevRow = nextDrafts[idx];
            const nextRow = { ...prevRow, ...patch };
            beforeSnapshots.push({ rowId, kind: "draft", row: prevRow });
            afterSnapshots.push({ rowId, kind: "draft", row: nextRow });
            const copy = nextDrafts.slice();
            copy[idx] = nextRow;
            nextDrafts = copy;
          }
        });

        nextDrafts = normalizeDraftRows(nextDrafts, nextLines.length);
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
    [normalizeDraftRows]
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
      const isEditable = isEditableCell(key, rowData);
      const rawValue = (rowData as any)[key];
      if (key === "stockTrackingEnabled" || key === "batchTrackingEnabled") {
        return {
          kind: GridCellKind.Boolean,
          data: Boolean(rawValue),
          readonly: !isEditable,
          allowOverlay: isEditable,
        } as GridCell;
      }
      if (
        key === "supplierId" ||
        key === "purchaseTaxId" ||
        key === "pricingModel" ||
        key === "pricingSpecId" ||
        key === "categoryId" ||
        key === "subCategoryId" ||
        key.startsWith("meta:")
      ) {
        const baseOptions =
          key === "supplierId"
            ? supplierOptions
            : key === "purchaseTaxId"
            ? taxOptions
            : key === "pricingModel"
            ? pricingModelOptions
            : key === "pricingSpecId"
            ? pricingSpecChoices
            : key === "categoryId" || key === "subCategoryId"
            ? categoryOptionsByType(rowData)
            : enumOptionsByKey.get(key) || [{ label: "", value: "" }];
        const value = resolveText(rawValue);
        const label = resolveDropdownLabel(value, baseOptions);
        if (dropdownRenderer) {
          return {
            kind: GridCellKind.Custom,
            allowOverlay: isEditable,
            readonly: !isEditable,
            copyData: label,
            data: {
              kind: "dropdown-cell",
              allowedValues: baseOptions,
              value,
            },
          } as GridCell;
        }
        return {
          kind: GridCellKind.Text,
          data: label,
          displayData: label,
          allowOverlay: false,
          readonly: true,
        } as GridCell;
      }
      if (key === "costPrice" || key === "manualSalePrice" || key === "moqPrice") {
        const display = formatUSD(rawValue);
        return {
          kind: GridCellKind.Text,
          data: display,
          displayData: display,
          allowOverlay: isEditable,
          readonly: !isEditable,
        } as GridCell;
      }
      if (key === "transferPct") {
        const num = Number(rawValue);
        const display =
          Number.isFinite(num) && rawValue !== ""
            ? `${(num * 100).toFixed(2)}%`
            : "";
        return {
          kind: GridCellKind.Text,
          data: display,
          displayData: display,
          allowOverlay: isEditable,
          readonly: !isEditable,
        } as GridCell;
      }
      return {
        kind: GridCellKind.Text,
        data: resolveText(rawValue),
        displayData: resolveText(rawValue),
        allowOverlay: isEditable,
        readonly: !isEditable,
      } as GridCell;
    },
    [
      categoryOptionsByType,
      columns,
      dropdownRenderer,
      enumOptionsByKey,
      isEditableCell,
      pricingSpecChoices,
      supplierOptions,
      taxOptions,
      visibleRows,
    ]
  );

  const onCellEdited = useCallback(
    ([col, row]: readonly [number, number], newValue: any) => {
      const column = columns[col];
      const rowData = visibleRows[row];
      if (!column || !rowData) return;
      const key = String(column.id);
      if (!isEditableCell(key, rowData)) return;
      let value: any =
        newValue?.kind === GridCellKind.Custom &&
        newValue?.data?.kind === "dropdown-cell"
          ? String(newValue.data.value ?? "")
          : String(newValue?.data ?? newValue?.value ?? "");
      if (key === "stockTrackingEnabled" || key === "batchTrackingEnabled") {
        value = Boolean(newValue?.data ?? newValue?.value);
      } else if (
        key === "supplierId" ||
        key === "purchaseTaxId" ||
        key === "pricingModel" ||
        key === "pricingSpecId" ||
        key === "categoryId" ||
        key === "subCategoryId" ||
        key.startsWith("meta:")
      ) {
        const options =
          key === "supplierId"
            ? supplierOptions
            : key === "purchaseTaxId"
            ? taxOptions
            : key === "pricingModel"
            ? pricingModelOptions
            : key === "pricingSpecId"
            ? pricingSpecChoices
            : key === "categoryId" || key === "subCategoryId"
            ? categoryOptionsByType(rowData)
            : enumOptionsByKey.get(key) || [{ label: "", value: "" }];
        value = resolveDropdownValue(value, options);
      } else if (
        key === "costPrice" ||
        key === "manualSalePrice" ||
        key === "moqPrice"
      ) {
        value = parseMoney(value);
      } else if (key === "transferPct") {
        value = parsePercent(value);
      } else if (key === "margin") {
        value = parseNumber(value);
      }
      applyUserPatches([{ rowId: rowData.rowId, patch: { [key]: value } }]);
    },
    [
      applyUserPatches,
      categoryOptionsByType,
      columns,
      enumOptionsByKey,
      isEditableCell,
      pricingSpecChoices,
      resolveDropdownValue,
      supplierOptions,
      taxOptions,
      visibleRows,
    ]
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
      const updates: Array<{ rowId: string; patch: Partial<SheetRow> }> = [];
      const extraDrafts: DraftRow[] = [];
      const rowsSnapshot = visibleRows.slice();
      for (let rowOffset = 0; rowOffset < values.length; rowOffset += 1) {
        const targetRowIdx = startRow + rowOffset;
        let rowData = rowsSnapshot[targetRowIdx];
        if (!rowData) {
          const base = createBlankRow(metadataDefinitions);
          const draftId = createDraftId();
          rowData = {
            ...base,
            kind: "draft",
            draftId,
            rowId: buildRowId({ draftId }),
          } as DraftRow;
          extraDrafts.push(rowData);
          rowsSnapshot.push(rowData);
        }
        for (let colOffset = 0; colOffset < values[rowOffset].length; colOffset += 1) {
          const colIdx = startCol + colOffset;
          const column = columns[colIdx];
          if (!column) continue;
          const key = String(column.id);
          if (!isEditableCell(key, rowData)) continue;
          const raw = String(values[rowOffset][colOffset] ?? "");
          let value: any = raw;
          if (
            key === "supplierId" ||
            key === "purchaseTaxId" ||
            key === "pricingModel" ||
            key === "pricingSpecId" ||
            key === "categoryId" ||
            key === "subCategoryId" ||
            key.startsWith("meta:")
          ) {
            const options =
              key === "supplierId"
                ? supplierOptions
                : key === "purchaseTaxId"
                ? taxOptions
                : key === "pricingModel"
                ? pricingModelOptions
                : key === "pricingSpecId"
                ? pricingSpecChoices
                : key === "categoryId" || key === "subCategoryId"
                ? categoryOptionsByType(rowData)
                : enumOptionsByKey.get(key) || [{ label: "", value: "" }];
            value = resolveDropdownValue(raw, options);
          } else if (
            key === "costPrice" ||
            key === "manualSalePrice" ||
            key === "moqPrice"
          ) {
            value = parseMoney(raw);
          } else if (key === "transferPct") {
            value = parsePercent(raw);
          } else if (key === "margin") {
            value = parseNumber(raw);
          } else if (
            key === "stockTrackingEnabled" ||
            key === "batchTrackingEnabled"
          ) {
            value = raw.toLowerCase() === "true" || raw === "1" || raw === "yes";
          }
          updates.push({
            rowId: rowData.rowId,
            patch: { [key]: value },
          });
        }
      }
      if (updates.length) {
        applyUserPatches(updates, { extraDrafts });
      }
      return true;
    },
    [
      applyUserPatches,
      categoryOptionsByType,
      columns,
      enumOptionsByKey,
      isEditableCell,
      metadataDefinitions,
      pricingSpecChoices,
      resolveDropdownValue,
      supplierOptions,
      taxOptions,
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
      for (
        let rowIdx = patternSource.y;
        rowIdx < patternSource.y + patternSource.height;
        rowIdx += 1
      ) {
        const rowData = rowsSnapshot[rowIdx];
        if (!rowData || rowData.kind === "header") return;
      }
      for (
        let rowIdx = fillDestination.y;
        rowIdx < fillDestination.y + fillDestination.height;
        rowIdx += 1
      ) {
        const rowData = rowsSnapshot[rowIdx];
        if (!rowData || rowData.kind === "header") return;
      }
      const patchesByRow = new Map<string, Partial<SheetRow>>();
      for (
        let rowOffset = 0;
        rowOffset < fillDestination.height;
        rowOffset += 1
      ) {
        const targetRowIdx = fillDestination.y + rowOffset;
        const targetRow = rowsSnapshot[targetRowIdx];
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
          if (!isEditableCell(targetKey, targetRow)) continue;
          const sourceRowIdx =
            patternSource.y + (rowOffset % patternSource.height);
          const sourceColIdx =
            patternSource.x + (colOffset % patternSource.width);
          const sourceRow = rowsSnapshot[sourceRowIdx];
          const sourceColumn = columns[sourceColIdx];
          if (!sourceRow || !sourceColumn) continue;
          const sourceKey = String(sourceColumn.id);
          if (!isEditableCell(sourceKey, sourceRow)) continue;
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
        setGridState({ lines: initialLines, drafts: initialDrafts });
        historyRef.current = { past: [], future: [] };
        setIsDirty(false);
      },
      formState: { isDirty },
    }),
    [initialDrafts, initialLines, isDirty]
  );

  useInitGlobalFormContext(formHandlers as any, async () => {
    setSaving(true);
    try {
      const rowsForSave = [...gridState.lines, ...gridState.drafts];
      const payload = {
        _intent: mode === "edit" ? "product.batchSaveRows" : "product.batchCreate",
        rows: rowsForSave.map((row) => {
          const { kind, rowId, draftId, ...rest } = row as any;
          return rest;
        }),
      };
      const resp = await fetch("/products/batch/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        return;
      }
      setIsDirty(false);
      navigate("/products");
    } finally {
      setSaving(false);
    }
  }, formHandlers.reset);

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
        entity: { type: "batchSheet", id: "batch" },
        generatedAt: new Date().toISOString(),
        version: "products-batch-glide",
      },
      inputs: {
        params: {},
        flags: [],
      },
      derived: {
        rowsCount: gridState.lines.length + gridState.drafts.length,
        visibleRowsCount: visibleRows.length,
        columnKeys: visibleColumns.map((col) => col.key),
        widthsByKey,
        themeTokens: IS_DEV ? themeTokens : undefined,
      },
      reasoning: [],
    };
  }, [
    gridState.drafts.length,
    gridState.lines.length,
    themeTokens,
    visibleColumns,
    visibleRows.length,
    widthsByKey,
  ]);

  return (
    <SheetShell
      title="Batch Edit Products"
      backTo="/products"
      saveState={saving ? "saving" : "idle"}
      debugPayload={debugPayload}
      columnPicker={{
        moduleKey: "products",
        viewId: viewSpec.id,
        scope: "index",
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
