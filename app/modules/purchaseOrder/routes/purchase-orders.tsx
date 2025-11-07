import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { getLogger } from "@aa/timber";
import { useEffect } from "react";
import { useRecords } from "../../../base/record/RecordContext";
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";
import { listViews, saveView } from "../../../utils/views.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../../../base/find/multiFind";
import { buildPrismaArgs, parseTableParams } from "../../../utils/table.server";

export async function loader(_args: LoaderFunctionArgs) {
  const log = getLogger("purchase-orders");
  const url = new URL(_args.request.url);

  // Views: load and apply saved filters if a named view is selected
  const views = await listViews("purchase-orders");
  const viewName = url.searchParams.get("view");
  const params = parseTableParams(_args.request.url);
  let effective = params;
  if (viewName) {
    const v = views.find((x: any) => x.name === viewName);
    if (v) {
      const saved = (v as any).params || {};
      effective = {
        page: Number(url.searchParams.get("page") || saved.page || 1),
        perPage: Number(url.searchParams.get("perPage") || saved.perPage || 20),
        sort: (url.searchParams.get("sort") || saved.sort || null) as any,
        dir: (url.searchParams.get("dir") || saved.dir || null) as any,
        q: (url.searchParams.get("q") || saved.q || null) as any,
        filters: { ...(saved.filters || {}), ...params.filters },
      } as any;
      // carry advanced blob if present on saved view but not in URL
      if (saved.filters?.findReqs && !url.searchParams.get("findReqs")) {
        url.searchParams.set("findReqs", saved.filters.findReqs);
      }
    }
  }

  // Build where from simple params + advanced multi-find
  const keys = [
    "id",
    "companyId",
    "consigneeCompanyId",
    "locationId",
    "status",
    "vendorName",
    "consigneeName",
    "locationName",
    "date",
    "memo",
  ];
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
    if (values.id) {
      const n = Number(values.id);
      if (Number.isFinite(n)) simple.id = n;
      else simple.id = values.id;
    }
    if (values.companyId) {
      const n = Number(values.companyId);
      if (Number.isFinite(n)) simple.companyId = n;
    }
    if (values.consigneeCompanyId) {
      const n = Number(values.consigneeCompanyId);
      if (Number.isFinite(n)) simple.consigneeCompanyId = n;
    }
    if (values.locationId) {
      const n = Number(values.locationId);
      if (Number.isFinite(n)) simple.locationId = n;
    }
    if (values.status) simple.status = values.status;
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
    if (values.memo)
      simple.memo = { contains: values.memo, mode: "insensitive" };

    const multi = decodeRequests(url.searchParams.get("findReqs"));
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        companyId: (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? { companyId: n } : {};
        },
        consigneeCompanyId: (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? { consigneeCompanyId: n } : {};
        },
        locationId: (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? { locationId: n } : {};
        },
        status: (v) => ({ status: v }),
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
        memo: (v) => ({ memo: { contains: v, mode: "insensitive" } }),
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      findWhere = mergeSimpleAndMulti(simple, multiWhere);
    } else findWhere = simple;
  }

  // Strip advanced blob from filters for table arg building
  let baseParams: any = findWhere ? { ...effective, page: 1 } : effective;
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
  // Map UI sort keys to Prisma orderBy (handle relational fields)
  if (baseParams.sort) {
    const dir = (baseParams.dir as any) || "asc";
    if (baseParams.sort === "vendorName")
      prismaArgs.orderBy = { company: { name: dir } } as any;
    else if (baseParams.sort === "consigneeName")
      prismaArgs.orderBy = { consignee: { name: dir } } as any;
    else if (baseParams.sort === "locationName")
      prismaArgs.orderBy = { location: { name: dir } } as any;
    else if (baseParams.sort === "totalCost") {
      // totalCost is computed; fall back to id to avoid Prisma error
      prismaArgs.orderBy = { id: dir } as any;
    }
  }

  // Hybrid roster subset
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
    const base = await prisma.purchaseOrder.findMany({
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
    initialRows = base.map((r: any) => ({
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
  log.debug(
    { initialRows: initialRows.length, total: idList.length },
    "purchaseOrders hybrid loader"
  );
  return json({
    idList,
    idListComplete,
    initialRows,
    total: idList.length,
    views,
    activeView: viewName || null,
  });
}

export default function PurchaseOrdersLayout() {
  const data = useLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
    views?: any[];
    activeView?: string | null;
  }>();
  const { setIdList, addRows } = useRecords();
  useEffect(() => {
    setIdList("purchase-orders", data.idList, data.idListComplete);
    if (data.initialRows?.length)
      addRows("purchase-orders", data.initialRows, {
        updateRecordsArray: true,
      });
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);
  return <Outlet />; // Find manager rendered in index route to mirror products pattern
}

export const shouldRevalidate = makeModuleShouldRevalidate("/purchase-orders", [
  // watch keys for PO index filter/view/sort
  "id",
  "companyId",
  "consigneeCompanyId",
  "locationId",
  "status",
  "vendorName",
  "consigneeName",
  "locationName",
  "date",
  "memo",
  "findReqs",
  "view",
  "sort",
  "dir",
  "perPage",
  "q",
]);

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
    if ((params as any).findReqs) filters.findReqs = (params as any).findReqs;
    await saveView({
      module: "purchase-orders",
      name,
      params: { page, perPage, sort, dir, q, filters },
    });
    return redirect(`/purchase-orders?view=${encodeURIComponent(name)}`);
  }
  return redirect("/purchase-orders");
}
