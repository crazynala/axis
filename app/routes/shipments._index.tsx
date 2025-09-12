import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";
import { Button, Group, Stack, Title } from "@mantine/core";
import { ShipmentFindManager } from "../components/ShipmentFindManager";
import { SavedViews } from "../components/find/SavedViews";
import { listViews, saveView } from "../utils/views.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../find/multiFind";
import RefactoredNavDataTable from "../components/RefactoredNavDataTable";
import { useHybridWindow } from "../record/useHybridWindow";
import { useRecordContext } from "../record/RecordContext";

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
  const findKeys = [
    "date",
    "dateReceived",
    "type",
    "shipmentType",
    "status",
    "trackingNo",
    "packingSlipCode",
    "carrierName",
    "senderName",
    "receiverName",
    "locationName",
  ];
  const hasFindIndicators =
    findKeys.some((k) => url.searchParams.has(k)) ||
    url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of findKeys) {
      const v = url.searchParams.get(k);
      if (v) values[k] = v;
    }
    // simple where (basic contains/equals heuristics)
    const simple: any = {};
    if (values.status)
      simple.status = { contains: values.status, mode: "insensitive" };
    if (values.type)
      simple.type = { contains: values.type, mode: "insensitive" };
    if (values.shipmentType)
      simple.shipmentType = {
        contains: values.shipmentType,
        mode: "insensitive",
      };
    if (values.trackingNo)
      simple.trackingNo = { contains: values.trackingNo, mode: "insensitive" };
    if (values.packingSlipCode)
      simple.packingSlipCode = {
        contains: values.packingSlipCode,
        mode: "insensitive",
      };
    if (values.date)
      simple.date = values.date ? new Date(values.date) : undefined;
    if (values.dateReceived)
      simple.dateReceived = values.dateReceived
        ? new Date(values.dateReceived)
        : undefined;
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
    const {
      findReqs: _omitFindReqs,
      find: _legacyFind,
      ...rest
    } = baseParams.filters;
    baseParams = { ...baseParams, filters: rest };
  }
  const prismaArgs = buildPrismaArgs<any>(baseParams, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["trackingNo", "status", "shipmentType", "type"],
    filterMappers: {
      companyIdCarrier: (v: any) => ({
        companyIdCarrier: Number(v) || undefined,
      }),
      companyIdReceiver: (v: any) => ({
        companyIdReceiver: Number(v) || undefined,
      }),
      companyIdSender: (v: any) => ({
        companyIdSender: Number(v) || undefined,
      }),
      locationId: (v: any) => ({ locationId: Number(v) || undefined }),
      addressIdShip: (v: any) => ({ addressIdShip: Number(v) || undefined }),
      contactIdReceiver: (v: any) => ({
        contactIdReceiver: Number(v) || undefined,
      }),
    },
  });
  if (findWhere) prismaArgs.where = findWhere;
  // Hybrid roster subset
  const ID_CAP = 50000;
  const idRows = await prisma.shipment.findMany({
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
    initialRows = await prisma.shipment.findMany({
      where: { id: { in: initialIds } },
      orderBy: { id: "asc" },
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
  const { idList, idListComplete, initialRows, total, views, activeView } =
    useLoaderData<typeof loader>();
  const { records, fetching, requestMore, atEnd } = useHybridWindow({
    module: "shipments",
    rowEndpointPath: "/shipments/rows",
  });
  const columns = [
    {
      accessor: "id",
      title: "ID",
      width: 70,
      render: (r: any) => <Link to={`/shipments/${r.id}`}>{r.id}</Link>,
    },
    {
      accessor: "date",
      title: "Date",
      render: (r: any) => (r.date ? new Date(r.date).toLocaleDateString() : ""),
    },
    { accessor: "type", title: "Type" },
    { accessor: "shipmentType", title: "Ship Type" },
    { accessor: "status", title: "Status" },
    { accessor: "trackingNo", title: "Tracking" },
    {
      accessor: "companySender.name",
      title: "From",
      render: (r: any) => r.companySender?.name || "",
    },
    {
      accessor: "companyReceiver.name",
      title: "To",
      render: (r: any) => r.companyReceiver?.name || "",
    },
  ];
  return (
    <Stack gap="lg">
      <ShipmentFindManager />
      <Group justify="space-between" align="center" mb="sm">
        <BreadcrumbSet
          breadcrumbs={[{ label: "Shipments", href: "/shipments" }]}
        />
        <Button
          component={Link}
          to="/shipments/new"
          variant="filled"
          color="blue"
        >
          New
        </Button>
      </Group>
      <SavedViews views={views as any} activeView={activeView as any} />
      <Title order={4}>Shipments ({total})</Title>
      <RefactoredNavDataTable
        module="shipments"
        records={records as any}
        columns={columns as any}
        fetching={fetching}
        onActivate={(rec: any) => {
          if (rec?.id != null) window.location.href = `/shipments/${rec.id}`;
        }}
        onReachEnd={() => {
          if (!atEnd) requestMore();
        }}
        height={600}
      />
    </Stack>
  );
}
