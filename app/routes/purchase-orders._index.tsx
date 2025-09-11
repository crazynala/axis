import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData, useLocation, useNavigate, useSearchParams } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { NavDataTable } from "../components/NavDataTable";
import { idLinkColumn, dateColumn, simpleColumn } from "../components/tableColumns";
import { buildRowNavHandlers } from "../components/tableRowHandlers";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";
import { PurchaseOrderFindManager } from "../components/PurchaseOrderFindManager";
import { SavedViews } from "../components/find/SavedViews";
import { listViews, saveView } from "../utils/views.server";
import { decodeRequests, buildWhereFromRequests, mergeSimpleAndMulti } from "../find/multiFind";

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
      if (saved.filters?.findReqs && !url.searchParams.get("findReqs")) url.searchParams.set("findReqs", saved.filters.findReqs);
    }
  }
  // Simple find keys
  const keys = ["vendorName", "consigneeName", "locationName", "date"]; // plus any advanced via multi-find
  let findWhere: any = null;
  const hasFindIndicators = keys.some((k) => url.searchParams.has(k)) || url.searchParams.has("findReqs");
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
    if (values.date) {
      // naive date exact match
      simple.date = values.date;
    }
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
    const { findReqs: _omitFindReqs, find: _legacy, ...rest } = baseParams.filters;
    baseParams = { ...baseParams, filters: rest };
  }
  const prismaArgs = buildPrismaArgs<any>(baseParams, {
    searchableFields: [],
    filterMappers: {},
    defaultSort: { field: "id", dir: "asc" },
  });
  if (findWhere) prismaArgs.where = findWhere;
  const rowsRaw = await prisma.purchaseOrder.findMany({
    ...prismaArgs,
    select: {
      id: true,
      date: true,
      companyId: true,
      consigneeCompanyId: true,
      locationId: true,
      company: { select: { id: true, name: true } },
      consignee: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  });
  const total = await prisma.purchaseOrder.count({ where: prismaArgs.where });
  const ids = rowsRaw.map((r) => r.id);
  const lines = await prisma.purchaseOrderLine.findMany({
    where: { purchaseOrderId: { in: ids } },
    select: { purchaseOrderId: true, priceCost: true, quantity: true },
  });
  const totals = new Map<number, number>();
  for (const l of lines) {
    const amt = (l.priceCost ?? 0) * (l.quantity ?? 0);
    totals.set(l.purchaseOrderId!, (totals.get(l.purchaseOrderId!) ?? 0) + amt);
  }
  const vendorIds = Array.from(new Set(rowsRaw.map((r: any) => r.companyId).filter(Boolean)));
  const consigneeIds = Array.from(new Set(rowsRaw.map((r: any) => r.consigneeCompanyId).filter(Boolean)));
  const locationIds = Array.from(new Set(rowsRaw.map((r: any) => r.locationId).filter(Boolean)));
  const [vendors, consignees, locations] = await Promise.all([
    vendorIds.length
      ? prisma.company.findMany({
          where: { id: { in: vendorIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    consigneeIds.length
      ? prisma.company.findMany({
          where: { id: { in: consigneeIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    locationIds.length
      ? prisma.location.findMany({
          where: { id: { in: locationIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const vendorById = Object.fromEntries((vendors as any[]).map((c) => [c.id, c.name || String(c.id)]));
  const consigneeById = Object.fromEntries((consignees as any[]).map((c) => [c.id, c.name || String(c.id)]));
  const locationById = Object.fromEntries((locations as any[]).map((l) => [l.id, l.name || String(l.id)]));
  const rows = rowsRaw.map((r: any) => ({
    ...r,
    vendorName: r.company?.name ?? (r.companyId ? vendorById[r.companyId] : ""),
    consigneeName: r.consignee?.name ?? (r.consigneeCompanyId ? consigneeById[r.consigneeCompanyId] : ""),
    locationName: r.location?.name ?? (r.locationId ? locationById[r.locationId] : ""),
    totalCost: totals.get(r.id) ?? 0,
  }));
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
      <PurchaseOrderFindManager />
      <BreadcrumbSet breadcrumbs={[{ label: "Purchase Orders", href: "/purchase-orders" }]} />
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
        {...buildRowNavHandlers("purchase-orders", navigate)}
        columns={[
          idLinkColumn("purchase-orders"),
          dateColumn("date", "Date"),
          simpleColumn("vendorName", "Vendor"),
          simpleColumn("consigneeName", "Consignee"),
          simpleColumn("locationName", "Location"),
          { accessor: "totalCost", title: "Total Cost", render: (r: any) => (r.totalCost ?? 0).toFixed(2) },
        ]}
      />
    </div>
  );
}
