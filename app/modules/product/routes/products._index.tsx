import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { Button, Group, Stack, Text, Card, Indicator } from "@mantine/core";
import SplitButton from "~/components/SplitButton";
import { ProductFindManager } from "../components/ProductFindManager";
import { FindRibbonAuto } from "~/components/find/FindRibbonAuto";
import { BreadcrumbSet } from "packages/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { VirtualizedNavDataTable } from "~/components/VirtualizedNavDataTable";
import { useEffect, useState, useRef, useMemo } from "react";
import { useRecords } from "~/base/record/RecordContext";
import { useHybridWindow } from "~/base/record/useHybridWindow";
import { HotkeyAwareModal } from "~/base/hotkeys/HotkeyAwareModal";
import {
  DataSheetGrid,
  keyColumn,
  textColumn,
  type Column,
} from "react-datasheet-grid";
import { formatUSD } from "~/utils/format";

import { PricingPreviewWidget } from "../components/PricingPreviewWidget";
import { calcPrice } from "../calc/calcPrice";
import {
  getSavedNavLocation,
  usePersistIndexSearch,
  useRegisterNavLocation,
} from "~/hooks/useNavLocation";
import { IconBaselineDensityMedium } from "@tabler/icons-react";

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

function PriceCell({
  row,
  prefs,
}: {
  row: any;
  prefs: { qty: number; priceMultiplier: number };
}) {
  const qty = Number(prefs.qty || 60) || 60;
  const priceMultiplier = Number(prefs.priceMultiplier || 1) || 1;
  const manual = row?.manualSalePrice;
  const baseCost = Number(row?.costPrice ?? 0) || 0;
  const taxRate = Number(row?.purchaseTax?.value ?? 0) || 0;
  const costRanges = Array.isArray(row?.costGroup?.costRanges)
    ? row.costGroup.costRanges
        .filter((t: any) => t && t.rangeFrom != null)
        .map((t: any) => ({
          minQty: Number(t.rangeFrom) || 0,
          priceCost: Number(t.costPrice) || 0,
        }))
        .sort((a: any, b: any) => a.minQty - b.minQty)
    : [];
  const out = calcPrice({
    baseCost,
    tiers: costRanges,
    taxRate,
    priceMultiplier,
    qty,
    manualSalePrice:
      manual != null && manual !== "" ? Number(manual) : undefined,
  });
  return <>{formatUSD(out.unitSellPrice)}</>;
}

function StockCell({
  row,
  customerId,
}: {
  row: any;
  customerId: string | null;
}) {
  if (!row?.stockTrackingEnabled) return <></>;
  const [extra, setExtra] = useState<any | null>(null);
  useEffect(() => {
    if (!row?.stockTrackingEnabled) return;
    const hasData =
      (Array.isArray(row?.c_byLocation) && row.c_byLocation.length > 0) ||
      row?.c_stockQty != null;
    if (hasData) return;
    let abort = false;
    (async () => {
      try {
        const resp = await fetch(`/api.products.by-ids?ids=${row.id}`);
        if (!resp.ok) return;
        const data = await resp.json();
        const item = Array.isArray(data?.items) ? data.items[0] : null;
        if (!item || abort) return;
        setExtra(item);
      } catch {
        // ignore
      }
    })();
    return () => {
      abort = true;
    };
  }, [row?.id, row?.stockTrackingEnabled, row?.c_byLocation, row?.c_stockQty]);
  const byLocSource =
    Array.isArray(extra?.c_byLocation) && extra?.c_byLocation.length
      ? extra.c_byLocation
      : Array.isArray(row?.c_byLocation)
      ? row.c_byLocation
      : [];
  const totalFromLoc = byLocSource.reduce(
    (sum: number, loc: any) => sum + (Number(loc.qty) || 0),
    0
  );
  const totalStock =
    row?.c_stockQty != null && Number.isFinite(Number(row.c_stockQty))
      ? Number(row.c_stockQty)
      : extra?.c_stockQty != null && Number.isFinite(Number(extra.c_stockQty))
      ? Number(extra.c_stockQty)
      : totalFromLoc;
  if (customerId) {
    const locId = Number(
      (row?.customer?.stockLocationId ??
        extra?.customer?.stockLocationId ??
        NaN) as any
    );
    const match = byLocSource.find(
      (loc: any) =>
        Number(
          loc.location_id ?? loc.lid ?? loc.locationId ?? loc.locId
        ) === locId
    );
    const qty = match ? Number(match.qty ?? 0) : totalStock;
    if (process.env.NODE_ENV !== "production") {
      console.debug("[products.index] stock customer view", {
        id: row?.id,
        sku: row?.sku,
        customerId,
        locId,
        match,
        qty,
        totalStock,
      });
    }
    return <>{Number.isFinite(qty) ? qty : ""}</>;
  }
  return <>{Number.isFinite(totalStock) ? totalStock : ""}</>;
}

