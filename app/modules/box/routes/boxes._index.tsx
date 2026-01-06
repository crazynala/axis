import { useNavigate, useOutletContext } from "@remix-run/react";
import { Group, Stack, Text } from "@mantine/core";
import { BreadcrumbSet } from "@aa/timber";
import { BoxFindManager } from "../components/BoxFindManager";
import { FindRibbonAuto } from "~/components/find/FindRibbonAuto";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";
import { useRecords } from "~/base/record/RecordContext";
import { VirtualizedNavDataTable } from "~/components/VirtualizedNavDataTable";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import type { BoxesLoaderData } from "./boxes";
import { useMemo } from "react";
import { boxSpec } from "../spec";
import { boxColumns } from "../spec/indexList";
import { useHybridIndexTable } from "~/base/index/useHybridIndexTable";

export default function BoxesIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "boxes" });
  usePersistIndexSearch("/boxes");
  const layoutData = useOutletContext<BoxesLoaderData>();
  const navigate = useNavigate();
  const appendHref = useFindHrefAppender();
  const { currentId, setCurrentId } = useRecords();
  const findConfig = useMemo(() => boxSpec.find.buildConfig(), []);
  const viewMode = !!layoutData?.activeView;
  const {
    records,
    columns,
    sortStatus,
    onSortStatusChange,
    onReachEnd,
    atEnd,
    loading,
    total,
  } = useHybridIndexTable({
    module: "boxes",
    rowEndpointPath: "/boxes/rows",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
    columns: boxColumns,
    viewColumns: layoutData?.activeViewParams?.columns,
    viewMode,
  });

  return (
    <Stack gap="lg">
      <BoxFindManager activeViewParams={layoutData?.activeViewParams || null} />
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[{ label: "Boxes", href: appendHref("/boxes") }]}
        />
        <Text c="dimmed" size="sm">
          {total
            ? `${total.toLocaleString()} record${total === 1 ? "" : "s"}`
            : ""}
        </Text>
      </Group>
      <FindRibbonAuto
        views={layoutData?.views || []}
        activeView={layoutData?.activeView || null}
        activeViewId={layoutData?.activeView || null}
        activeViewParams={layoutData?.activeViewParams || null}
        findConfig={findConfig}
        enableLastView
        labelMap={{ code: "Code", state: "State", companyId: "Company" }}
        columnsConfig={boxColumns}
      />
      <section>
        <VirtualizedNavDataTable
          records={records as any}
          currentId={currentId as any}
          columns={columns as any}
          sortStatus={sortStatus as any}
          onSortStatusChange={onSortStatusChange as any}
          onRowClick={(row: any) => setCurrentId(row?.id ?? null, "mouseRow")}
          onRowDoubleClick={(row: any) => {
            if (row?.id != null) navigate(`/boxes/${row.id}`);
          }}
          onReachEnd={onReachEnd}
          footer={
            atEnd ? (
              <span style={{ fontSize: 12 }}>End of results ({total})</span>
            ) : loading ? (
              <span>Loading…</span>
            ) : (
              <span style={{ fontSize: 11 }}>Scroll to load more…</span>
            )
          }
        />
      </section>
    </Stack>
  );
}
