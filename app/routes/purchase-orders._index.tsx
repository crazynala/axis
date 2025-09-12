import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group, Stack, Title } from "@mantine/core";
import { PurchaseOrderFindManager } from "../components/PurchaseOrderFindManager";
import { SavedViews } from "../components/find/SavedViews";
import { listViews, saveView } from "../utils/views.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../find/multiFind";
import { parseTableParams, buildPrismaArgs } from "../utils/table.server";
import { prisma } from "../utils/prisma.server";
import NavDataTable from "../components/RefactoredNavDataTable";
import { useHybridWindow } from "../record/useHybridWindow";
import { useRecordContext } from "../record/RecordContext";
import { formatUSD } from "../utils/format";

export const meta: MetaFunction = () => [{ title: "Purchase Orders" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const params = parseTableParams(args.request.url);
  const views = await listViews("purchase-orders");
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
  const keys = ["vendorName", "consigneeName", "locationName", "date"]; // simple keys
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
    if (values.vendorName)
      simple.company = {
        name: { contains: values.vendorName, mode: "insensitive" },
      };
    if (values.consigneeName)
      simple.consignee = {
        name: { contains: values.consigneeName, mode: "insensitive" },
      };
    if (values.locationName)
      simple.location = {
        name: { contains: values.locationName, mode: "insensitive" },
      };
    if (values.date) simple.date = values.date;
    const multi = decodeRequests(url.searchParams.get("findReqs"));
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        vendorName: (v) => ({
          company: { name: { contains: v, mode: "insensitive" } },
        }),
        consigneeName: (v) => ({
          consignee: { name: { contains: v, mode: "insensitive" } },
        }),
        locationName: (v) => ({
          location: { name: { contains: v, mode: "insensitive" } },
        }),
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
    searchableFields: [],
    filterMappers: {},
    defaultSort: { field: "id", dir: "asc" },
  });
  if (findWhere) prismaArgs.where = findWhere;
  // Hybrid roster subset (similar to companies index pattern)
  const ID_CAP = 50000;
  const idRows = await prisma.purchaseOrder.findMany({
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
    // minimal columns; additional computed columns (vendorName etc.) will be derived client-side on-demand if needed
    initialRows = await prisma.purchaseOrder.findMany({
      where: { id: { in: initialIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        date: true,
        company: { select: { id: true, name: true } },
        consignee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        lines: { select: { priceCost: true, quantity: true } },
      },
    });
    initialRows = initialRows.map((r: any) => ({
      ...r,
      vendorName: r.company?.name || "",
      consigneeName: r.consignee?.name || "",
      locationName: r.location?.name || "",
      totalCost: (r.lines || []).reduce(
        (sum: number, l: any) => sum + (l.priceCost || 0) * (l.quantity || 0),
        0
      ),
    }));
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
    if (!name) return redirect("/purchase-orders");
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
      module: "purchase-orders",
      name,
      params: { page, perPage, sort, dir, q, filters },
    });
    return redirect(`/purchase-orders?view=${encodeURIComponent(name)}`);
  }
  return redirect("/purchase-orders");
}

export default function PurchaseOrdersIndexRoute() {
  const { idList, idListComplete, initialRows, total, views, activeView } =
    useLoaderData<typeof loader>();
  const { state } = useRecordContext();
  const { records, fetching, requestMore, atEnd } = useHybridWindow({
    module: "purchase-orders",
    rowEndpointPath: "/purchase-orders/rows",
  });
  const columns = [
    {
      accessor: "id",
      title: "ID",
      width: 70,
      render: (r: any) => <Link to={`/purchase-orders/${r.id}`}>{r.id}</Link>,
    },
    { accessor: "date", title: "Date" },
    { accessor: "vendorName", title: "Vendor" },
    { accessor: "consigneeName", title: "Consignee" },
    { accessor: "locationName", title: "Location" },
    {
      accessor: "totalCost",
      title: "Total Cost",
      render: (r: any) => formatUSD(r.totalCost || 0),
    },
  ];
  return (
    <Stack gap="lg">
      <PurchaseOrderFindManager />
      <Group justify="space-between" align="center" mb="sm">
        <BreadcrumbSet
          breadcrumbs={[{ label: "Purchase Orders", href: "/purchase-orders" }]}
        />
        <Button
          component={Link}
          to="/purchase-orders/new"
          variant="filled"
          color="blue"
        >
          New
        </Button>
      </Group>
      <SavedViews views={views as any} activeView={activeView as any} />
      <Title order={4}>Purchase Orders ({total})</Title>
      <NavDataTable
        module="purchase-orders"
        records={records as any}
        columns={columns as any}
        fetching={fetching}
        onActivate={(rec: any) => {
          if (rec?.id != null)
            window.location.href = `/purchase-orders/${rec.id}`;
        }}
        onReachEnd={() => {
          if (!atEnd) requestMore();
        }}
      />
    </Stack>
  );
}
