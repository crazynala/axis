import { useNavigate, useRouteLoaderData } from "@remix-run/react";
import { Card, Group, Stack, Text, Button } from "@mantine/core";
import { useRegisterNavLocation, usePersistIndexSearch } from "~/hooks/useNavLocation";
import { FindRibbonAuto } from "~/components/find/FindRibbonAuto";
import { BreadcrumbSet } from "@aa/timber";
import { VirtualizedNavDataTable } from "~/components/VirtualizedNavDataTable";
import { useEffect } from "react";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import { useRecords } from "~/base/record/RecordContext";
import { useHybridIndexTable } from "~/base/index/useHybridIndexTable";
import { productionLedgerColumns } from "~/modules/production/spec/indexList";
import type { ProductionLedgerRow } from "~/modules/production/services/productionLedger.server";

export default function ProductionLedgerIndexRoute() {
  const data = useRouteLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: ProductionLedgerRow[];
    total: number;
    views?: any[];
    activeView?: string | null;
    activeViewParams?: any | null;
  }>("modules/production/routes/production-ledger");
  const navigate = useNavigate();
  const { currentId, setRecordSet, setIdList, addRows } = useRecords();
  useRegisterNavLocation({ includeSearch: true, moduleKey: "production-ledger" });
  usePersistIndexSearch("/production-ledger");
  const appendHref = useFindHrefAppender();
  const viewMode = !!data?.activeView;
  const {
    records,
    columns,
    sortStatus,
    onSortStatusChange,
    onReachEnd,
    fetching,
    total,
  } = useHybridIndexTable({
    module: "production-ledger",
    rowEndpointPath: "/production-ledger/rows",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
    columns: productionLedgerColumns,
    viewColumns: data?.activeViewParams?.columns,
    viewMode,
  });

  useEffect(() => {
    setRecordSet("production-ledger", data?.initialRows ?? [], {
      getPath: (r) => `/production-ledger/assembly/${r?.id}`,
    });
    setIdList(
      "production-ledger",
      data?.idList ?? [],
      data?.idListComplete ?? true
    );
    if (data?.initialRows?.length) {
      addRows("production-ledger", data.initialRows, {
        updateRecordsArray: true,
      });
    }
  }, [
    addRows,
    data?.idList,
    data?.idListComplete,
    data?.initialRows,
    setIdList,
    setRecordSet,
  ]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Production Ledger", href: appendHref("/production-ledger") },
          ]}
        />
        <Button size="xs" variant="default" onClick={() => navigate(0)}>
          Refresh
        </Button>
      </Group>
      <FindRibbonAuto
        views={data?.views || []}
        activeView={data?.activeView || null}
        activeViewId={data?.activeView || null}
        activeViewParams={data?.activeViewParams || null}
        enableLastView
        columnsConfig={productionLedgerColumns}
      />
      <Card withBorder padding="sm">
        <VirtualizedNavDataTable
          records={records}
          columns={columns as any}
          currentId={currentId as any}
          autoHeightOffset={120}
          rowHeight={40}
          onReachEnd={onReachEnd}
          sortStatus={sortStatus as any}
          onSortStatusChange={onSortStatusChange as any}
          totalCount={total}
          multiselect={false}
        />
        {!fetching && records.length === 0 ? (
          <Group justify="center" py="md">
            <Text c="dimmed">No assemblies found.</Text>
          </Group>
        ) : null}
      </Card>
    </Stack>
  );
}
