import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useLocation,
  useNavigate,
} from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { NavDataTable } from "../components/NavDataTable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group } from "@mantine/core";
import { InvoiceFindManager } from "../components/InvoiceFindManager";
import { SavedViews } from "../components/find/SavedViews";
import { listViews, saveView } from "../utils/views.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../find/multiFind";

export const meta: MetaFunction = () => [{ title: "Invoices" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const params = parseTableParams(args.request.url);
  const views = await listViews("invoices");
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
      if (saved.filters?.findReqs && !url.searchParams.get("findReqs")) {
        url.searchParams.set("findReqs", saved.filters.findReqs);
      }
    }
  }
  const findKeys = ["invoiceCode", "status", "companyName", "date"]; // companyName derived
  let findWhere: any = null;
  const hasFindIndicators =
    findKeys.some((k) => url.searchParams.has(k)) ||
    url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of findKeys) {
      const v = url.searchParams.get(k);
      if (v) values[k] = v;
    }
    const simple: any = {};
    if (values.invoiceCode)
      simple.invoiceCode = {
        contains: values.invoiceCode,
        mode: "insensitive",
      };
    if (values.status)
      simple.status = { contains: values.status, mode: "insensitive" };
    if (values.date)
      simple.date = values.date ? new Date(values.date) : undefined;
    const multi = decodeRequests(url.searchParams.get("findReqs"));
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        invoiceCode: (v) => ({
          invoiceCode: { contains: v, mode: "insensitive" },
        }),
        status: (v) => ({ status: { contains: v, mode: "insensitive" } }),
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
  const { where, orderBy, skip, take } = buildPrismaArgs(baseParams, {
    searchableFields: ["invoiceCode"],
    filterMappers: {},
    defaultSort: { field: "id", dir: "asc" },
  });
  if (findWhere)
    (where as any).AND = [...((where as any).AND || []), findWhere];
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        invoiceCode: true,
        date: true,
        status: true,
        company: { select: { name: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  const lines = await prisma.invoiceLine.findMany({
    where: { invoiceId: { in: ids } },
    select: { invoiceId: true, priceSell: true, quantity: true },
  });
  const totals = new Map<number, number>();
  for (const l of lines) {
    const amt = (l.priceSell ?? 0) * (l.quantity ?? 0);
    totals.set(l.invoiceId!, (totals.get(l.invoiceId!) ?? 0) + amt);
  }
  const withTotals = rows.map((r) => ({ ...r, amount: totals.get(r.id) ?? 0 }));
  return json({
    rows: withTotals,
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
    if (!name) return redirect("/invoices");
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
      module: "invoices",
      name,
      params: { page, perPage, sort, dir, q, filters },
    });
    return redirect(`/invoices?view=${encodeURIComponent(name)}`);
  }
  return redirect("/invoices");
}

export default function InvoicesIndexRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const onPageChange = (page: number) => {
    const url = new URL(
      location.pathname + location.search,
      window.location.origin
    );
    url.searchParams.set("page", String(page));
    navigate(url.pathname + "?" + url.searchParams.toString());
  };
  const onPerPageChange = (pp: number) => {
    const url = new URL(
      location.pathname + location.search,
      window.location.origin
    );
    url.searchParams.set("perPage", String(pp));
    url.searchParams.set("page", "1");
    navigate(url.pathname + "?" + url.searchParams.toString());
  };
  return (
    <div>
      <InvoiceFindManager />
      <Group justify="space-between" align="center" mb="sm">
        <BreadcrumbSet
          breadcrumbs={[{ label: "Invoices", href: "/invoices" }]}
        />
        <Button
          component={Link}
          to="/invoices/new"
          variant="filled"
          color="blue"
        >
          New
        </Button>
      </Group>
      <SavedViews
        views={(data as any).views || []}
        activeView={(data as any).activeView}
      />
      <NavDataTable
        withRowBorders
        records={data.rows as any}
        totalRecords={data.total}
        page={data.page}
        onPageChange={(p: number) => onPageChange(p)}
        recordsPerPage={data.perPage}
        onRecordsPerPageChange={(n: number) => onPerPageChange(n)}
        recordsPerPageOptions={[10, 20, 50, 100]}
        autoFocusFirstRow
        keyboardNavigation
        onRowActivate={(rec: any) => {
          if (rec?.id != null) navigate(`/invoices/${rec.id}`);
        }}
        onRowClick={(rec: any) => {
          if (rec?.id != null) navigate(`/invoices/${rec.id}`);
        }}
        columns={[
          {
            accessor: "id",
            render: (r: any) => <Link to={`/invoices/${r.id}`}>{r.id}</Link>,
          },
          { accessor: "invoiceCode", title: "Code" },
          {
            accessor: "date",
            render: (r: any) =>
              r.date ? new Date(r.date).toLocaleDateString() : "",
          },
          {
            accessor: "company.name",
            title: "Company",
            render: (r: any) => r.company?.name ?? "",
          },
          {
            accessor: "amount",
            title: "Amount",
            render: (r: any) => (r.amount ?? 0).toFixed(2),
          },
          { accessor: "status" },
        ]}
      />
    </div>
  );
}
