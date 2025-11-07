import { json } from "@remix-run/node";
import { NativeSelect } from "@mantine/core";
import { FullzoomAppShell } from "~/components/sheets/FullzoomAppShell";
import { notifications } from "@mantine/notifications";
import { SaveCancelHeader, useInitGlobalFormContext } from "@aa/timber";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Column, CellProps } from "react-datasheet-grid";
import * as RDG from "react-datasheet-grid";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useOptions } from "~/base/options/OptionsContext";
import { padToMinRows, DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";
import { useDataGrid } from "~/components/sheets/useDataGrid";

export async function loader({ request }: any) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (!ids.length) return json({ mode: "create", rows: [] });
  const { prismaBase } = await import("~/utils/prisma.server");
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
      purchaseTaxId: true,
      costPrice: true,
      manualSalePrice: true,
      stockTrackingEnabled: true,
      batchTrackingEnabled: true,
    },
  });
  const rows = products.map((p) => ({
    id: p.id,
    sku: p.sku || "",
    name: p.name || "",
    type: (p as any).type || "",
    supplierId: p.supplierId != null ? String(p.supplierId) : "",
    categoryId: p.categoryId != null ? String(p.categoryId) : "",
    purchaseTaxId: p.purchaseTaxId != null ? String(p.purchaseTaxId) : "",
    costPrice: (p.costPrice as any) ?? "",
    manualSalePrice: (p.manualSalePrice as any) ?? "",
    stockTrackingEnabled: !!p.stockTrackingEnabled,
    batchTrackingEnabled: !!p.batchTrackingEnabled,
  }));
  return json({ mode: "edit", rows });
}
type Choice = { label: string; value: string };
type SheetRow = {
  id?: number | "";
  sku: string;
  name: string;
  type: string;
  supplierId?: string | number | "";
  categoryId?: string | number | "";
  purchaseTaxId?: string | number | "";
  costPrice?: number | string | "" | null;
  manualSalePrice?: number | string | "" | null;
  stockTrackingEnabled?: boolean;
  batchTrackingEnabled?: boolean;
};
export default function ProductsBatchCreateFullzoom() {
  const navigate = useNavigate();
  const loaderData = useLoaderData<{
    mode: "create" | "edit";
    rows: SheetRow[];
  }>();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const originalRef = useRef<SheetRow[]>([]);
  // Ensure active cell edits are committed before saving
  const gridRef = useRef<RDG.DataSheetGridRef>(null as any);
  const [mode] = useState<"create" | "edit">(loaderData?.mode || "create");
  const options = useOptions();
  // Row factory (hoisted via function declaration to allow early use)
  function createRow(): SheetRow {
    return {
      sku: "",
      name: "",
      type: "",
      supplierId: "",
      categoryId: "",
      purchaseTaxId: "",
      costPrice: "",
      manualSalePrice: "",
      stockTrackingEnabled: false,
      batchTrackingEnabled: false,
    };
  }
  // Data grid state & helpers
  const dataGrid = useDataGrid<SheetRow>({
    initialData: loaderData?.rows || [],
    getRowId: (r) => (r as any)?.id,
    createRow,
    lockRows: true, // prevent accidental add/delete in batch edit flow
  });

  // Derived rows used for rendering (padded to minimum rows)
  const displayRows = useMemo(
    () => padToMinRows(dataGrid.value, DEFAULT_MIN_ROWS, () => createRow()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataGrid.value]
  );

  type SelectOptions = { choices: Choice[]; disabled?: boolean };
  const MantineSelectCell = useMemo(
    () =>
      function MantineSelectCell(
        props: CellProps<string | null, SelectOptions>
      ) {
        const { rowData, setRowData, focus, stopEditing, columnData } = props;
        const value = rowData ?? "";
        return (
          <NativeSelect
            data={[{ label: "", value: "" }, ...(columnData?.choices || [])]}
            value={value}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setRowData(v === "" ? null : v);
              setTimeout(() => stopEditing({ nextRow: false }), 0);
            }}
            disabled={columnData?.disabled}
            style={{
              width: "100%",
              height: "100%",
              pointerEvents: focus ? undefined : "none",
            }}
          />
        );
      } as any,
    []
  );
  const buildSelectColumn = useCallback(
    (choices: Choice[]): any => ({
      component: MantineSelectCell,
      columnData: { choices },
      disableKeys: true,
      keepFocus: true,
      disabled: false,
      deleteValue: () => null,
      copyValue: ({ rowData }: any) =>
        choices.find((c) => c.value === rowData)?.label ?? null,
      pasteValue: ({ value }: any) =>
        choices.find((c) => c.label === value)?.value ?? null,
    }),
    [MantineSelectCell]
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
    const taxOptions = options?.taxCodeOptions || [];
    const base: Column<SheetRow>[] = [
      col("sku", "SKU"),
      col("name", "Name"),
      col("type", "Type"),
      // Supplier select by name
      {
        ...((RDG.keyColumn as any)(
          "supplierId" as any,
          buildSelectColumn(
            supplierOptions.map((o) => ({
              label: o.label,
              value: String(o.value),
            }))
          )
        ) as any),
        id: "supplierId",
        title: "Supplier",
      } as any,
      // Category select by name
      {
        ...((RDG.keyColumn as any)(
          "categoryId" as any,
          buildSelectColumn(
            categoryOptions.map((o) => ({
              label: o.label,
              value: String(o.value),
            }))
          )
        ) as any),
        id: "categoryId",
        title: "Category",
      } as any,
      // Tax select by name
      {
        ...((RDG.keyColumn as any)(
          "purchaseTaxId" as any,
          buildSelectColumn(
            taxOptions.map((o) => ({ label: o.label, value: String(o.value) }))
          )
        ) as any),
        id: "purchaseTaxId",
        title: "Tax",
      } as any,
      // Price fields: use nullable text column so Delete and empty paste become null
      {
        ...((RDG.keyColumn as any)(
          "costPrice" as any,
          nullableTextColumn
        ) as any),
        id: "costPrice",
        title: "Cost",
      } as any,
      {
        ...((RDG.keyColumn as any)(
          "manualSalePrice" as any,
          nullableTextColumn
        ) as any),
        id: "manualSalePrice",
        title: "Sell",
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
    // In edit mode, show ID as first disabled column
    if (mode === "edit") {
      return [col("id", "ID", true), ...base];
    }
    return base;
  }, [
    mode,
    options?.supplierOptions,
    options?.categoryOptions,
    options?.taxCodeOptions,
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
      const payload =
        mode === "edit"
          ? { _intent: "product.batchSaveRows", rows: currentRows }
          : { _intent: "product.batchCreate", rows: currentRows };
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
  }, [dataGrid, mode, navigate]);

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
    <FullzoomAppShell
      title={mode === "edit" ? "Batch Edit Products" : "Batch Create Products"}
      right={<SaveCancelHeader />}
    >
      {(gridHeight) => {
        return (
          <RDG.DataSheetGrid
            ref={gridRef as any}
            value={displayRows as any}
            onChange={(r: SheetRow[]) => {
              console.log("Rows changed", r);
              dataGrid.onChange(r as any, (arguments as any)[1]);
              setDirty(dataGrid.gridState.isDirty || true);
            }}
            columns={sheetColumns}
            height={gridHeight}
            createRow={createRow}
            lockRows={true}
            rowClassName={dataGrid.rowClassName as any}
          />
        );
      }}
    </FullzoomAppShell>
  );
}
