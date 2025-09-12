import { Link, useLocation, useNavigate } from "@remix-run/react";
import { Button, Group, Stack, Title } from "@mantine/core";
import { ProductFindManager } from "../components/ProductFindManager";
import { SavedViews } from "../components/find/SavedViews";
import { BreadcrumbSet } from "packages/timber";
import NavDataTable from "../components/RefactoredNavDataTable";
import { useEffect, useState, useRef } from "react";
import { useRecords } from "../record/RecordContext";
import { useHybridWindow } from "../record/useHybridWindow";

export const meta = () => [{ title: "Products" }];

export default function ProductsIndexRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, currentId } = useRecords();
  const { records, atEnd, loading, requestMore, missingIds, total } =
    useHybridWindow({
      module: "products",
      initialWindow: 100,
      batchIncrement: 100,
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
      <Group justify="flex-end" mb="xs">
        <Button component={Link} to="/products/new">
          New Product
        </Button>
      </Group>
      <section>
        <SavedViews views={[]} activeView={null} />
        <NavDataTable
          module="products"
          records={records}
          columns={[
            {
              accessor: "id",
              title: "ID",
              width: 70,
              render: (r: any) => <Link to={`/products/${r.id}`}>{r.id}</Link>,
            },
            { accessor: "sku", title: "SKU" },
            { accessor: "name", title: "Name" },
            { accessor: "type", title: "Type" },
            { accessor: "costPrice", title: "Cost" },
            { accessor: "manualSalePrice", title: "Manual" },
            { accessor: "autoSalePrice", title: "Auto" },
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
          fetching={loading}
          onActivate={(rec: any) => {
            if (rec?.id != null) navigate(`/products/${rec.id}`);
          }}
          onReachEnd={() => requestMore()}
          footer={
            atEnd ? (
              <span style={{ fontSize: 12 }}>End of results ({total})</span>
            ) : missingIds.length ? (
              <span>Loading rows…</span>
            ) : (
              <span style={{ fontSize: 11 }}>Scroll to load more…</span>
            )
          }
        />
      </section>
    </Stack>
  );
}
