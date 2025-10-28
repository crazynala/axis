import type { MetaFunction } from "@remix-run/node";
import { Link, useNavigation, useRouteLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { Button, Stack, Title, Group, Tooltip } from "@mantine/core";
import { useEffect } from "react";
import { BreadcrumbSet } from "../../../../packages/timber/dist";
import { VirtualizedNavDataTable } from "../../../components/VirtualizedNavDataTable";
import { useHybridWindow } from "../../../base/record/useHybridWindow";
import { useRecordContext } from "../../../base/record/RecordContext";
import { SavedViews } from "../../../components/find/SavedViews";

export const meta: MetaFunction = () => [{ title: "Companies" }];

export default function CompaniesIndexRoute() {
  const { idList, idListComplete, initialRows, total, views, activeView } = useRouteLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
    views?: any[];
    activeView?: string | null;
  }>("modules/company/routes/companies") ?? {
    idList: [],
    idListComplete: true,
    initialRows: [],
    total: 0,
    views: [],
    activeView: null,
  };
  const nav = useNavigation();
  const fetching = nav.state !== "idle"; // only reflects URL changes; row fetches are separate
  const { state, setIdList, addRows, currentId } = useRecordContext();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  // Seed/override RecordContext with loader-provided idList + initialRows so sorting/filtering take effect
  useEffect(() => {
    setIdList("companies", idList, idListComplete);
    if (initialRows?.length) addRows("companies", initialRows, { updateRecordsArray: true });
  }, [idList, idListComplete, initialRows, setIdList, addRows]);
  // useHybridWindow handles window sizing + hydration (records = current window)
  const {
    records,
    fetching: rowFetching,
    requestMore,
    atEnd,
  } = useHybridWindow({
    module: "companies",
    rowEndpointPath: "/companies/rows",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
  });
  // Auto ensure currentId inclusion (if selected elsewhere) – simplistic: run once on mount if current exists
  // (Could be refined similar to invoices/products index implementations.)
  const columns = [
    {
      accessor: "id",
      title: "ID",
      width: 70,
      render: (r: any) => <Link to={`/companies/${r.id}`}>{r.id}</Link>,
    },
    {
      accessor: "name",
      title: "Name",
      sortable: true,
      render: (r: any) => <Link to={`/companies/${r.id}`}>{r.name || `Company #${r.id}`}</Link>,
    },
    {
      accessor: "isCarrier",
      title: "Carrier",
      width: 100,
      align: "center",
      render: (r: any) => (r.isCarrier ? "✔︎" : ""),
    },
    {
      accessor: "isCustomer",
      title: "Customer",
      width: 100,
      align: "center",
      render: (r: any) => (r.isCustomer ? "✔︎" : ""),
    },
    {
      accessor: "isSupplier",
      title: "Supplier",
      width: 100,
      align: "center",
      render: (r: any) => (r.isSupplier ? "✔︎" : ""),
    },
    {
      accessor: "active",
      title: "Active",
      width: 100,
      align: "center",
      render: (r: any) => (!r.isInactive ? "✔︎" : ""),
    },
    { accessor: "notes", title: "Notes", sortable: true },
  ];
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet breadcrumbs={[{ label: "Companies", href: "/companies" }]} />
        <Button component="a" href="/companies/new" variant="filled" color="blue">
          New Company
        </Button>
      </Group>
      <SavedViews views={(views as any) || []} activeView={(activeView as any) || null} />
      <section>
        <VirtualizedNavDataTable
          records={records as any}
          currentId={currentId as any}
          columns={columns as any}
          sortStatus={
            {
              columnAccessor: sp.get("sort") || "id",
              direction: (sp.get("dir") as any) || "asc",
            } as any
          }
          onSortStatusChange={(s: { columnAccessor: string; direction: "asc" | "desc" }) => {
            const next = new URLSearchParams(sp);
            next.set("sort", s.columnAccessor);
            next.set("dir", s.direction);
            navigate(`?${next.toString()}`);
          }}
          onRowClick={(rec: any) => {
            if (rec?.id != null) navigate(`/companies/${rec.id}`);
          }}
          onRowDoubleClick={(rec: any) => {
            if (rec?.id != null) navigate(`/companies/${rec.id}`);
          }}
          onReachEnd={() => {
            if (!atEnd) requestMore();
          }}
          footer={atEnd ? <span style={{ fontSize: 12 }}>End of results ({total})</span> : rowFetching ? <span>Loading…</span> : <span style={{ fontSize: 11 }}>Scroll to load more…</span>}
        />
      </section>
    </Stack>
  );
}
