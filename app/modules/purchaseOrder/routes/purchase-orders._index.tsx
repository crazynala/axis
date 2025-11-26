import type { MetaFunction } from "@remix-run/node";
import { Link, useSearchParams, useNavigate } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group, Stack, Title, Text } from "@mantine/core";
import { FindRibbonAuto } from "~/components/find/FindRibbonAuto";
import { VirtualizedNavDataTable } from "../../../components/VirtualizedNavDataTable";
import { useHybridWindow } from "../../../base/record/useHybridWindow";
import { useRecords } from "../../../base/record/RecordContext";
import { useEffect } from "react";
import { formatShortDate, formatUSD } from "../../../utils/format";
import { PurchaseOrderFindManager } from "~/modules/purchaseOrder/findify/PurchaseOrderFindManager";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";

export const meta: MetaFunction = () => [{ title: "Purchase Orders" }];

export default function PurchaseOrdersIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "purchase-orders" });
  usePersistIndexSearch("/purchase-orders");
  const { state, currentId, setCurrentId } = useRecords();
  const appendHref = useFindHrefAppender();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const sort = sp.get("sort") || "id";
  const dir = (sp.get("dir") as any) || "asc";
  const sortStatus = { columnAccessor: sort, direction: dir } as any;
  const onSortStatusChange = (s: {
    columnAccessor: string;
    direction: "asc" | "desc";
  }) => {
    const next = new URLSearchParams(sp);
    next.set("sort", s.columnAccessor);
    next.set("dir", s.direction);
    navigate(`?${next.toString()}`);
  };
  // Hydration handled by parent route loader's effect
  const { records, fetching, requestMore, atEnd, total } = useHybridWindow({
    module: "purchase-orders",
    rowEndpointPath: "/purchase-orders/rows",
    initialWindow: 100,
    batchIncrement: 100,
    // Reduce visual blanks beyond hydrated rows
    maxPlaceholders: 8,
  });
  // Ensure currentId row present similar to products pattern
  const ensuredRef = (globalThis as any).__poEnsuredRef || { current: false };
  (globalThis as any).__poEnsuredRef = ensuredRef;
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
  // Auto-select single record when exactly one
  useEffect(() => {
    if (records.length === 1 && records[0] && records[0].id != null) {
      if (currentId !== records[0].id) setCurrentId(records[0].id);
    }
  }, [records, currentId, setCurrentId]);
  const columns = [
    {
      accessor: "id",
      title: "ID",
      width: 70,
      render: (r: any) => <Link to={`/purchase-orders/${r.id}`}>{r.id}</Link>,
    },
    {
      accessor: "date",
      title: "Date",
      sortable: true,
      render: (r: any) => formatShortDate(r.date),
    },
    { accessor: "vendorName", title: "Vendor", sortable: true },
    { accessor: "consigneeName", title: "Consignee", sortable: true },
    { accessor: "locationName", title: "Location", sortable: true },
    {
      accessor: "totalCost",
      title: "Total Cost",
      render: (r: any) => formatUSD(r.totalCost || 0),
      // Note: server cannot sort by computed totalCost; keep non-sortable to prevent Prisma errors
      sortable: false,
    },
  ];
  return (
    <Stack gap="lg">
      <PurchaseOrderFindManager />
      <Group justify="space-between" align="center" mb="sm">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Purchase Orders", href: appendHref("/purchase-orders") },
          ]}
        />
        <Button
          component={Link}
          to="/purchase-orders/new"
          variant="filled"
          color="blue"
        >
          New
        </Button>
      </Group>
      <FindRibbonAuto views={[]} activeView={null} />
      <VirtualizedNavDataTable
        records={records as any}
        currentId={currentId as any}
        columns={columns as any}
        sortStatus={sortStatus}
        onSortStatusChange={onSortStatusChange}
        onRowClick={(rec: any) => {
          if (rec?.id != null) navigate(`/purchase-orders/${rec.id}`);
        }}
        onRowDoubleClick={(rec: any) => {
          if (rec?.id != null) navigate(`/purchase-orders/${rec.id}`);
        }}
        onReachEnd={() => {
          if (!atEnd) requestMore();
        }}
        footer={
          atEnd ? (
            <span style={{ fontSize: 12 }}>End of results ({total})</span>
          ) : fetching ? (
            <span>Loading…</span>
          ) : (
            <span style={{ fontSize: 11 }}>Scroll to load more…</span>
          )
        }
      />
    </Stack>
  );
}
