import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigation,
  useSearchParams,
  useNavigate,
  Form,
} from "@remix-run/react";
import {
  Button,
  Checkbox,
  NumberInput,
  TextInput,
  Group,
  Stack,
  Title,
  Select,
} from "@mantine/core";
import { BreadcrumbSet } from "packages/timber";
import { prisma } from "../utils/prisma.server";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { productSearchSchema } from "../find/product.search-schema";
import { buildWhere } from "../find/buildWhere";
import { getUser } from "../utils/auth.server";
import { DataTable } from "mantine-datatable";
import { listViews, saveView } from "../utils/views.server";

export const meta: MetaFunction = () => [{ title: "Products" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
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
        perPage: Number(
          url.searchParams.get("perPage") || saved.perPage || defaultPerPage
        ),
        sort: (url.searchParams.get("sort") || saved.sort || null) as any,
        dir: (url.searchParams.get("dir") || saved.dir || null) as any,
        q: (url.searchParams.get("q") || saved.q || null) as any,
        filters: { ...(saved.filters || {}), ...params.filters },
      };
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
  if (url.searchParams.get("find")) {
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
    findWhere = buildWhere(values, productSearchSchema);
  }

  const prismaArgs = buildPrismaArgs<any>(
    findWhere
      ? { ...effective, page: 1 } // reset to first page for find results
      : effective,
    {
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
    }
  );
  if (findWhere) prismaArgs.where = findWhere;
  const [rows, total] = await Promise.all([
    prisma.product.findMany({ ...prismaArgs }),
    prisma.product.count({ where: prismaArgs.where }),
  ]);
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
  const { rows, total, page, perPage, q, filters, views, activeView } =
    useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const sortAccessor =
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("sort")
      : null) || "id";
  const sortDirection =
    ((typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("dir")
      : null) as any) || "asc";

  return (
    <Stack gap="lg">
      <Group justify="space-between" mb="xs" align="center">
        <Title order={2}>Products</Title>
        <BreadcrumbSet
          breadcrumbs={[{ label: "Products", href: "/products" }]}
        />
      </Group>
      <Group justify="flex-end" mb="xs">
        <Button component={Link} to="/products/new">
          New Product
        </Button>
      </Group>

      <section>
        {/* Filters */}
        <Form method="get">
          <Group wrap="wrap" align="flex-end" mb="sm">
            <TextInput
              name="sku"
              label="SKU"
              defaultValue={filters?.sku || ""}
              w={160}
            />
            <TextInput
              name="name"
              label="Name"
              defaultValue={filters?.name || ""}
              w={220}
            />
            <TextInput
              name="q"
              label="Search"
              placeholder="Any field"
              defaultValue={q || ""}
              w={200}
            />
            <Select
              name="type"
              label="Type"
              data={["CMT", "Fabric", "Finished", "Trim", "Service"].map(
                (v) => ({ value: v, label: v })
              )}
              defaultValue={filters?.type || null}
              clearable
              w={160}
            />
            <Checkbox
              name="stock"
              label="Stock"
              defaultChecked={
                filters?.stock === "1" || (filters?.stock as any) === true
              }
              onChange={() => {}}
            />
            <Checkbox
              name="batch"
              label="Batch"
              defaultChecked={
                filters?.batch === "1" || (filters?.batch as any) === true
              }
              onChange={() => {}}
            />
            <NumberInput
              name="minCost"
              label="Min Cost"
              w={140}
              defaultValue={
                filters?.minCost ? Number(filters.minCost) : undefined
              }
              allowDecimal
            />
            <NumberInput
              name="maxCost"
              label="Max Cost"
              w={140}
              defaultValue={
                filters?.maxCost ? Number(filters.maxCost) : undefined
              }
              allowDecimal
            />
            <Button type="submit" variant="default">
              Apply
            </Button>
          </Group>
        </Form>

        {/* Saved views */}
        <Group align="center" mb="sm" gap="xs">
          <Select
            placeholder="Saved views"
            data={(views || []).map((v: any) => ({
              value: v.name,
              label: v.name,
            }))}
            defaultValue={activeView || null}
            onChange={(val) => {
              const next = new URLSearchParams(sp);
              if (val) next.set("view", val);
              else next.delete("view");
              next.set("page", "1");
              navigate(`?${next.toString()}`);
            }}
            w={220}
            clearable
          />
          <Form method="post">
            <input type="hidden" name="_intent" value="saveView" />
            <Group gap="xs" align="center">
              <TextInput
                name="name"
                placeholder="Save current filters as…"
                w={220}
              />
              <Button type="submit">Save view</Button>
            </Group>
          </Form>
        </Group>

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
          onRowClick={(_record: any, rowIndex?: number) => {
            const rec =
              typeof rowIndex === "number"
                ? (rows as any[])[rowIndex]
                : _record;
            const id = rec?.id;
            if (id != null) navigate(`/products/${id}`);
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
            direction: sortDirection,
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
