import {
  useLocation,
  useNavigate,
  useMatches,
} from "@remix-run/react";
import { Button, Group, Stack, Text, Card } from "@mantine/core";
import SplitButton from "~/components/SplitButton";
import { ProductFindManager } from "../components/ProductFindManager";
import { FindRibbonAuto } from "~/components/find/FindRibbonAuto";
import {
  defaultSummarizeFilters,
  type FilterChip,
} from "~/base/find/FindRibbon";
import { BreadcrumbSet } from "packages/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { VirtualizedNavDataTable } from "~/components/VirtualizedNavDataTable";
import { useEffect, useState, useRef, useMemo } from "react";
import { useRecords } from "~/base/record/RecordContext";
import { useHybridIndexTable } from "~/base/index/useHybridIndexTable";
import { HotkeyAwareModal } from "~/base/hotkeys/HotkeyAwareModal";
import {
  DataSheetGrid,
  keyColumn,
  textColumn,
  type Column,
} from "react-datasheet-grid";
import { PricingPreviewWidget } from "../components/PricingPreviewWidget";
import {
  getSavedNavLocation,
  usePersistIndexSearch,
  useRegisterNavLocation,
} from "~/hooks/useNavLocation";
import { buildProductMetadataFields } from "~/modules/productMetadata/utils/productMetadataFields";
import { getGlobalOptions } from "~/base/options/OptionsClient";
import { productSpec } from "../spec";

