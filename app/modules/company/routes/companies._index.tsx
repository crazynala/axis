import type { MetaFunction } from "@remix-run/node";
import { Link, useNavigate, useSearchParams } from "@remix-run/react";
import { Button, Stack, Title, Group, Tooltip } from "@mantine/core";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";
import { useEffect } from "react";
import { BreadcrumbSet } from "../../../../packages/timber/dist";
import { VirtualizedNavDataTable } from "../../../components/VirtualizedNavDataTable";
import { useHybridWindow } from "../../../base/record/useHybridWindow";
import { useRecords } from "../../../base/record/RecordContext";
import { FindRibbonAuto } from "../../../components/find/FindRibbonAuto";
import { CompanyFindManagerNew } from "~/modules/company/findify/CompanyFindManagerNew";
import { useFindHrefAppender } from "~/base/find/sessionFindState";

export const meta: MetaFunction = () => [{ title: "Companies" }];

export default function CompaniesIndexRoute() {
  // Persist and restore last path + filters for Companies module
  useRegisterNavLocation({ includeSearch: true, moduleKey: "companies" });
  usePersistIndexSearch("/companies");
  const { state, currentId } = useRecords();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const appendHref = useFindHrefAppender();
  // useHybridWindow handles window sizing + hydration (records = current window)
  const {
    records,
    fetching: rowFetching,
    requestMore,
    atEnd,
    total,
  } = useHybridWindow({
    module: "companies",
    rowEndpointPath: "/companies/rows",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
  });
  // Ensure selected row inclusion (similar to products)
  useEffect(() => {
    if (!state?.currentId) return;
    const idList = state?.idList || [];
    const idx = idList.indexOf(state.currentId as any);
    if (idx === -1) return;
    if (idx >= records.length) {
      let safety = 0;
      while (records.length <= idx && safety < 20) {
        requestMore();
        safety++;
      }
    }
  }, [state?.currentId, state?.idList, records.length, requestMore]);
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
      render: (r: any) => (
        <Link to={`/companies/${r.id}`}>{r.name || `Company #${r.id}`}</Link>
      ),
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
      <CompanyFindManagerNew />
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[{ label: "Companies", href: appendHref("/companies") }]}
        />
        <Button
          component="a"
          href="/companies/new"
          variant="filled"
          color="blue"
        >
          New Company
        </Button>
      </Group>
      <FindRibbonAuto views={[]} activeView={null} />
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
          onSortStatusChange={(s: {
            columnAccessor: string;
            direction: "asc" | "desc";
          }) => {
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
          footer={
            atEnd ? (
              <span style={{ fontSize: 12 }}>End of results ({total})</span>
            ) : rowFetching ? (
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
