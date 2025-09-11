import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useSearchParams, useNavigate, Form } from "@remix-run/react";
import { Button, Checkbox, NumberInput, TextInput, Group, Stack, Title, Select } from "@mantine/core";
import { ProductFindManager } from "../components/ProductFindManager";
import { SavedViews } from "../components/find/SavedViews";
import { BreadcrumbSet } from "packages/timber";
import { prisma, prismaBase } from "../utils/prisma.server";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { productSearchSchema } from "../find/product.search-schema";
import { buildWhere } from "../find/buildWhere";
import { getUser } from "../utils/auth.server";
import { NavDataTable } from "../components/NavDataTable";
import { listViews, saveView } from "../utils/views.server";
import { decodeRequests, buildWhereFromRequests, mergeSimpleAndMulti } from "../find/multiFind";

export const meta: MetaFunction = () => [{ title: "Products" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const lightweight = url.searchParams.get("light") === "1"; // performance bypass
  const params = parseTableParams(args.request.url);
  const me = await getUser(args.request);
  const defaultPerPage = me?.recordsPerPage ?? 20;
  const views = await listViews("products");
  const viewName = url.searchParams.get("view");
  let effective = params;
  if (viewName) {
    const v = views.find((x: any) => x.name === viewName);
    if (v) {
      const saved = v.params as any;
      effective = {
        page: Number(url.searchParams.get("page") || saved.page || 1),
        perPage: Number(url.searchParams.get("perPage") || saved.perPage || defaultPerPage),
        sort: (url.searchParams.get("sort") || saved.sort || null) as any,
        dir: (url.searchParams.get("dir") || saved.dir || null) as any,
        q: (url.searchParams.get("q") || saved.q || null) as any,
        filters: { ...(saved.filters || {}), ...params.filters },
      };
      // If saved view had find params, inject them unless current URL overrides
      if (saved.filters) {
        if (saved.filters.find && !url.searchParams.has("find")) {
          url.searchParams.set("find", saved.filters.find);
        }
        if (saved.filters.findReqs && !url.searchParams.has("findReqs")) {
          url.searchParams.set("findReqs", saved.filters.findReqs);
        }
      }
    }
  }
  if (!viewName) {
    // no saved view selected; apply default perPage if not specified
    effective = {
      ...effective,
      perPage: Number(url.searchParams.get("perPage") || defaultPerPage),
    };
  }
  // If find-mode query params present, override where and reset to first page
  let findWhere: any = null;
  const hasFindIndicators =
    [
      "sku",
      "name",
      "description",
      "type",
      "costPriceMin",
      "costPriceMax",
      "manualSalePriceMin",
      "manualSalePriceMax",
      "purchaseTaxId",
      "categoryId",
      "customerId",
      "supplierId",
      "stockTrackingEnabled",
      "batchTrackingEnabled",
      "componentChildSku",
      "componentChildName",
      "componentChildSupplierId",
      "componentChildType",
    ].some((k) => url.searchParams.has(k)) || url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: any = {};
    const pass = (k: string) => {
      const v = url.searchParams.get(k);
      if (v !== null && v !== "") values[k] = v;
    };
    [
      "sku",
      "name",
      "description",
      "type",
      "costPriceMin",
      "costPriceMax",
      "manualSalePriceMin",
      "manualSalePriceMax",
      "purchaseTaxId",
      "categoryId",
      "customerId",
      "supplierId",
      "stockTrackingEnabled",
      "batchTrackingEnabled",
      "componentChildSku",
      "componentChildName",
      "componentChildSupplierId",
      "componentChildType",
    ].forEach(pass);
    const simple = buildWhere(values, productSearchSchema);
    const multi = decodeRequests(url.searchParams.get("findReqs"));
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        sku: (v) => ({ sku: { contains: v, mode: "insensitive" } }),
        name: (v) => ({ name: { contains: v, mode: "insensitive" } }),
        description: (v) => ({
          description: { contains: v, mode: "insensitive" },
        }),
        type: (v) => ({ type: v }),
        costPriceMin: (v) => ({ costPrice: { gte: Number(v) } }),
        costPriceMax: (v) => ({ costPrice: { lte: Number(v) } }),
        manualSalePriceMin: (v) => ({ manualSalePrice: { gte: Number(v) } }),
        manualSalePriceMax: (v) => ({ manualSalePrice: { lte: Number(v) } }),
        purchaseTaxId: (v) => ({ purchaseTaxId: Number(v) }),
        categoryId: (v) => ({ categoryId: Number(v) }),
        customerId: (v) => ({ customerId: Number(v) }),
        supplierId: (v) => ({ supplierId: Number(v) }),
        stockTrackingEnabled: (v) => ({
          stockTrackingEnabled: v === "true" || v === true,
        }),
        batchTrackingEnabled: (v) => ({
          batchTrackingEnabled: v === "true" || v === true,
        }),
        componentChildSku: (v) => ({
          productLines: {
            some: { child: { sku: { contains: v, mode: "insensitive" } } },
          },
        }),
        componentChildName: (v) => ({
          productLines: {
            some: { child: { name: { contains: v, mode: "insensitive" } } },
          },
        }),
        componentChildSupplierId: (v) => ({
          productLines: { some: { child: { supplierId: Number(v) } } },
        }),
        componentChildType: (v) => ({
          productLines: { some: { child: { type: v } } },
        }),
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      findWhere = mergeSimpleAndMulti(simple, multiWhere);
    } else {
      findWhere = simple;
    }
  }

  // Build base params (reset to page 1 if in find mode)
  let baseParams = findWhere ? { ...effective, page: 1 } : effective;
  // Sanitize internal find-only params so they never leak into Prisma where
  if (baseParams.filters) {
    const { findReqs: _omitFindReqs, find: _legacyFindFlag, ...rest } = baseParams.filters;
    baseParams = { ...baseParams, filters: rest };
  }
  const prismaArgs = buildPrismaArgs<any>(baseParams, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["name", "sku", "type"],
    filterMappers: {
      sku: (v: string) => ({ sku: { contains: v, mode: "insensitive" } }),
      name: (v: string) => ({ name: { contains: v, mode: "insensitive" } }),
      type: (v: string) => ({ type: v as any }),
      stock: (v: string) => ({
        stockTrackingEnabled: v === "1" || v === "true",
      }),
      batch: (v: string) => ({
        batchTrackingEnabled: v === "1" || v === "true",
      }),
      minCost: (v: string) => ({ costPrice: { gte: Number(v) } }),
      maxCost: (v: string) => ({ costPrice: { lte: Number(v) } }),
    },
  });
  if (findWhere) prismaArgs.where = findWhere;
  let rows: any[] = [];
  let total: number = 0;
  if (lightweight) {
    // Use base client (no stock qty, aggregates) for faster listing
    const [r, t] = await Promise.all([prismaBase.product.findMany({ ...prismaArgs }), prismaBase.product.count({ where: (prismaArgs as any).where })]);
    rows = r;
    total = t;
  } else {
    const [r, t] = await Promise.all([prisma.product.findMany({ ...prismaArgs }), prisma.product.count({ where: (prismaArgs as any).where })]);
    rows = r;
    total = t;
  }
  return json({
    rows,
    total,
    page: effective.page,
    perPage: effective.perPage,
    q: effective.q,
    sort: effective.sort,
    dir: effective.dir,
    filters: effective.filters || {},
    views,
    activeView: viewName || null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "saveView") {
    const name = String(form.get("name") || "").trim();
    if (!name) return redirect("/products");
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
    // Include findReqs explicitly if present (no need for legacy find=1 flag)
    const findReqs = params["findReqs"];
    if (findReqs) filters.findReqs = findReqs;
    await saveView({
      module: "products",
      name,
      params: { page, perPage, sort, dir, q, filters },
    });
    return redirect(`/products?view=${encodeURIComponent(name)}`);
  }

  return redirect("/products");
}