function usePricingPrefsFromWidget() {
  const [customerId, setCustomerId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("pricing.customerId");
  });
  const [qty, setQty] = useState<number>(() => {
    if (typeof window === "undefined") return 60;
    const raw = window.sessionStorage.getItem("pricing.qty");
    const n = raw ? Number(raw) : 60;
    return Number.isFinite(n) ? n : 60;
  });
  const [priceMultiplier, setPriceMultiplier] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const raw = window.sessionStorage.getItem("pricing.mult");
    const n = raw ? Number(raw) : 1;
    return Number.isFinite(n) ? n : 1;
  });
  useEffect(() => {
    const handler = (e: any) => {
      if (!e?.detail) return;
      const {
        customerId: cid,
        qty: q,
        priceMultiplier: mult,
      } = e.detail as {
        customerId: string | null;
        qty: number;
        priceMultiplier?: number;
      };
      setCustomerId(cid ?? null);
      const n = Number(q);
      setQty(Number.isFinite(n) ? n : 60);
      if (mult != null) {
        const m = Number(mult);
        setPriceMultiplier(Number.isFinite(m) ? m : 1);
      }
    };
    window.addEventListener("pricing:prefs", handler as any);
    return () => window.removeEventListener("pricing:prefs", handler as any);
  }, []);
  return { customerId, qty, priceMultiplier } as const;
}
export default function ProductsIndexRoute() {
  // Register product index navigation (persist search/filter state via existing logic + path)
  useRegisterNavLocation({ includeSearch: true, moduleKey: "products" });
  // Persist/restore index search so filters survive leaving and returning
  usePersistIndexSearch("/products");
  const matches = useMatches();
  const parentData = useMemo(
    () =>
      matches.find((m) =>
        String(m.id).endsWith("modules/product/routes/products")
      )?.data as any,
    [matches]
  );
  const metadataDefinitions = useMemo(() => {
    const defs = parentData?.metadataDefinitions;
    return Array.isArray(defs) ? defs : [];
  }, [parentData]);
  const globalOptions = getGlobalOptions();
  const views = parentData?.views || [];
  const activeView = parentData?.activeView || null;
  const activeViewParams = parentData?.activeViewParams || null;
  const metadataFields = useMemo(
    () =>
      buildProductMetadataFields(metadataDefinitions, {
        onlyFilterable: true,
        enumOptionsByDefinitionId:
          globalOptions?.productAttributeOptionsByDefinitionId || {},
      }),
    [metadataDefinitions, globalOptions?.productAttributeOptionsByDefinitionId]
  );
  const findConfig = useMemo(
    () => productSpec.find.buildConfig(metadataFields),
    [metadataFields]
  );
  // If user lands on /products directly and we have a saved subpath, redirect to it for testing
  const location = useLocation();
  useEffect(() => {
    if (location.pathname === "/products") {
      const saved = getSavedNavLocation("/products");
      if (saved && saved !== "/products") {
        // defer until next tick to ensure navigate variable is defined
        setTimeout(() => navigate(saved, { replace: true }), 0);
      }
    }
    // run on first mount for this route
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const appendHref = useFindHrefAppender();
  // Batch create modal state
  type NewProd = {
    sku: string;
    name: string;
    type: string;
    supplierId?: number | "";
    categoryId?: number | "";
    purchaseTaxId?: number | "";
    costPrice?: number | "";
    manualSalePrice?: number | "";
    stockTrackingEnabled?: boolean | "";
    batchTrackingEnabled?: boolean | "";
  };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rows, setRows] = useState<NewProd[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSummary, setSaveSummary] = useState<{
    created: number;
    errors: Array<{ index: number; message: string }>;
  } | null>(null);
  const sheetColumns = useMemo<Column<NewProd>[]>(() => {
    const col = <K extends keyof NewProd>(
      key: K,
      title: string,
      disabled = false
    ): Column<NewProd> => ({
      ...(keyColumn<NewProd, any>(key as any, textColumn) as any),
      id: key as string,
      title,
      disabled,
    });
    return [
      col("sku", "SKU"),
      col("name", "Name"),
      col("type", "Type"),
      col("supplierId", "SupplierId"),
      col("categoryId", "CategoryId"),
      col("purchaseTaxId", "PurchaseTaxId"),
      col("costPrice", "CostPrice"),
      col("manualSalePrice", "ManualSalePrice"),
      col("stockTrackingEnabled", "Stock?"),
      col("batchTrackingEnabled", "Batch?"),
    ];
  }, []);
  const createRow = (): NewProd => ({
    sku: "",
    name: "",
    type: "",
    supplierId: "",
    categoryId: "",
    purchaseTaxId: "",
    costPrice: "",
    manualSalePrice: "",
    stockTrackingEnabled: "",
    batchTrackingEnabled: "",
  });
  const navigate = useNavigate();
  const { state, currentId, setCurrentId, addRows } = useRecords();
  // Removed per-route height calculation; table now auto-sizes within viewport
  // Row selection managed by table (multiselect)
  const [selectedIds, setSelectedIds] = useState<Array<number | string>>([]);
  const pricing = usePricingPrefsFromWidget();
  const summarizeFilters = useMemo(() => {
    const defByKey = new Map(
      metadataDefinitions.map((def: any) => [def.key, def])
    );
    return (params: Record<string, string>) => {
      const chips: FilterChip[] = [];
      const nonMeta: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        if (!k.startsWith("meta__")) {
          nonMeta[k] = v;
          continue;
        }
        const raw = k.slice("meta__".length);
        const isMin = raw.endsWith("Min");
        const isMax = raw.endsWith("Max");
        const defKey = isMin || isMax ? raw.slice(0, -3) : raw;
        const def = defByKey.get(defKey);
        if (!def) continue;
        if (isMin || isMax) continue;
        const label = def.label || def.key;
        if (def.dataType === "BOOLEAN") {
          const pretty = v === "true" ? "Yes" : v === "false" ? "No" : v;
          chips.push({ key: k, label: `${label}: ${pretty}` });
        } else {
          chips.push({ key: k, label: `${label}: ${v}` });
        }
      }
      for (const def of metadataDefinitions) {
        if (def.dataType !== "NUMBER") continue;
        const minKey = `meta__${def.key}Min`;
        const maxKey = `meta__${def.key}Max`;
        const minVal = params[minKey];
        const maxVal = params[maxKey];
        if (!minVal && !maxVal) continue;
        const label = def.label || def.key;
        const range =
          minVal && maxVal
            ? `${minVal}–${maxVal}`
            : minVal
            ? `>= ${minVal}`
            : `<= ${maxVal}`;
        chips.push({ key: minKey, label: `${label}: ${range}` });
      }
      return [...defaultSummarizeFilters(nonMeta), ...chips];
    };
  }, [metadataDefinitions]);
  const columnDefs = useMemo(
    () => productSpec.index.buildColumns(pricing),
    [pricing]
  );
  const viewMode = !!activeView;
  const {
    records,
    columns,
    sortStatus,
    onSortStatusChange,
    onReachEnd,
    requestMore,
    atEnd,
    loading,
    total,
  } = useHybridIndexTable({
    module: "products",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
    columns: columnDefs,
    viewColumns: activeViewParams?.columns,
    viewMode,
  });

  // Ensure currentId row included when returning from detail
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (!currentId) return;
    if (ensuredRef.current) return;
    const idList = state?.idList || [];
    const idx = idList.indexOf(currentId as any);
    if (idx === -1) return;
    if (idx >= records.length) {
      let safety = 0;
      while (records.length <= idx && safety < 20) {
        requestMore();
        safety++;
      }
    }
    ensuredRef.current = true;
  }, [currentId, state?.idList, records.length, requestMore]);

  // Auto-select single result when exactly one record after filtering
  useEffect(() => {
    if (records.length === 1 && records[0] && records[0].id != null) {
      if (currentId !== records[0].id)
        setCurrentId(records[0].id, "programmatic");
    }
  }, [records, currentId, setCurrentId]);

  // Revalidate / refresh current product row on window focus to avoid stale manual price after edits
  useEffect(() => {
    const handleFocus = async () => {
      if (!currentId) return;
      try {
        const resp = await fetch(`/products/rows?ids=${currentId}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json, */*" },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const rows = Array.isArray(data?.rows) ? data.rows : data;
        if (rows && rows.length) addRows("products", rows);
      } catch (e) {
        // swallow
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [currentId, addRows]);

  async function saveSheet() {
    setSaving(true);
    try {
      setSaveSummary({
        created: 0,
        errors: [{ index: -1, message: "Not implemented" }],
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="lg">
      <ProductFindManager
        metadataDefinitions={metadataDefinitions}
        activeViewParams={activeViewParams}
      />
      <Group
        justify="space-between"
        mb="xs"
        align="center"
        data-products-header
      >
        <BreadcrumbSet
          breadcrumbs={[{ label: "Products", href: appendHref("/products") }]}
        />
        <Group justify="flex-end" mb="xs" gap="xs">
          <SplitButton
            size="xs"
            onPrimaryClick={() => navigate("/products/new")}
            items={[
              {
                label: "Batch Create",
                onClick: () => navigate("/products/batch-fullzoom"),
              },
            ]}
            variant="filled"
            color="blue"
          >
            New Product
          </SplitButton>
        </Group>
      </Group>
      <Group justify="space-between" align="center">
        <FindRibbonAuto
          views={views}
          activeView={activeView}
          activeViewId={activeView}
          activeViewParams={activeViewParams}
          findConfig={findConfig}
          enableLastView
          summarizeFilters={summarizeFilters}
          columnsConfig={columnDefs}
        />
        <Card withBorder padding={5}>
          <PricingPreviewWidget productId={Number(currentId) || undefined} />
        </Card>
      </Group>
      <section>
        <VirtualizedNavDataTable
          records={records}
          currentId={currentId}
          multiselect
          onSelectionChange={(ids) => setSelectedIds(ids)}
          bulkActions={[
            {
              label: "Batch Edit",
              onClick: (ids) =>
                navigate(`/products/batch-fullzoom?ids=${ids.join(",")}`),
            },
            {
              label: "Batch Edit BOMs",
              onClick: (ids) =>
                navigate(`/products/boms-fullzoom?ids=${ids.join(",")}`),
            },
          ]}
          columns={columns as any}
          sortStatus={sortStatus as any}
          onSortStatusChange={onSortStatusChange as any}
          onRowDoubleClick={(rec: any) => {
            if (rec?.id != null) navigate(`/products/${rec.id}`);
          }}
          onRowClick={(rec: any) => {
            setCurrentId(rec?.id, "mouseRow");
          }}
          onReachEnd={onReachEnd}
          footer={
            atEnd ? (
              <span style={{ fontSize: 12 }}>End of results ({total})</span>
            ) : loading ? (
              <span>Loading rows…</span>
            ) : (
              <span style={{ fontSize: 11 }}>Scroll to load more…</span>
            )
          }
        />
      </section>

      <HotkeyAwareModal
        opened={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Batch Create Products"
        size="90vw"
        centered
      >
        <Stack>
          <Text c="dimmed">
            Paste rows from Excel or type directly. Leave a row entirely blank
            to ignore it.
          </Text>
          <div
            style={{
              border: "1px solid var(--mantine-color-gray-4)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <DataSheetGrid
              className="products-batch-sheet"
              value={rows as any}
              onChange={(r) => {
                setRows(r as any);
                setDirty(true);
              }}
              columns={sheetColumns}
              height={420}
              createRow={createRow}
            />
          </div>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setSheetOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              color="green"
              onClick={saveSheet}
              loading={saving}
              disabled={!dirty}
            >
              Save
            </Button>
          </Group>
          {saveSummary && (
            <Card withBorder>
              <Text size="sm">Created: {saveSummary.created}</Text>
              {saveSummary.errors?.length ? (
                <Stack gap={4} mt="xs">
                  <Text size="sm" c="red">
                    Errors
                  </Text>
                  {saveSummary.errors.map((e, i) => (
                    <Text key={i} size="sm" c="red">
                      {e.index >= 0 ? `Row ${e.index + 1}: ` : ""}
                      {e.message}
                    </Text>
                  ))}
                </Stack>
              ) : null}
            </Card>
          )}
        </Stack>
      </HotkeyAwareModal>
    </Stack>
  );
}
