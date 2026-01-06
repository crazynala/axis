import type { MetaFunction } from "@remix-run/node";
import {
  Link,
  useNavigate,
  useRouteLoaderData,
} from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group, Stack, Text } from "@mantine/core";
import { FindRibbonAuto } from "~/components/find/FindRibbonAuto";
import { VirtualizedNavDataTable } from "../../../components/VirtualizedNavDataTable";
import { useRecords } from "../../../base/record/RecordContext";
import { useEffect } from "react";
import { PurchaseOrderFindManager } from "~/modules/purchaseOrder/findify/PurchaseOrderFindManager";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";
import { purchaseOrderSpec } from "../spec";
import { purchaseOrderColumns } from "../spec/indexList";
import { useHybridIndexTable } from "~/base/index/useHybridIndexTable";

export const meta: MetaFunction = () => [{ title: "Purchase Orders" }];

export default function PurchaseOrdersIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "purchase-orders" });
  usePersistIndexSearch("/purchase-orders");
  const { state, currentId, setCurrentId } = useRecords();
  const data = useRouteLoaderData<{
    views?: any[];
    activeView?: string | null;
    activeViewParams?: any | null;
  }>("modules/purchaseOrder/routes/purchase-orders");
  const appendHref = useFindHrefAppender();
  const navigate = useNavigate();
  // Hydration handled by parent route loader's effect
  const viewMode = !!data?.activeView;
  const {
    records,
    columns,
    sortStatus,
    onSortStatusChange,
    onReachEnd,
    requestMore,
    atEnd,
    fetching,
    total,
  } = useHybridIndexTable({
    module: "purchase-orders",
    rowEndpointPath: "/purchase-orders/rows",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
    columns: purchaseOrderColumns,
    viewColumns: data?.activeViewParams?.columns,
    viewMode,
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
      if (currentId !== records[0].id)
        setCurrentId(records[0].id, "programmatic");
    }
  }, [records, currentId, setCurrentId]);
  return (
    <Stack gap="lg">
      <PurchaseOrderFindManager activeViewParams={data?.activeViewParams || null} />
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
      <FindRibbonAuto
        views={data?.views || []}
        activeView={data?.activeView || null}
        activeViewId={data?.activeView || null}
        activeViewParams={data?.activeViewParams || null}
        findConfig={purchaseOrderSpec.find.buildConfig()}
        enableLastView
        columnsConfig={purchaseOrderColumns}
      />
      <VirtualizedNavDataTable
        records={records as any}
        currentId={currentId as any}
        columns={columns as any}
        sortStatus={sortStatus as any}
        onSortStatusChange={onSortStatusChange as any}
        onRowClick={(rec: any) => {
          if (rec?.id != null) {
            setCurrentId(rec.id, "mouseRow");
            navigate(`/purchase-orders/${rec.id}`);
          }
        }}
        onRowDoubleClick={(rec: any) => {
          if (rec?.id != null) navigate(`/purchase-orders/${rec.id}`);
        }}
        onReachEnd={onReachEnd}
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
