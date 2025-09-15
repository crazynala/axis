import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";
import { ExpenseFindManager } from "../components/ExpenseFindManager";
import { SavedViews } from "../components/find/SavedViews";
import { listViews, saveView } from "../utils/views.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../find/multiFind";
import NavDataTable from "../components/RefactoredNavDataTable";
import { useHybridWindow } from "../record/useHybridWindow";
import { useRecordContext } from "../record/RecordContext";
import { Stack, Group, Title, Button, Tooltip } from "@mantine/core";
import { useEffect } from "react";
import { formatUSD } from "../utils/format";

export const meta: MetaFunction = () => [{ title: "Expenses" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const params = parseTableParams(args.request.url);
  const views = await listViews("expenses");
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
  const keys = ["category", "details", "date"];
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
    if (values.category)
      simple.category = { contains: values.category, mode: "insensitive" };
    if (values.details)
      simple.details = { contains: values.details, mode: "insensitive" };
    if (values.date) simple.date = values.date;
    const multi = decodeRequests(url.searchParams.get("findReqs"));
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        category: (v) => ({ category: { contains: v, mode: "insensitive" } }),
        details: (v) => ({ details: { contains: v, mode: "insensitive" } }),
        date: (v) => ({ date: v }),
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
    searchableFields: ["category", "details"],
  });
  if (findWhere) prismaArgs.where = findWhere;
  // Hybrid roster subset
  const ID_CAP = 50000;
  const idRows = await prisma.expense.findMany({
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
    initialRows = await prisma.expense.findMany({
      where: { id: { in: initialIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        date: true,
        category: true,
        details: true,
        priceCost: true,
      },
    });
  }
  return json({
    idList,
    idListComplete,
    initialRows,
    total: idList.length,
    views,
    activeView: viewName || null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  if (form.get("_intent") === "saveView") {
    const name = String(form.get("name") || "").trim();
    if (!name) return redirect("/expenses");
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
      module: "expenses",
      name,
      params: { page, perPage, sort, dir, q, filters },
    });
    return redirect(`/expenses?view=${encodeURIComponent(name)}`);
  }
  return redirect("/expenses");
}

export default function ExpensesIndexRoute() {
  const { idList, idListComplete, initialRows, total, views, activeView } =
    useLoaderData<typeof loader>();
  const { setIdList, addRows } = useRecordContext();
  useEffect(() => {
    setIdList("expenses", idList, idListComplete);
    if (initialRows?.length)
      addRows("expenses", initialRows, { updateRecordsArray: true });
  }, [idList, idListComplete, initialRows, setIdList, addRows]);
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { records, fetching, requestMore, atEnd } = useHybridWindow({
    module: "expenses",
    rowEndpointPath: "/expenses/rows",
  });
  const columns = [
    {
      accessor: "id",
      title: "ID",
      width: 70,
      render: (r: any) => <Link to={`/expenses/${r.id}`}>{r.id}</Link>,
    },
    { accessor: "date", title: "Date", sortable: true },
    { accessor: "category", title: "Category", sortable: true },
    { accessor: "details", title: "Details", sortable: true },
    {
      accessor: "priceCost",
      title: "Cost",
      render: (r: any) => formatUSD(r.priceCost || 0),
    },
  ];
  return (
    <Stack gap="lg">
      <ExpenseFindManager />
      <Group justify="space-between" align="center" mb="sm">
        <BreadcrumbSet
          breadcrumbs={[{ label: "Expenses", href: "/expenses" }]}
        />
        <Button
          component={Link}
          to="/expenses/new"
          variant="filled"
          color="blue"
        >
          New
        </Button>
      </Group>
      <SavedViews views={views as any} activeView={activeView as any} />
      <Group justify="space-between" align="center" mb="xs">
        <Title order={4}>Expenses ({total})</Title>
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
      <NavDataTable
        module="expenses"
        records={records as any}
        columns={columns as any}
        fetching={fetching}
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
          if (rec?.id != null) window.location.href = `/expenses/${rec.id}`;
        }}
        onReachEnd={() => {
          if (!atEnd) requestMore();
        }}
      />
    </Stack>
  );
}
