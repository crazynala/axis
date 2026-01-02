import { useNavigate, useOutletContext, useSearchParams } from "@remix-run/react";
import { Group, Stack, Text } from "@mantine/core";
import { BreadcrumbSet } from "@aa/timber";
import { BoxFindManager } from "../components/BoxFindManager";
import { FindRibbonAuto } from "~/components/find/FindRibbonAuto";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";
import { useRecords } from "~/base/record/RecordContext";
import { useHybridWindow } from "~/base/record/useHybridWindow";
import { VirtualizedNavDataTable } from "~/components/VirtualizedNavDataTable";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import type { BoxesLoaderData } from "./boxes";
import { allBoxFieldConfigs } from "../forms/boxDetail";
import { useMemo } from "react";
import { boxColumns } from "../config/boxColumns";
import {
  buildTableColumns,
  getVisibleColumnKeys,
} from "~/base/index/columns";

export default function BoxesIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "boxes" });
  usePersistIndexSearch("/boxes");
  const layoutData = useOutletContext<BoxesLoaderData>();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const appendHref = useFindHrefAppender();
  const { currentId, setCurrentId } = useRecords();
  const findConfig = useMemo(() => allBoxFieldConfigs, []);
  const { records, atEnd, loading, requestMore, total } = useHybridWindow({
    module: "boxes",
    rowEndpointPath: "/boxes/rows",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
  });

  const viewMode = !!layoutData?.activeView;
  const visibleColumnKeys = useMemo(
    () =>
      getVisibleColumnKeys({
        defs: boxColumns,
        urlColumns: sp.get("columns"),
        viewColumns: layoutData?.activeViewParams?.columns,
        viewMode,
      }),
    [layoutData?.activeViewParams?.columns, sp, viewMode]
  );
  const columns = useMemo(
    () => buildTableColumns(boxColumns, visibleColumnKeys),
    [visibleColumnKeys]
  );

  return (
    <Stack gap="lg">
      <BoxFindManager />
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
          sortStatus={{
            columnAccessor: sp.get("sort") || "id",
            direction: ((sp.get("dir") as "asc" | "desc") || "asc") as any,
          }}
          onSortStatusChange={(status: {
            columnAccessor: string;
            direction: "asc" | "desc";
          }) => {
            const next = new URLSearchParams(sp);
            next.set("sort", status.columnAccessor);
            next.set("dir", status.direction);
            navigate(`?${next.toString()}`);
          }}
          onRowClick={(row: any) => setCurrentId(row?.id ?? null)}
          onRowDoubleClick={(row: any) => {
            if (row?.id != null) navigate(`/boxes/${row.id}`);
          }}
          onReachEnd={() => {
            if (!atEnd) requestMore();
          }}
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
