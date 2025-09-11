import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData, useLocation, useNavigate } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { NavDataTable } from "../components/NavDataTable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";
import { ShipmentFindManager } from "../components/ShipmentFindManager";
import { SavedViews } from "../components/find/SavedViews";
import { listViews, saveView } from "../utils/views.server";
import { decodeRequests, buildWhereFromRequests, mergeSimpleAndMulti } from "../find/multiFind";

export const meta: MetaFunction = () => [{ title: "Shipments" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const params = parseTableParams(args.request.url);
  const views = await listViews("shipments");
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
  let findWhere: any = null;
  const findKeys = ["date", "dateReceived", "type", "shipmentType", "status", "trackingNo", "packingSlipCode", "carrierName", "senderName", "receiverName", "locationName"];
  const hasFindIndicators = findKeys.some((k) => url.searchParams.has(k)) || url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of findKeys) {
      const v = url.searchParams.get(k);
      if (v) values[k] = v;
    }
    // simple where (basic contains/equals heuristics)
    const simple: any = {};
    if (values.status) simple.status = { contains: values.status, mode: "insensitive" };
    if (values.type) simple.type = { contains: values.type, mode: "insensitive" };
    if (values.shipmentType)
      simple.shipmentType = {
        contains: values.shipmentType,
        mode: "insensitive",
      };
    if (values.trackingNo) simple.trackingNo = { contains: values.trackingNo, mode: "insensitive" };
    if (values.packingSlipCode)
      simple.packingSlipCode = {
        contains: values.packingSlipCode,
        mode: "insensitive",
      };
    if (values.date) simple.date = values.date ? new Date(values.date) : undefined;
    if (values.dateReceived) simple.dateReceived = values.dateReceived ? new Date(values.dateReceived) : undefined;
    const multi = decodeRequests(url.searchParams.get("findReqs"));
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        status: (v) => ({ status: { contains: v, mode: "insensitive" } }),
        type: (v) => ({ type: { contains: v, mode: "insensitive" } }),
        shipmentType: (v) => ({
          shipmentType: { contains: v, mode: "insensitive" },
        }),
        trackingNo: (v) => ({
          trackingNo: { contains: v, mode: "insensitive" },
        }),
        packingSlipCode: (v) => ({
          packingSlipCode: { contains: v, mode: "insensitive" },
        }),
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      findWhere = mergeSimpleAndMulti(simple, multiWhere);
    } else findWhere = simple;
  }
  let baseParams = findWhere ? { ...effective, page: 1 } : effective;
  if (baseParams.filters) {
    const { findReqs: _omitFindReqs, find: _legacyFind, ...rest } = baseParams.filters;
    baseParams = { ...baseParams, filters: rest };
  }
  const prismaArgs = buildPrismaArgs<any>(baseParams, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["trackingNo", "status", "shipmentType", "type"],
  });
  if (findWhere) prismaArgs.where = findWhere;
  const [rows, total] = await Promise.all([
    prisma.shipment.findMany({
      ...prismaArgs,
      select: {
        id: true,
        date: true,
        status: true,
        type: true,
        shipmentType: true,
        trackingNo: true,
        companySender: { select: { name: true } },
        companyReceiver: { select: { name: true } },
      },
    }),
    prisma.shipment.count({ where: prismaArgs.where }),
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
    if (!name) return redirect("/shipments");
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
      module: "shipments",
      name,
      params: { page, perPage, sort, dir, q, filters },
    });
    return redirect(`/shipments?view=${encodeURIComponent(name)}`);
  }
  return redirect("/shipments");
}

export default function ShipmentsIndexRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const onPageChange = (page: number) => {
    const url = new URL(location.pathname + location.search, window.location.origin);
    url.searchParams.set("page", String(page));
    navigate(url.pathname + "?" + url.searchParams.toString());
  };
  const onPerPageChange = (pp: number) => {
    const url = new URL(location.pathname + location.search, window.location.origin);
    url.searchParams.set("perPage", String(pp));
    url.searchParams.set("page", "1");
    navigate(url.pathname + "?" + url.searchParams.toString());
  };
  return (
    <div>
      <ShipmentFindManager />
      <BreadcrumbSet breadcrumbs={[{ label: "Shipments", href: "/shipments" }]} />
      <SavedViews views={(data as any).views || []} activeView={(data as any).activeView} />
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
          if (rec?.id != null) navigate(`/shipments/${rec.id}`);
        }}
        onRowClick={(rec: any) => {
          if (rec?.id != null) navigate(`/shipments/${rec.id}`);
        }}
        columns={[
          {
            accessor: "id",
            render: (r: any) => <Link to={`/shipments/${r.id}`}>{r.id}</Link>,
          },
          {
            accessor: "date",
            render: (r: any) => (r.date ? new Date(r.date).toLocaleDateString() : ""),
          },
          { accessor: "type" },
          { accessor: "shipmentType", title: "Ship Type" },
          { accessor: "status" },
          { accessor: "trackingNo", title: "Tracking" },
          {
            accessor: "companySender.name",
            title: "From",
            render: (r: any) => r.companySender?.name ?? "",
          },
          {
            accessor: "companyReceiver.name",
            title: "To",
            render: (r: any) => r.companyReceiver?.name ?? "",
          },
        ]}
      />
    </div>
  );
}
