import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useNavigation,
  useLoaderData,
  useSubmit,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { Button, Stack, Title, Group, Tooltip } from "@mantine/core";
import { useEffect } from "react";
import { BreadcrumbSet } from "../../packages/timber";
import NavDataTable from "../components/RefactoredNavDataTable";
import { useHybridWindow } from "../record/useHybridWindow";
import { useRecordContext } from "../record/RecordContext";
import { CompanyFindManagerNew } from "../components/CompanyFindManagerNew";
import { SavedViews } from "../components/find/SavedViews";
import { listViews, saveView } from "../utils/views.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../find/multiFind";
import { parseTableParams, buildPrismaArgs } from "../utils/table.server";
import { prismaBase } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Companies" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const params = parseTableParams(args.request.url);
  const views = await listViews("companies");
  const viewName = url.searchParams.get("view");
  let effective = params;
  if (viewName) {
    const v = views.find((x: any) => x.name === viewName);
    if (v) {
      const saved = v.params as any;
      effective = {
        page: Number(url.searchParams.get("page") || saved.page || 1),
        perPage: Number(url.searchParams.get("perPage") || saved.perPage || 20),
        sort: (url.searchParams.get("sort") || saved.sort || null) as any,
        dir: (url.searchParams.get("dir") || saved.dir || null) as any,
        q: (url.searchParams.get("q") || saved.q || null) as any,
        filters: { ...(saved.filters || {}), ...params.filters },
      };
      if (saved.filters?.findReqs && !url.searchParams.get("findReqs"))
        url.searchParams.set("findReqs", saved.filters.findReqs);
    }
  }
  const triKeys = [
    "isCarrier",
    "isCustomer",
    "isSupplier",
    "isInactive",
    "isActive",
  ];
  const keys = ["name", "notes", ...triKeys];
  let findWhere: any = null;
  const hasFindIndicators =
    keys.some((k) => url.searchParams.has(k)) ||
    url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of keys) {
      const v = url.searchParams.get(k);
      if (v) values[k] = v;
    }
    const simple: any = {};
    if (values.name)
      simple.name = { contains: values.name, mode: "insensitive" };
    if (values.notes)
      simple.notes = { contains: values.notes, mode: "insensitive" };
    for (const tk of triKeys) {
      const raw = values[tk];
      if (raw === "true") simple[tk] = true;
      else if (raw === "false") simple[tk] = false;
    }
    const multi = decodeRequests(url.searchParams.get("findReqs"));
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        name: (v) => ({ name: { contains: v, mode: "insensitive" } }),
        notes: (v) => ({ notes: { contains: v, mode: "insensitive" } }),
        isCarrier: (v) => ({ isCarrier: v === "true" }),
        isCustomer: (v) => ({ isCustomer: v === "true" }),
        isSupplier: (v) => ({ isSupplier: v === "true" }),
        isInactive: (v) => ({ isInactive: v === "true" }),
        isActive: (v) => ({ isActive: v === "true" }),
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      findWhere = mergeSimpleAndMulti(simple, multiWhere);
    } else findWhere = simple;
  }
  let baseParams = findWhere ? { ...effective, page: 1 } : effective;
  if (baseParams.filters) {
    const {
      findReqs: _omitFindReqs,
      find: _legacy,
      ...rest
    } = baseParams.filters;
    baseParams = { ...baseParams, filters: rest };
  }
  const prismaArgs = buildPrismaArgs<any>(baseParams, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["name", "notes"],
  });
  if (findWhere) prismaArgs.where = findWhere;
  // Hybrid roster loader portion (mirrors companies.tsx logic but includes filtering)
  const ID_CAP = 50000;
  const idRows = await prismaBase.company.findMany({
    where: prismaArgs.where,
    orderBy: prismaArgs.orderBy || { id: "asc" },
    select: { id: true },
    take: ID_CAP,
  });
  const idList = idRows.map((r) => r.id);
  const idListComplete = idRows.length < ID_CAP;
  const INITIAL_COUNT = 100;
  const initialIds = idList.slice(0, INITIAL_COUNT);
  let initialRows: any[] = [];
  if (initialIds.length) {
    initialRows = await prismaBase.company.findMany({
      where: { id: { in: initialIds } },
      select: {
        id: true,
        name: true,
        notes: true,
        isCarrier: true,
        isCustomer: true,
        isSupplier: true,
        isInactive: true,
        isActive: true,
      },
      orderBy: { id: "asc" },
    });
  }
  return json({
    idList,
    idListComplete,
    initialRows,
    total: idList.length,
    sort: baseParams.sort,
    dir: baseParams.dir,
    views,
    activeView: viewName || null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  if (form.get("_intent") === "saveView") {
    const name = String(form.get("name") || "").trim();
    if (!name) return redirect("/companies");
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const page = Number(params.page || 1);
    const perPage = Number(params.perPage || 20);
    const sort = (params.sort as any) || null;
    const dir = (params.dir as any) || null;
    const q = (params.q as any) || null;
    const filters: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (["page", "perPage", "sort", "dir", "q", "view"].includes(k)) continue;
      filters[k] = v;
    }
    if (params.findReqs) filters.findReqs = params.findReqs;
    await saveView({
      module: "companies",
      name,
      params: { page, perPage, sort, dir, q, filters },
    });
    return redirect(`/companies?view=${encodeURIComponent(name)}`);
  }
  return redirect("/companies");
}

