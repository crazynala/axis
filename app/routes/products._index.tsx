import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import {
  Button,
  Group,
  Stack,
  Title,
  Text,
  Card,
  Tooltip,
} from "@mantine/core";
import { ProductFindManager } from "../components/ProductFindManager";
import { SavedViews } from "../components/find/SavedViews";
import { BreadcrumbSet } from "packages/timber";
import { VirtualizedNavDataTable } from "../components/VirtualizedNavDataTable";
import { useEffect, useState, useRef, useMemo } from "react";
import { useRecords } from "../record/RecordContext";
import { useHybridWindow } from "../record/useHybridWindow";
import { HotkeyAwareModal } from "../hotkeys/HotkeyAwareModal";
import {
  DataSheetGrid,
  keyColumn,
  textColumn,
  type Column,
} from "react-datasheet-grid";
import "react-datasheet-grid/dist/style.css";
import { render } from "@react-pdf/renderer";

export const meta = () => [{ title: "Products" }];

export default function ProductsIndexRoute() {
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
  const openSheet = () => {
    setSaveSummary(null);
    setRows([createRow(), createRow(), createRow(), createRow(), createRow()]);
    setDirty(false);
    setSheetOpen(true);
  };
  const saveSheet = async () => {
    setSaving(true);
    try {
      const payload = { _intent: "product.batchCreate", rows };
      const resp = await fetch("/products?indexAction=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      setSaveSummary({
        created: data?.created || 0,
        errors: data?.errors || [],
      });
      if (resp.ok && (data?.created || 0) > 0) {
        setDirty(false);
        setSheetOpen(false);
        // Reload to reflect new rows in id list and table
        window.location.reload();
      }
    } catch (e) {
      setSaveSummary({
        created: 0,
        errors: [{ index: -1, message: "Save failed" }],
      });
    } finally {
      setSaving(false);
    }
  };
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const location = useLocation();
  const { state, currentId, setCurrentId } = useRecords();
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

  return (
    <Stack gap="lg">
      <ProductFindManager />
      <Group
        justify="space-between"
        mb="xs"
        align="center"
        data-products-header
      >
        <Title order={2}>Products</Title>
        <BreadcrumbSet
          breadcrumbs={[{ label: "Products", href: "/products" }]}
        />
      </Group>
      <Group justify="flex-end" mb="xs" gap="xs">
        {Array.from(sp.keys()).some(
          (k) =>
            k !== "page" &&
            k !== "perPage" &&
            k !== "sort" &&
            k !== "dir" &&
            k !== "view"
        ) && (
          <Tooltip label="Clear all filters">
            <Button
              variant="default"
              onClick={() => {
                const next = new URLSearchParams(sp);
                // Keep paging & sorting, drop filters (including findReqs)
                for (const k of Array.from(next.keys())) {
                  if (["page", "perPage", "sort", "dir", "view"].includes(k))
                    continue;
                  next.delete(k);
                }
                navigate(`?${next.toString()}`);
              }}
            >
              Clear Filters
            </Button>
          </Tooltip>
        )}
        <Button variant="light" onClick={openSheet}>
          Create in Sheet
        </Button>
        <Button component={Link} to="/products/new">
          New Product
        </Button>
      </Group>
      <section>
        <SavedViews views={[]} activeView={null} />
        <VirtualizedNavDataTable
          records={records}
          currentId={currentId}
          columns={[
            { accessor: "", title: "", render: (r, index) => index },
            {
              accessor: "id",
              title: "ID",
              width: 70,
              render: (r: any) => <Link to={`/products/${r.id}`}>{r.id}</Link>,
            },
            { accessor: "sku", title: "SKU", sortable: true },
            { accessor: "name", title: "Name", sortable: true },
            { accessor: "type", title: "Type", sortable: true },
            { accessor: "costPrice", title: "Cost", sortable: true },
            { accessor: "manualSalePrice", title: "Manual", sortable: true },
            { accessor: "autoSalePrice", title: "Auto", sortable: true },
            {
              accessor: "stockTrackingEnabled",
              title: "Stock",
              render: (r: any) => (r.stockTrackingEnabled ? "Yes" : "No"),
            },
            {
              accessor: "batchTrackingEnabled",
              title: "Batch",
              render: (r: any) => (r.batchTrackingEnabled ? "Yes" : "No"),
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
