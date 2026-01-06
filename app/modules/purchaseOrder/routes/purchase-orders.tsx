import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { getLogger } from "@aa/timber";
import { useEffect } from "react";
import { useRecords } from "../../../base/record/RecordContext";
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";
import {
  deleteView,
  duplicateView,
  findViewByParam,
  getView,
  getViewUser,
  listViews,
  publishView,
  renameView,
  saveView,
  unpublishView,
  updateViewParams,
} from "../../../utils/views.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../../../base/find/multiFind";
import { buildPrismaArgs } from "../../../utils/table.server";
import { purchaseOrderSpec } from "../spec";
import { purchaseOrderColumns } from "../spec/indexList";
import {
  getDefaultColumnKeys,
  normalizeColumnsValue,
} from "~/base/index/columns";

export async function loader(_args: LoaderFunctionArgs) {
  const log = getLogger("purchase-orders");
  const url = new URL(_args.request.url);

  // Views: load and apply saved filters if a named view is selected
  const viewUser = await getViewUser(_args.request);
  const views = await listViews("purchase-orders", viewUser);
  const viewName = url.searchParams.get("view");
  const semanticKeys = Array.from(
    purchaseOrderSpec.find.deriveSemanticKeys()
  );
  const hasSemantic =
    url.searchParams.has("q") ||
    url.searchParams.has("findReqs") ||
    semanticKeys.some((k) => {
      const v = url.searchParams.get(k);
      return v !== null && v !== "";
    });
  const viewActive = !!viewName && !hasSemantic;
  const activeView = viewActive ? findViewByParam(views, viewName) : null;
  const viewParams: any = activeView?.params || null;
  const viewFilters: Record<string, any> = (viewParams?.filters || {}) as any;
  const effectivePage = Number(
    url.searchParams.get("page") || viewParams?.page || 1
  );
  const effectivePerPage = Number(
    url.searchParams.get("perPage") || viewParams?.perPage || 20
  );
  const effectiveSort = url.searchParams.get("sort") || viewParams?.sort || null;
  const effectiveDir = url.searchParams.get("dir") || viewParams?.dir || null;
  const effectiveQ = viewActive ? viewParams?.q ?? null : url.searchParams.get("q");

  // Build where from simple params + advanced multi-find
  const keys = semanticKeys;
  let findWhere: any = null;
  const hasFindIndicators = viewActive
    ? keys.some(
        (k) => viewFilters[k] !== undefined && viewFilters[k] !== null
      ) || !!viewFilters.findReqs
    : keys.some((k) => url.searchParams.has(k)) ||
      url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of keys) {
      const v = viewActive ? viewFilters[k] : url.searchParams.get(k);
      if (v !== null && v !== undefined && v !== "") values[k] = v;
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

    const rawFindReqs = viewActive
      ? viewFilters.findReqs
      : url.searchParams.get("findReqs");
    const multi = decodeRequests(rawFindReqs);
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

  const filtersFromSearch = (input: URLSearchParams, keysList: string[]) => {
    const filters: Record<string, any> = {};
    keysList.forEach((k) => {
      const v = input.get(k);
      if (v !== null && v !== "") filters[k] = v;
    });
    const findReqs = input.get("findReqs");
    if (findReqs) filters.findReqs = findReqs;
    return filters;
  };
  // Strip advanced blob from filters for table arg building
  let baseParams: any = {
    page: findWhere ? 1 : effectivePage,
    perPage: effectivePerPage,
    sort: effectiveSort,
    dir: effectiveDir,
    q: effectiveQ ?? null,
    filters: viewActive ? viewFilters : filtersFromSearch(url.searchParams, keys),
  };
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
    defaultSort: { field: "id", dir: "desc" },
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
    activeView: viewActive ? String(activeView?.id ?? viewName ?? "") || null : null,
    activeViewParams: viewActive ? viewParams || null : null,
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
    activeViewParams?: any | null;
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
  const intent = String(form.get("_intent") || "");
  const viewUser = await getViewUser(request);
  const viewId = String(form.get("viewId") || "").trim();
  const name = String(form.get("name") || "").trim();
  if (intent === "view.rename") {
    if (!viewId || !name) return redirect("/purchase-orders");
    await renameView({
      viewId,
      name,
      user: viewUser,
      module: "purchase-orders",
    });
    return redirect(`/purchase-orders?view=${encodeURIComponent(viewId)}`);
  }
  if (intent === "view.delete") {
    if (!viewId) return redirect("/purchase-orders");
    await deleteView({ viewId, user: viewUser, module: "purchase-orders" });
    return redirect("/purchase-orders");
  }
  if (intent === "view.duplicate") {
    if (!viewId) return redirect("/purchase-orders");
    const view = await duplicateView({
      viewId,
      name: name || null,
      user: viewUser,
      module: "purchase-orders",
    });
    return redirect(
      `/purchase-orders?view=${encodeURIComponent(String(view.id))}`
    );
  }
  if (intent === "view.publish") {
    if (!viewId) return redirect("/purchase-orders");
    await publishView({ viewId, user: viewUser, module: "purchase-orders" });
    return redirect(`/purchase-orders?view=${encodeURIComponent(viewId)}`);
  }
  if (intent === "view.unpublish") {
    if (!viewId) return redirect("/purchase-orders");
    await unpublishView({ viewId, user: viewUser, module: "purchase-orders" });
    return redirect(`/purchase-orders?view=${encodeURIComponent(viewId)}`);
  }
  if (
    intent === "saveView" ||
    intent === "view.saveAs" ||
    intent === "view.overwriteFromUrl"
  ) {
    if (intent === "view.overwriteFromUrl") {
      if (!viewId) return redirect("/purchase-orders");
    } else if (!name) {
      return redirect("/purchase-orders");
    }
    const url = new URL(request.url);
    const sp = url.searchParams;
    const semanticKeys = Array.from(
      purchaseOrderSpec.find.deriveSemanticKeys()
    );
    const q = sp.get("q");
    const findReqs = sp.get("findReqs");
    const filters: Record<string, any> = {};
    for (const k of semanticKeys) {
      const v = sp.get(k);
      if (v !== null && v !== "") filters[k] = v;
    }
    if (findReqs) filters.findReqs = findReqs;
    const hasSemantic =
      (q != null && q !== "") ||
      !!findReqs ||
      Object.keys(filters).length > (findReqs ? 1 : 0);
    const viewParam = sp.get("view");
    let baseParams: any = null;
    if (viewParam && !hasSemantic) {
      const base = await getView("purchase-orders", viewParam);
      baseParams = (base?.params || {}) as any;
    }
    const nextQ = hasSemantic ? q ?? null : baseParams?.q ?? null;
    const nextFilters = hasSemantic
      ? filters
      : { ...(baseParams?.filters || {}) };
    const perPage = Number(sp.get("perPage") || baseParams?.perPage || 20);
    const sort = sp.get("sort") || baseParams?.sort || null;
    const dir = sp.get("dir") || baseParams?.dir || null;
    const columnsFromUrl = normalizeColumnsValue(sp.get("columns"));
    const baseColumns = normalizeColumnsValue(baseParams?.columns);
    const defaultColumns = getDefaultColumnKeys(purchaseOrderColumns);
    const columns =
      columnsFromUrl.length > 0
        ? columnsFromUrl
        : baseColumns.length > 0
        ? baseColumns
        : defaultColumns;
    const params = {
      page: 1,
      perPage,
      sort,
      dir,
      q: nextQ ?? null,
      filters: nextFilters,
      columns,
    };
    if (intent === "view.overwriteFromUrl") {
      await updateViewParams({
        viewId,
        params,
        user: viewUser,
        module: "purchase-orders",
      });
      return redirect(`/purchase-orders?view=${encodeURIComponent(viewId)}`);
    }
    const view = await saveView({
      module: "purchase-orders",
      name,
      params,
      user: viewUser,
    });
    return redirect(
      `/purchase-orders?view=${encodeURIComponent(String(view.id))}`
    );
  }
  return redirect("/purchase-orders");
}
