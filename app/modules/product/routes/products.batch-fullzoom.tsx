import { json } from "@remix-run/node";
import {
  AppShell,
  Group,
  Text,
  Button,
  Stack,
  Card,
  NativeSelect,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { SaveCancelHeader, useInitGlobalFormContext } from "@aa/timber";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Column, CellProps } from "react-datasheet-grid";
import * as RDG from "react-datasheet-grid";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useOptions } from "~/base/options/OptionsContext";

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

type SheetRow = {
  id?: number | "";
  sku: string;
  name: string;
  type: string;
  supplierId?: string | number | "";
  categoryId?: string | number | "";
  purchaseTaxId?: string | number | "";
  costPrice?: number | string | "";
  manualSalePrice?: number | string | "";
  stockTrackingEnabled?: boolean;
  batchTrackingEnabled?: boolean;
};

export default function ProductsBatchCreateFullzoom() {
  const navigate = useNavigate();
  const loaderData = useLoaderData<{
    mode: "create" | "edit";
    rows: SheetRow[];
  }>();
  const [rows, setRows] = useState<SheetRow[]>(loaderData?.rows || []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const originalRef = useRef<SheetRow[]>([]);
  const [mode, setMode] = useState<"create" | "edit">(
    loaderData?.mode || "create"
  );
  const options = useOptions();

  console.log("!! rows", rows);

  // Simple select column using Mantine NativeSelect to avoid SSR/CJS named export issues
  type Choice = { label: string; value: string };
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
      col("costPrice", "Cost"),
      col("manualSalePrice", "Sell"),
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

  const createRow = (): SheetRow => ({
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
  });

  const reset = useCallback(() => {
    setRows([createRow(), createRow(), createRow(), createRow(), createRow()]);
    setDirty(false);
    originalRef.current = [];
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const payload =
        mode === "edit"
          ? { _intent: "product.batchSaveRows", rows }
          : { _intent: "product.batchCreate", rows };
      const resp = await fetch("/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok) {
        notifications.show({
          color: "teal",
          title: mode === "edit" ? "Batch save" : "Batch create",
          message:
            mode === "edit"
              ? `Saved ${data?.updated || 0} updated, ${
                  data?.created || 0
                } created`
              : `Created ${data?.created || 0} products`,
        });
        setDirty(false);
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
  }, [rows, mode, navigate]);

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
    <AppShell header={{ height: 100 }} padding="md" withBorder={false}>
      <AppShell.Header>
        <Group justify="space-between" align="center" px={24} py={16}>
          <Text size="xl">
            {mode === "edit" ? "Batch Edit Products" : "Batch Create Products"}
          </Text>
          <SaveCancelHeader />
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Stack>
          <Card withBorder>
            <div
              style={{
                border: "1px solid var(--mantine-color-gray-4)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <RDG.DataSheetGrid
                className="products-batch-sheet"
                value={rows as any}
                onChange={(r: SheetRow[]) => {
                  setRows(r);
                  setDirty(true);
                }}
                columns={sheetColumns}
                height={520}
                createRow={createRow}
              />
            </div>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => navigate("/products")}>
                Cancel
              </Button>
              <Button
                color="green"
                onClick={save}
                loading={saving}
                disabled={!dirty}
              >
                Save
              </Button>
            </Group>
          </Card>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
