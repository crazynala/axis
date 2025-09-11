import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { NavDataTable } from "../components/NavDataTable";
import { idLinkColumn, dateColumn, simpleColumn } from "../components/tableColumns";
import { buildRowNavHandlers } from "../components/tableRowHandlers";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";
import { ExpenseFindManager } from "../components/ExpenseFindManager";
import { SavedViews } from "../components/find/SavedViews";
import { listViews, saveView } from "../utils/views.server";
import { decodeRequests, buildWhereFromRequests, mergeSimpleAndMulti } from "../find/multiFind";

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
      if (saved.filters?.findReqs && !url.searchParams.get("findReqs")) url.searchParams.set("findReqs", saved.filters.findReqs);
    }
  }
  const keys = ["category", "details", "date"]; // simple find
  let findWhere: any = null;
  const hasFindIndicators = keys.some((k) => url.searchParams.has(k)) || url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of keys) {
      const v = url.searchParams.get(k);
      if (v) values[k] = v;
    }
    const simple: any = {};
    if (values.category) simple.category = { contains: values.category, mode: "insensitive" };
    if (values.details) simple.details = { contains: values.details, mode: "insensitive" };
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
    const { findReqs: _omitFindReqs, find: _legacy, ...rest } = baseParams.filters;
    baseParams = { ...baseParams, filters: rest };
  }
  const prismaArgs = buildPrismaArgs<any>(baseParams, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["category", "details"],
  });
  if (findWhere) prismaArgs.where = findWhere;
  const [rows, total] = await Promise.all([
    prisma.expense.findMany({
      ...prismaArgs,
      select: {
        id: true,
        date: true,
        category: true,
        details: true,
        priceCost: true,
      },
    }),
    prisma.expense.count({ where: prismaArgs.where }),
  ]);
  return json({
    rows,
    total,
    page: baseParams.page,
    perPage: baseParams.perPage,
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
  const { rows, total, page, perPage, views, activeView } = useLoaderData<typeof loader>();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const onPageChange = (p: number) => {
    const next = new URLSearchParams(sp);
    next.set("page", String(p));
    navigate(`?${next.toString()}`);
  };
  const onPerPageChange = (pp: number) => {
    const next = new URLSearchParams(sp);
    next.set("perPage", String(pp));
    next.set("page", "1");
    navigate(`?${next.toString()}`);
  };
  return (
    <div>
      <ExpenseFindManager />
      <BreadcrumbSet breadcrumbs={[{ label: "Expenses", href: "/expenses" }]} />
      <SavedViews views={views as any} activeView={activeView as any} />
      <NavDataTable
        withRowBorders
        records={rows as any}
        totalRecords={total}
        page={page}
        onPageChange={(p: number) => onPageChange(p)}
        recordsPerPage={perPage}
        onRecordsPerPageChange={(n: number) => onPerPageChange(n)}
        recordsPerPageOptions={[10, 20, 50, 100]}
        autoFocusFirstRow
        keyboardNavigation
        {...buildRowNavHandlers("expenses", navigate)}
        columns={[idLinkColumn("expenses"), dateColumn("date", "Date"), simpleColumn("category", "Category"), simpleColumn("details", "Details"), { accessor: "priceCost", title: "Cost" }]}
      />
    </div>
  );
}
