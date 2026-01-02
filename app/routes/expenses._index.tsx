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
import { buildPrismaArgs } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";
import { ExpenseFindManager } from "~/modules/expense/findify/ExpenseFindManager";
import { FindRibbonAuto } from "../components/find/FindRibbonAuto";
import { listViews, saveView, getView } from "../utils/views.server";
import { allExpenseFindFields } from "../modules/expense/forms/expenseDetail";
import { deriveSemanticKeys } from "../base/index/indexController";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../base/find/multiFind";
import { VirtualizedNavDataTable } from "../components/VirtualizedNavDataTable";
import { useHybridWindow } from "../base/record/useHybridWindow";
import { useRecordContext } from "../base/record/RecordContext";
import { useRecords } from "../base/record/RecordContext";
import { Stack, Group, Title, Button } from "@mantine/core";
import { useEffect, useMemo } from "react";
import { expenseColumns } from "~/modules/expense/config/expenseColumns";
import {
  buildTableColumns,
  getDefaultColumnKeys,
  getVisibleColumnKeys,
  normalizeColumnsValue,
} from "~/base/index/columns";

export const meta: MetaFunction = () => [{ title: "Expenses" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const views = await listViews("expenses");
  const viewName = url.searchParams.get("view");
  const semanticKeys = deriveSemanticKeys(allExpenseFindFields());
  const hasSemantic =
    url.searchParams.has("q") ||
    url.searchParams.has("findReqs") ||
    semanticKeys.some((k) => {
      const v = url.searchParams.get(k);
      return v !== null && v !== "";
    });
  const viewActive = !!viewName && !hasSemantic;
  const activeView = viewActive
    ? (views.find((x: any) => x.name === viewName) as any)
    : null;
  const viewParams: any = activeView?.params || null;
  const viewFilters: Record<string, any> = (viewParams?.filters || {}) as any;
  const effectivePage = Number(
    url.searchParams.get("page") || viewParams?.page || 1
  );
  const effectivePerPage = Number(
    url.searchParams.get("perPage") || viewParams?.perPage || 20
  );
  const effectiveSort = url.searchParams.get("sort") || viewParams?.sort || null;
  const effectiveDir = url.searchParams.get("dir") || viewParams?.dir || null;
  const effectiveQ = viewActive ? viewParams?.q ?? null : url.searchParams.get("q");
  const keys = semanticKeys;
  let findWhere: any = null;
  const hasFindIndicators = viewActive
    ? keys.some((k) => viewFilters[k] !== undefined && viewFilters[k] !== null) ||
      !!viewFilters.findReqs
    : keys.some((k) => url.searchParams.has(k)) ||
      url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of keys) {
      const v = viewActive ? viewFilters[k] : url.searchParams.get(k);
      if (v !== null && v !== undefined && v !== "") values[k] = v;
    }
    const simple: any = {};
    if (values.category)
      simple.category = { contains: values.category, mode: "insensitive" };
    if (values.details)
      simple.details = { contains: values.details, mode: "insensitive" };
    if (values.date) simple.date = values.date;
    const rawFindReqs = viewActive
      ? viewFilters.findReqs
      : url.searchParams.get("findReqs");
    const multi = decodeRequests(rawFindReqs);
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
  const filtersFromSearch = (input: URLSearchParams, keysList: string[]) => {
    const filters: Record<string, any> = {};
    keysList.forEach((k) => {
      const v = input.get(k);
      if (v !== null && v !== "") filters[k] = v;
    });
    const findReqs = input.get("findReqs");
    if (findReqs) filters.findReqs = findReqs;
    return filters;
  };
  let baseParams = {
    page: findWhere ? 1 : effectivePage,
    perPage: effectivePerPage,
    sort: effectiveSort,
    dir: effectiveDir,
    q: effectiveQ ?? null,
    filters: viewActive ? viewFilters : filtersFromSearch(url.searchParams, keys),
  };
  if (baseParams.filters) {
    const {
      findReqs: _omitFindReqs,
      find: _legacy,
      ...rest
    } = baseParams.filters;
    baseParams = { ...baseParams, filters: rest };
  }
  const prismaArgs = buildPrismaArgs<any>(baseParams, {
    defaultSort: { field: "id", dir: "desc" },
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
    activeView: viewActive ? viewName || null : null,
    activeViewParams: viewActive ? viewParams || null : null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (
    intent === "saveView" ||
    intent === "view.saveAs" ||
    intent === "view.overwriteFromUrl"
  ) {
    const name =
      intent === "view.overwriteFromUrl"
        ? String(form.get("viewId") || form.get("name") || "").trim()
        : String(form.get("name") || "").trim();
    if (!name) return redirect("/expenses");
    const url = new URL(request.url);
    const sp = url.searchParams;
    const semanticKeys = deriveSemanticKeys(allExpenseFindFields());
    const q = sp.get("q");
    const findReqs = sp.get("findReqs");
    const filters: Record<string, any> = {};
    for (const k of semanticKeys) {
      const v = sp.get(k);
      if (v !== null && v !== "") filters[k] = v;
    }
    if (findReqs) filters.findReqs = findReqs;
    const hasSemantic =
      (q != null && q !== "") ||
      !!findReqs ||
      Object.keys(filters).length > (findReqs ? 1 : 0);
    const viewParam = sp.get("view");
    let baseParams: any = null;
    if (viewParam && !hasSemantic) {
      const base = await getView("expenses", viewParam);
      baseParams = (base?.params || {}) as any;
    }
    const nextQ = hasSemantic ? q ?? null : baseParams?.q ?? null;
    const nextFilters = hasSemantic
      ? filters
      : { ...(baseParams?.filters || {}) };
    const perPage = Number(sp.get("perPage") || baseParams?.perPage || 20);
    const sort = sp.get("sort") || baseParams?.sort || null;
    const dir = sp.get("dir") || baseParams?.dir || null;
    const columnsFromUrl = normalizeColumnsValue(sp.get("columns"));
    const baseColumns = normalizeColumnsValue(baseParams?.columns);
    const defaultColumns = getDefaultColumnKeys(expenseColumns);
    const columns =
      columnsFromUrl.length > 0
        ? columnsFromUrl
        : baseColumns.length > 0
        ? baseColumns
        : defaultColumns;
    await saveView({
      module: "expenses",
      name,
      params: {
        page: 1,
        perPage,
        sort,
        dir,
        q: nextQ ?? null,
        filters: nextFilters,
        columns,
      },
    });
    return redirect(`/expenses?view=${encodeURIComponent(name)}`);
  }
  return redirect("/expenses");
}

export default function ExpensesIndexRoute() {
  const {
    idList,
    idListComplete,
    initialRows,
    total,
    views,
    activeView,
    activeViewParams,
  } = useLoaderData<typeof loader>();
  const { setIdList, addRows } = useRecordContext();
  const { currentId, setCurrentId } = useRecords();
  useEffect(() => {
    setIdList("expenses", idList, idListComplete);
    if (initialRows?.length)
      addRows("expenses", initialRows, { updateRecordsArray: true });
  }, [idList, idListComplete, initialRows, setIdList, addRows]);
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const findConfig = useMemo(() => allExpenseFindFields(), []);
  const { records, fetching, requestMore, atEnd } = useHybridWindow({
    module: "expenses",
    rowEndpointPath: "/expenses/rows",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
  });
  const viewMode = !!activeView;
  const visibleColumnKeys = useMemo(
    () =>
      getVisibleColumnKeys({
        defs: expenseColumns,
        urlColumns: sp.get("columns"),
        viewColumns: activeViewParams?.columns,
        viewMode,
      }),
    [activeViewParams?.columns, sp, viewMode]
  );
  const columns = useMemo(
    () => buildTableColumns(expenseColumns, visibleColumnKeys),
    [visibleColumnKeys]
  );
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
      <FindRibbonAuto
        views={views as any}
        activeView={activeView as any}
        activeViewId={activeView as any}
        activeViewParams={activeViewParams as any}
        findConfig={findConfig}
        enableLastView
        columnsConfig={expenseColumns}
      />
      <Group justify="space-between" align="center" mb="xs">
        <Title order={4}>Expenses ({total})</Title>
      </Group>
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
        onRowDoubleClick={(rec: any) => {
          if (rec?.id != null) navigate(`/expenses/${rec.id}`);
        }}
        onRowClick={(rec: any) => setCurrentId(rec?.id)}
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