export default function ProductsIndexRoute() {
  const { rows, total, page, perPage, q, filters, views, activeView } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const sortAccessor = (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sort") : null) || "id";
  const sortDirection = ((typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("dir") : null) as any) || "asc";

  return (
    <Stack gap="lg">
      <ProductFindManager />
      <Group justify="space-between" mb="xs" align="center">
        <Title order={2}>Products</Title>
        <BreadcrumbSet breadcrumbs={[{ label: "Products", href: "/products" }]} />
      </Group>
      <Group justify="flex-end" mb="xs">
        <Button component={Link} to="/products/new">
          New Product
        </Button>
        <Button
          variant={sp.get("light") === "1" ? "filled" : "light"}
          onClick={() => {
            const next = new URLSearchParams(sp);
            if (sp.get("light") === "1") next.delete("light");
            else next.set("light", "1");
            navigate(`?${next.toString()}`);
          }}
        >
          {sp.get("light") === "1" ? "Full Data" : "Light Mode"}
        </Button>
      </Group>
      <section>
        <SavedViews views={views as any} activeView={activeView} />

        <NavDataTable
          withTableBorder
          withColumnBorders
          highlightOnHover
          idAccessor="id"
          records={rows as any}
          totalRecords={total}
          page={page}
          recordsPerPage={perPage}
          recordsPerPageOptions={[10, 20, 50, 100]}
          autoFocusFirstRow
          keyboardNavigation
          onRowClick={(_record: any, rowIndex?: number) => {
            const rec = typeof rowIndex === "number" ? (rows as any[])[rowIndex] : _record;
            const id = rec?.id;
            if (id != null) navigate(`/products/${id}`);
          }}
          onRowActivate={(rec: any) => {
            if (rec?.id != null) navigate(`/products/${rec.id}`);
          }}
          onPageChange={(p: number) => {
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
            direction: sortDirection,
          }}
          onSortStatusChange={({ columnAccessor, direction }: { columnAccessor: string; direction: any }) => {
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
              render: (r: any) => <Link to={`/products/${r.id}`}>{r.id}</Link>,
            },
            { accessor: "sku", title: "SKU", sortable: true },
            { accessor: "name", title: "Name", sortable: true },
            { accessor: "type", title: "Type", sortable: true },
            { accessor: "costPrice", title: "Cost", sortable: true },
            { accessor: "manualSalePrice", title: "Manual", sortable: true },
            { accessor: "autoSalePrice", title: "Auto", sortable: true },
            { accessor: "c_stockQty", title: "Stock Qty", sortable: false },
            {
              accessor: "stockTrackingEnabled",
              title: "Stock",
              render: (r: any) => (r.stockTrackingEnabled ? "Yes" : "No"),
            },
            {
              accessor: "batchTrackingEnabled",
              title: "Batch",
              render: (r: any) => (r.batchTrackingEnabled ? "Yes" : "No"),
            },
          ]}
        />
      </section>
    </Stack>
  );
}
