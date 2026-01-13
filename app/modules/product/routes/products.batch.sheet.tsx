import { json } from "@remix-run/node";
import { SheetShell } from "~/components/sheets/SheetShell";
import { notifications } from "@mantine/notifications";
import { useInitGlobalFormContext } from "@aa/timber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Column } from "react-datasheet-grid";
import * as RDG from "react-datasheet-grid";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useElementSize } from "@mantine/hooks";
import { useOptions } from "~/base/options/OptionsContext";
import { DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";
import {
  guardColumnsWithDisableControls,
  guardColumnsWithApplicability,
  padRowsWithDisableControls,
} from "~/components/sheets/disableControls";
import { useDataGrid } from "~/components/sheets/useDataGrid";
import {
  useSheetDirtyPrompt,
} from "~/components/sheets/SheetControls";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { SheetGrid } from "~/components/sheets/SheetGrid";
import { adaptDataGridController } from "~/components/sheets/SheetController";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { productSpec } from "~/modules/product/spec";
import {
  buildProductBatchSheetViewSpec,
  buildProductMetadataColumnKey,
} from "~/modules/product/spec/sheets";
import { normalizeEnumOptions } from "~/modules/productMetadata/utils/productMetadataFields";
import type { ProductAttributeDefinition } from "~/modules/productMetadata/types/productMetadata";
import { formatUSD } from "~/utils/format";
import { mantineSelectColumn } from "~/components/sheets/mantineSelectColumn";
import { rulesForType } from "~/modules/product/rules/productTypeRules";
import { computeSheetColumnWidths } from "~/components/sheets/computeSheetColumnWidths";

export async function loader({ request }: any) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  const { prismaBase } = await import("~/utils/prisma.server");
  const { getAllProductAttributeDefinitions } = await import(
    "~/modules/productMetadata/services/productMetadata.server"
  );
  const [metadataDefinitions, pricingSpecs] = await Promise.all([
    getAllProductAttributeDefinitions(),
    prismaBase.pricingSpec.findMany({
      select: { id: true, name: true, code: true, curveFamily: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const pricingSpecOptions = pricingSpecs.map((spec) => ({
    value: String(spec.id),
    label: spec.name || spec.code || spec.curveFamily || `#${spec.id}`,
  }));
  if (!ids.length) {
    return json({
      mode: "create",
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
  const metadataValues = await prismaBase.productAttributeValue.findMany({
    where: { productId: { in: ids } },
    include: {
      definition: { select: { key: true, dataType: true } },
      option: { select: { mergedIntoId: true, isArchived: true } },
    },
  });
  const metadataByProductId = new Map<number, Record<string, any>>();
  for (const row of metadataValues) {
    const key = (row as any)?.definition?.key;
    if (!key) continue;
    const dt = (row as any)?.definition?.dataType;
    let value: any = null;
    if (dt === "NUMBER") value = row.valueNumber;
    else if (dt === "BOOLEAN") value = row.valueBool;
    else if (dt === "JSON") value = row.valueJson ?? row.valueString;
    else if (dt === "ENUM") {
      const mergedIntoId = (row as any)?.option?.mergedIntoId ?? null;
      const isArchived = Boolean((row as any)?.option?.isArchived);
      if (mergedIntoId) value = mergedIntoId;
      else if (isArchived) value = null;
      else value = (row as any).optionId ?? row.valueString ?? null;
    } else value = row.valueString ?? null;
    const productId = row.productId;
    const bucket = metadataByProductId.get(productId) || {};
    bucket[key] = value;
    metadataByProductId.set(productId, bucket);
  }
  const rows = products.map((p) => {
    const metaValues = metadataByProductId.get(p.id) || {};
    const metaFields: Record<string, any> = {};
    for (const def of metadataDefinitions) {
      const raw = metaValues[def.key];
      let value: any = raw;
      if (def.dataType === "BOOLEAN") {
        if (raw == null || raw === "") value = null;
        else value = raw ? "true" : "false";
      } else if (def.dataType === "ENUM") {
        if (raw == null || raw === "") value = null;
        else value = String(raw);
      } else if (def.dataType === "JSON") {
        if (raw == null) value = null;
        else if (typeof raw === "string") value = raw;
        else value = JSON.stringify(raw);
      }
      metaFields[buildProductMetadataColumnKey(def.key)] = value ?? "";
    }
    return {
    id: p.id,
    sku: p.sku || "",
    name: p.name || "",
    type: (p as any).type || "",
    supplierId: p.supplierId != null ? String(p.supplierId) : "",
    categoryId: p.categoryId != null ? String(p.categoryId) : "",
    subCategoryId: p.subCategoryId != null ? String(p.subCategoryId) : "",
    purchaseTaxId: p.purchaseTaxId != null ? String(p.purchaseTaxId) : "",
    costPrice: (p.costPrice as any) ?? "",
    manualSalePrice: (p.manualSalePrice as any) ?? "",
    pricingModel: p.pricingModel ?? "",
    pricingSpecId: p.pricingSpecId != null ? String(p.pricingSpecId) : "",
    moqPrice: (p.baselinePriceAtMoq as any) ?? "",
    margin: (p.manualMargin as any) ?? "",
    transferPct: (p.transferPercent as any) ?? "",
    stockTrackingEnabled: !!p.stockTrackingEnabled,
    batchTrackingEnabled: !!p.batchTrackingEnabled,
    disableControls: false,
      ...metaFields,
    };
  });
  return json({
    mode: "edit",
    rows,
    metadataDefinitions,
    pricingSpecOptions,
  });
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
export default function ProductsBatchCreateFullzoom() {
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
  // Ensure active cell edits are committed before saving
  const gridRef = useRef<RDG.DataSheetGridRef>(null as any);
  const { ref: gridContainerRef, width: gridContainerWidth } =
    useElementSize();
  const [mode] = useState<"create" | "edit">(loaderData?.mode || "create");
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
  // Row factory (hoisted via function declaration to allow early use)
  function createRow(): SheetRow {
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
  // Data grid state & helpers
  const dataGrid = useDataGrid<SheetRow>({
    initialData: loaderData?.rows || [],
    getRowId: (r) => (r as any)?.id,
    createRow,
    lockRows: true, // prevent accidental add/delete in batch edit flow
  });
  const sheetController = adaptDataGridController(dataGrid);
  useEffect(() => {
    sheetController.state = { isDirty: dirty };
  }, [sheetController, dirty]);

  // Derived rows used for rendering (padded to minimum rows)
  const displayRows = useMemo(
    () =>
      padRowsWithDisableControls(
        dataGrid.value,
        DEFAULT_MIN_ROWS,
        () => createRow(),
        { extraInteractiveRows: 0 }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataGrid.value]
  );

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

  const sheetColumns = useMemo<Column<SheetRow>[]>(() => {
    const nullableTextColumn = {
      ...(RDG.textColumn as any),
      deleteValue: () => null,
      copyValue: ({ rowData }: any) => (rowData == null ? "" : String(rowData)),
      pasteValue: ({ value }: any) => {
        const v = value == null ? "" : String(value);
        return v.trim() === "" ? null : v;
      },
    } as any;
    const nullableNumberColumn = {
      ...(RDG.textColumn as any),
      deleteValue: () => null,
      copyValue: ({ rowData }: any) =>
        rowData == null || rowData === "" ? "" : String(rowData),
      pasteValue: ({ value }: any) => {
        const raw = value == null ? "" : String(value).trim();
        if (raw === "") return null;
        const num = Number(raw);
        return Number.isFinite(num) ? num : null;
      },
    } as any;
    const moneyColumn = RDG.createTextColumn({
      deletedValue: null,
      parseUserInput: (value: string) => {
        const raw = String(value || "").replace(/[$,]/g, "").trim();
        if (!raw) return null as any;
        const num = Number(raw);
        return Number.isFinite(num) ? num : null;
      },
      formatBlurredInput: (value: any) => {
        const num = Number(value);
        return Number.isFinite(num) ? formatUSD(num) : "";
      },
      formatInputOnFocus: (value: any) =>
        value == null || value === "" ? "" : String(value),
      formatForCopy: (value: any) =>
        value == null || value === "" ? "" : String(value),
      parsePastedValue: (value: string) => {
        const raw = String(value || "").replace(/[$,]/g, "").trim();
        if (!raw) return null as any;
        const num = Number(raw);
        return Number.isFinite(num) ? num : null;
      },
    } as any);
    const percentColumn = RDG.createTextColumn({
      deletedValue: null,
      parseUserInput: (value: string) => {
        const raw = String(value || "").replace(/[%]/g, "").trim();
        if (!raw) return null as any;
        const num = Number(raw);
        if (!Number.isFinite(num)) return null as any;
        return num > 1 ? num / 100 : num;
      },
      formatBlurredInput: (value: any) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return "";
        return `${(num * 100).toFixed(2)}%`;
      },
      formatInputOnFocus: (value: any) =>
        value == null || value === "" ? "" : String(value),
      formatForCopy: (value: any) =>
        value == null || value === "" ? "" : String(value),
      parsePastedValue: (value: string) => {
        const raw = String(value || "").replace(/[%]/g, "").trim();
        if (!raw) return null as any;
        const num = Number(raw);
        if (!Number.isFinite(num)) return null as any;
        return num > 1 ? num / 100 : num;
      },
    } as any);
    const col = <K extends keyof SheetRow>(
      key: K,
      title: string,
      disabled = false
    ): Column<SheetRow> => ({
      ...((RDG.keyColumn as any)(key as any, RDG.textColumn) as any),
      id: key as string,
      title,
      disabled,
    });
    const supplierOptions = options?.supplierOptions || [];
    const categoryOptions = options?.categoryOptions || [];
    const categoryOptionsByGroupCode = options?.categoryOptionsByGroupCode || {};
    const categoryMetaById = options?.categoryMetaById || {};
    const taxOptions = options?.taxCodeOptions || [];
    const base: Column<SheetRow>[] = [
      col("sku", "SKU"),
      col("name", "Name"),
      col("type", "Type"),
      // Supplier select by name
      mantineSelectColumn<SheetRow>({
        key: "supplierId",
        title: "Supplier",
        options: supplierOptions.map((o) => ({
          label: o.label,
          value: String(o.value),
        })),
        searchable: true,
        clearable: true,
      }),
      // Category select by name
      mantineSelectColumn<SheetRow>({
        key: "categoryId",
        title: "Category",
        getOptions: (row) => {
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
        searchable: true,
        clearable: true,
      }),
      // Tax select by name
      mantineSelectColumn<SheetRow>({
        key: "purchaseTaxId",
        title: "Tax",
        options: taxOptions.map((o) => ({
          label: o.label,
          value: String(o.value),
        })),
        searchable: true,
        clearable: true,
      }),
      // Price fields: use nullable text column so Delete and empty paste become null
      {
        ...((RDG.keyColumn as any)(
          "costPrice" as any,
          moneyColumn
        ) as any),
        id: "costPrice",
        title: "Cost",
      } as any,
      {
        ...((RDG.keyColumn as any)(
          "manualSalePrice" as any,
          moneyColumn
        ) as any),
        id: "manualSalePrice",
        title: "Sell",
      } as any,
      // Pricing fields
      mantineSelectColumn<SheetRow>({
        key: "pricingModel",
        title: "Pricing Model",
        options: pricingModelOptions,
        searchable: true,
        clearable: true,
      }),
      mantineSelectColumn<SheetRow>({
        key: "pricingSpecId",
        title: "Pricing Spec",
        options: pricingSpecOptions,
        searchable: true,
        clearable: true,
      }),
      {
        ...((RDG.keyColumn as any)(
          "moqPrice" as any,
          moneyColumn
        ) as any),
        id: "moqPrice",
        title: "MOQ Price",
      } as any,
      {
        ...((RDG.keyColumn as any)(
          "margin" as any,
          nullableNumberColumn
        ) as any),
        id: "margin",
        title: "Margin",
      } as any,
      {
        ...((RDG.keyColumn as any)(
          "transferPct" as any,
          percentColumn
        ) as any),
        id: "transferPct",
        title: "Transfer %",
      } as any,
      // Booleans as checkboxes
      {
        ...((RDG.keyColumn as any)(
          "stockTrackingEnabled" as any,
          RDG.checkboxColumn
        ) as any),
        id: "stockTrackingEnabled",
        title: "Stock",
      } as any,
      {
        ...((RDG.keyColumn as any)(
          "batchTrackingEnabled" as any,
          RDG.checkboxColumn
        ) as any),
        id: "batchTrackingEnabled",
        title: "Batch",
      } as any,
    ];
    const metadataColumns: Column<SheetRow>[] = metadataDefinitions.map((def) => {
      const key = buildProductMetadataColumnKey(def.key);
      if (def.dataType === "ENUM") {
        const choices =
          Array.isArray(def.options) && def.options.length
            ? def.options.map((opt) => ({
                value: String(opt.id),
                label: opt.label,
              }))
            : normalizeEnumOptions(def.enumOptions);
        return mantineSelectColumn<SheetRow>({
          key,
          title: def.label || def.key,
          options: choices as any,
          searchable: true,
          clearable: true,
        });
      }
      if (def.dataType === "BOOLEAN") {
        return mantineSelectColumn<SheetRow>({
          key,
          title: def.label || def.key,
          options: [
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ],
          searchable: false,
          clearable: true,
        });
      }
      const baseColumn =
        def.dataType === "NUMBER"
          ? nullableNumberColumn
          : def.dataType === "JSON"
          ? { ...(RDG.textColumn as any), disabled: true }
          : RDG.textColumn;
      return {
        ...((RDG.keyColumn as any)(key as any, baseColumn) as any),
        id: key,
        title: def.label || def.key,
        disabled: def.dataType === "JSON",
      } as any;
    });
    const columns = mode === "edit" ? [col("id", "ID", true), ...base] : base;
    const guarded = guardColumnsWithDisableControls([
      ...columns,
      ...metadataColumns,
    ]);
    const applicable = guardColumnsWithApplicability(guarded, viewSpec.columns);
    const byKey = new Map(
      applicable.map((column) => [String(column.id), column])
    );
    const ordered = columnSelection.selectedKeys
      .map((key) => byKey.get(key))
      .filter(Boolean) as Column<SheetRow>[];
    return ordered.map((column) => {
      const key = String(column.id);
      const width = widthByKey[key];
      return {
        ...column,
        width: typeof width === "number" ? width : column.width,
      };
    });
  }, [
    mode,
    options?.supplierOptions,
    options?.categoryOptions,
    options?.categoryOptionsByGroupCode,
    options?.categoryMetaById,
    options?.taxCodeOptions,
    columnSelection.selectedKeys,
    viewSpec.columns,
    pricingSpecOptions,
    pricingModelOptions,
    metadataDefinitions,
    widthByKey,
  ]);

  const reset = useCallback(() => {
    dataGrid.reset();
    setDirty(false);
    originalRef.current = [];
  }, [dataGrid]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      // Commit any active editor so onChange applies pending edits
      try {
        // @ts-ignore - stopEditing signature may vary across versions
        gridRef.current?.stopEditing?.({ nextRow: false });
      } catch {}
      // Allow onChange to propagate state updates (microtask + a frame)
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      // Use the latest rows snapshot from dataGrid, excluding soft-deleted rows
      const currentRows = dataGrid.getValues();
      const selectedMetaKeys = new Set(
        columnSelection.selectedKeys.filter((key) => key.startsWith("meta:"))
      );
      const rowsForSave = currentRows.map((row) => {
        const next: Record<string, any> = { ...row };
        for (const key of Object.keys(next)) {
          if (!key.startsWith("meta:")) continue;
          if (!selectedMetaKeys.has(key)) delete next[key];
        }
        return next;
      });
      const payload =
        mode === "edit"
          ? { _intent: "product.batchSaveRows", rows: rowsForSave }
          : { _intent: "product.batchCreate", rows: rowsForSave };
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
        const createdCount =
          typeof (data as any)?.created === "number"
            ? (data as any).created
            : 0;
        notifications.show({
          color: "teal",
          title: mode === "edit" ? "Batch save" : "Batch create",
          message:
            mode === "edit"
              ? `Saved ${updatedCount} updated, ${createdCount} created`
              : `Created ${createdCount} products`,
        });
        setDirty(false);
        // Mark grid state committed to clear isDirty and delete markers
        dataGrid.commit();
        navigate("/products?refreshed=1");
      } else {
        notifications.show({
          color: "red",
          title: "Save failed",
          message: data?.error || "Could not create products.",
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
  }, [columnSelection.selectedKeys, dataGrid, mode, navigate]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset,
      formState: { isDirty: dirty },
    }),
    [dirty, reset]
  );
  useInitGlobalFormContext(formHandlers as any, () => save(), reset);

  // Initialize original ref when loader rows arrive
  useMemo(() => {
    originalRef.current = loaderData?.rows || [];
  }, [loaderData]);

  return (
    <SheetShell
      title={mode === "edit" ? "Batch Edit Products" : "Batch Create Products"}
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
    >
      {(gridHeight) => {
        return (
          <SheetFrame gridHeight={gridHeight}>
            {(bodyHeight) => (
              <div
                ref={gridContainerRef}
                style={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <SheetGrid
                  key={`cols:${columnSelection.selectedKeys.join("|")}`}
                  ref={gridRef as any}
                  controller={sheetController}
                  value={displayRows as any}
                  onChange={(r: SheetRow[]) => {
                    console.log("Rows changed", r);
                    dataGrid.onChange(r as any, (arguments as any)[1]);
                    setDirty(dataGrid.gridState.isDirty || true);
                  }}
                  columns={sheetColumns}
                  height={bodyHeight}
                  createRow={createRow}
                  lockRows={true}
                />
              </div>
            )}
          </SheetFrame>
        );
      }}
    </SheetShell>
  );
}