export default function CompaniesIndexRoute() {
  const {
    idList,
    idListComplete,
    initialRows,
    total,
    views,
    activeView,
    sort,
    dir,
  } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const fetching = nav.state !== "idle"; // only reflects URL changes; row fetches are separate
  const { state, setIdList, addRows } = useRecordContext();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  // Seed/override RecordContext with loader-provided idList + initialRows so sorting/filtering take effect
  useEffect(() => {
    setIdList("companies", idList, idListComplete);
    if (initialRows?.length)
      addRows("companies", initialRows, { updateRecordsArray: true });
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
      render: (r: any) => (
        <Link to={`/companies/${r.id}`}>{r.name || `Company #${r.id}`}</Link>
      ),
    },
    {
      accessor: "isCarrier",
      title: "Carrier",
      render: (r: any) => (r.isCarrier ? "Yes" : ""),
    },
    {
      accessor: "isCustomer",
      title: "Customer",
      render: (r: any) => (r.isCustomer ? "Yes" : ""),
    },
    {
      accessor: "isSupplier",
      title: "Supplier",
      render: (r: any) => (r.isSupplier ? "Yes" : ""),
    },
    {
      accessor: "isInactive",
      title: "Inactive",
      render: (r: any) => (r.isInactive ? "Yes" : ""),
    },
    {
      accessor: "isActive",
      title: "Active",
      render: (r: any) => (r.isActive ? "Yes" : "No"),
    },
    { accessor: "notes", title: "Notes", sortable: true },
  ];
  return (
    <Stack gap="lg">
      <CompanyFindManagerNew />
      <BreadcrumbSet
        breadcrumbs={[{ label: "Companies", href: "/companies" }]}
      />
      <SavedViews views={views as any} activeView={activeView as any} />
      <Group justify="space-between" align="center">
        <Title order={2}>Companies</Title>
        {Array.from(sp.keys()).some(
          (k) => !["page", "perPage", "sort", "dir", "view"].includes(k)
        ) && (
          <Tooltip label="Clear all filters">
            <Button
              variant="default"
              onClick={() => {
                const next = new URLSearchParams(sp);
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
      </Group>
      <section>
        <Button
          component="a"
          href="/companies/new"
          variant="filled"
          color="blue"
        >
          New Company
        </Button>
      </section>
      <section>
        <Title order={4} mb="sm">
          All Companies ({total})
        </Title>
        <NavDataTable
          module="companies"
          records={records as any}
          columns={columns as any}
          fetching={rowFetching}
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
          onActivate={(rec: any) => {
            if (rec?.id != null) window.location.href = `/companies/${rec.id}`;
          }}
          onReachEnd={() => {
            if (!atEnd) requestMore();
          }}
        />
      </section>
    </Stack>
  );
}