export default function ProductsIndexRoute() {
  // Register product index navigation (persist search/filter state via existing logic + path)
  useRegisterNavLocation({ includeSearch: true, moduleKey: "products" });
  // Persist/restore index search so filters survive leaving and returning
  usePersistIndexSearch("/products");
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
  const [sp] = useSearchParams();
  const { state, currentId, setCurrentId, addRows } = useRecords();
  const { records, atEnd, loading, requestMore, total } = useHybridWindow({
    module: "products",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
  });
  // Removed per-route height calculation; table now auto-sizes within viewport
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
      if (currentId !== records[0].id) setCurrentId(records[0].id);
    }
  }, [records, currentId, setCurrentId]);

  // Row selection managed by table (multiselect)
  const [selectedIds, setSelectedIds] = useState<Array<number | string>>([]);
  const pricing = usePricingPrefsFromWidget();

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
      <ProductFindManager />
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
        <FindRibbonAuto views={[]} activeView={null} />
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
          columns={[
            // { accessor: "", title: "", render: (r, index) => index },
            {
              accessor: "id",
              title: "ID",
              width: 70,
              render: (r: any) => <Link to={`/products/${r.id}`}>{r.id}</Link>,
            },
            { accessor: "sku", title: "SKU", width: "30%", sortable: true },
            { accessor: "name", title: "Name", width: "70%", sortable: true },
            { accessor: "type", title: "Type", width: 90, sortable: true },
            {
              accessor: "costPrice",
              title: "Cost",
              width: 100,
              sortable: true,
              render: (r: any) => formatUSD(r.costPrice),
            },
            {
              accessor: "sellPrice",
              title: "Sell",
              width: 100,
              sortable: false,
              render: (r: any) => (
                <Group justify="space-between" w="70px">
                  <Indicator
                    color="red"
                    position="middle-start"
                    offset={-5}
                    size="4"
                    disabled={!(r.c_isSellPriceManual ?? !!r.manualSalePrice)}
                  >
                    <PriceCell
                      row={r}
                      prefs={{
                        qty: pricing.qty,
                        priceMultiplier: pricing.priceMultiplier,
                      }}
                    />
                  </Indicator>
                  {r.c_hasPriceTiers ? (
                    <IconBaselineDensityMedium size={8} />
                  ) : (
                    ""
                  )}
                </Group>
              ),
            },
            {
              accessor: "stockQty",
              title: "Stock",
              textAlign: "center",
              width: 80,
              render: (r: any) => (
                <StockCell row={r} customerId={pricing.customerId} />
              ),
            },
          ]}
          sortStatus={
            {
              columnAccessor: sp.get("sort") || "id",
              direction: (sp.get("dir") as any) || "asc",
            } as any
          }
          onSortStatusChange={(s: {
            columnAccessor: string;
            direction: "asc" | "desc";
          }) => {
            const next = new URLSearchParams(sp);
            next.set("sort", s.columnAccessor);
            next.set("dir", s.direction);
            navigate(`?${next.toString()}`);
          }}
          onRowDoubleClick={(rec: any) => {
            if (rec?.id != null) navigate(`/products/${rec.id}`);
          }}
          onRowClick={(rec: any) => {
            setCurrentId(rec?.id);
          }}
          onReachEnd={() => requestMore()}
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
