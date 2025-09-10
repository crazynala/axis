import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useNavigation,
  useSearchParams,
  useNavigate,
  useLoaderData,
} from "@remix-run/react";
import { Button, Stack, Title } from "@mantine/core";
import { BreadcrumbSet } from "../../packages/timber";
import { DataTable } from "mantine-datatable";
import { CompanyFindManagerNew } from "../components/CompanyFindManagerNew";
import { SavedViews } from "../components/find/SavedViews";
import { listViews, saveView } from "../utils/views.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../find/multiFind";
import { parseTableParams, buildPrismaArgs } from "../utils/table.server";
import { prisma } from "../utils/prisma.server";

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
  const [rows, total] = await Promise.all([
    prisma.company.findMany({
      ...prismaArgs,
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
    }),
    prisma.company.count({ where: prismaArgs.where }),
  ]);
  return json({
    rows,
    total,
    page: baseParams.page,
    perPage: baseParams.perPage,
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
  const { rows, total, page, perPage, sort, dir, views, activeView } =
    useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const sortAccessor =
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("sort")
      : null) ||
    sort ||
    "id";
  const sortDirection =
    ((typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("dir")
      : null) as any) ||
    dir ||
    "asc";

  // New is handled in /companies/new; delete handled via this route's action

  return (
    <Stack gap="lg">
      <CompanyFindManagerNew />
      <BreadcrumbSet
        breadcrumbs={[{ label: "Companies", href: "/companies" }]}
      />
      <SavedViews views={views as any} activeView={activeView as any} />
      <Title order={2}>Companies</Title>

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
          All Companies
        </Title>
        <DataTable
          withTableBorder
          withColumnBorders
          highlightOnHover
          idAccessor="id"
          records={rows as any}
          totalRecords={total}
          page={page}
          recordsPerPage={perPage}
          recordsPerPageOptions={[10, 20, 50, 100]}
          fetching={busy}
          onRowClick={(_record: any, rowIndex?: number) => {
            const rec =
              typeof rowIndex === "number"
                ? (rows as any[])[rowIndex]
                : _record;
            const id = rec?.id;
            if (id != null) navigate(`/companies/${id}`);
          }}
          onPageChange={(p) => {
            const next = new URLSearchParams(sp);
            next.set("page", String(p));
            navigate(`?${next.toString()}`);
          }}
          onRecordsPerPageChange={(n: number) => {
            const next = new URLSearchParams(sp);
            next.set("perPage", String(n));
            next.set("page", "1");
            navigate(`?${next.toString()}`);
          }}
          sortStatus={{
            columnAccessor: sortAccessor,
            direction: sortDirection as any,
          }}
          onSortStatusChange={({ columnAccessor, direction }) => {
            const next = new URLSearchParams(sp);
            next.set("sort", String(columnAccessor));
            next.set("dir", direction);
            navigate(`?${next.toString()}`);
          }}
          columns={[
            {
              accessor: "id",
              title: "ID",
              width: 70,
              sortable: true,
              render: (r: any) => <Link to={`/companies/${r.id}`}>{r.id}</Link>,
            },
            {
              accessor: "name",
              title: "Name",
              sortable: true,
              render: (r: any) => (
                <Link to={`/companies/${r.id}`}>
                  {r.name || `Company #${r.id}`}
                </Link>
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
            { accessor: "notes", title: "Notes" },
          ]}
        />
      </section>
    </Stack>
  );
}
