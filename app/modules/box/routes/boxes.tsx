import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { buildWhere } from "~/base/find/buildWhere";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "~/base/find/multiFind";
import { useRecords } from "~/base/record/RecordContext";
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";
import { buildPrismaArgs } from "~/utils/table.server";
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
} from "~/utils/views.server";
import { prismaBase } from "~/utils/prisma.server";
import { boxSearchSchema } from "../findify/box.search-schema";
import { fetchBoxesByIds } from "../services/boxHydrator.server";
import { boxSpec } from "../spec";
import { boxColumns } from "../spec/indexList";
import {
  getDefaultColumnKeys,
  normalizeColumnsValue,
} from "~/base/index/columns";

const BOX_FIND_PARAM_KEYS = [
  "id",
  "code",
  "description",
  "state",
  "notes",
  "companyId",
  "locationId",
  "shipmentId",
  "warehouseNumberMin",
  "warehouseNumberMax",
  "shipmentNumberMin",
  "shipmentNumberMax",
  "lineProductSku",
  "lineProductName",
  "lineProductId",
  "lineJobId",
  "lineAssemblyId",
  "lineBatchId",
  "findReqs",
  "view",
  "sort",
  "dir",
  "perPage",
  "q",
];

export type BoxesLoaderData = {
  idList: number[];
  idListComplete: boolean;
  initialRows: any[];
  total: number;
  views: any[];
  activeView: string | null;
  activeViewParams: any | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const viewUser = await getViewUser(request);
  const views = await listViews("boxes", viewUser);
  const viewName = url.searchParams.get("view");
  const semanticKeys = Array.from(boxSpec.find.deriveSemanticKeys());
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
  const filtersFromSearch = (input: URLSearchParams, keys: string[]) => {
    const filters: Record<string, any> = {};
    keys.forEach((key) => {
      const value = input.get(key);
      if (value !== null && value !== "") filters[key] = value;
    });
    const findReqs = input.get("findReqs");
    if (findReqs) filters.findReqs = findReqs;
    return filters;
  };

  const findKeys = semanticKeys;
  const hasFindIndicators = viewActive
    ? findKeys.some(
        (key) => viewFilters[key] !== undefined && viewFilters[key] !== null
      ) || !!viewFilters.findReqs
    : findKeys.some((key) => url.searchParams.has(key)) ||
      url.searchParams.has("findReqs");
  let findWhere: Record<string, any> | null = null;
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const key of findKeys) {
      const value = viewActive ? viewFilters[key] : url.searchParams.get(key);
      if (value !== null && value !== undefined && value !== "")
        values[key] = value;
    }
    const simple = buildWhere(values, boxSearchSchema);
    const rawFindReqs = viewActive
      ? viewFilters.findReqs
      : url.searchParams.get("findReqs");
    const multi = decodeRequests(rawFindReqs);
    if (multi) {
      const interpreters: Record<string, (value: any) => any> = {
        code: (value) => ({
          code: { contains: String(value), mode: "insensitive" },
        }),
        description: (value) => ({
          description: { contains: String(value), mode: "insensitive" },
        }),
        notes: (value) => ({
          notes: { contains: String(value), mode: "insensitive" },
        }),
        state: (value) => ({ state: { equals: String(value) } }),
        companyId: (value) => ({ companyId: Number(value) }),
        locationId: (value) => ({ locationId: Number(value) }),
        shipmentId: (value) => ({ shipmentId: Number(value) }),
        warehouseNumberMin: (value) => ({
          warehouseNumber: { gte: Number(value) },
        }),
        warehouseNumberMax: (value) => ({
          warehouseNumber: { lte: Number(value) },
        }),
        shipmentNumberMin: (value) => ({
          shipmentNumber: { gte: Number(value) },
        }),
        shipmentNumberMax: (value) => ({
          shipmentNumber: { lte: Number(value) },
        }),
        lineProductSku: (value) => ({
          lines: {
            some: {
              product: {
                sku: { contains: String(value), mode: "insensitive" },
              },
            },
          },
        }),
        lineProductName: (value) => ({
          lines: {
            some: {
              product: {
                name: { contains: String(value), mode: "insensitive" },
              },
            },
          },
        }),
        lineProductId: (value) => ({
          lines: { some: { productId: Number(value) } },
        }),
        lineJobId: (value) => ({ lines: { some: { jobId: Number(value) } } }),
        lineAssemblyId: (value) => ({
          lines: { some: { assemblyId: Number(value) } },
        }),
        lineBatchId: (value) => ({
          lines: { some: { batchId: Number(value) } },
        }),
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      findWhere = mergeSimpleAndMulti(simple, multiWhere);
    } else {
      findWhere = simple;
    }
  }

  let baseParams: any = {
    page: findWhere ? 1 : effectivePage,
    perPage: effectivePerPage,
    sort: effectiveSort,
    dir: effectiveDir,
    q: effectiveQ ?? null,
    filters: viewActive ? viewFilters : filtersFromSearch(url.searchParams, findKeys),
  };
  if (baseParams.filters) {
    const {
      findReqs: _omitFindReqs,
      find: _legacy,
      refreshed: _refreshed,
      ...rest
    } = baseParams.filters;
    baseParams = { ...baseParams, filters: rest };
  }

  const { where, orderBy } = buildPrismaArgs(baseParams, {
    searchableFields: ["code", "description", "notes"],
    filterMappers: {},
    defaultSort: { field: "id", dir: "desc" },
  });
  if (findWhere) {
    const andList = Array.isArray((where as any).AND) ? (where as any).AND : [];
    (where as any).AND = [...andList, findWhere];
  }

  const ID_CAP = 50000;
  const idRows = await prismaBase.box.findMany({
    where,
    orderBy,
    select: { id: true },
    take: ID_CAP,
  });
  const idList = idRows.map((row: { id: number }) => row.id);
  const idListComplete = idRows.length < ID_CAP;
  const INITIAL_COUNT = 100;
  const initialIds = idList.slice(0, INITIAL_COUNT);
  const initialRows = initialIds.length
    ? await fetchBoxesByIds(initialIds)
    : [];

  return json<BoxesLoaderData>({
    idList,
    idListComplete,
    initialRows,
    total: idList.length,
    views,
    activeView: viewActive ? String(activeView?.id ?? viewName ?? "") || null : null,
    activeViewParams: viewActive ? viewParams || null : null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  const viewUser = await getViewUser(request);
  const viewId = String(form.get("viewId") || "").trim();
  const name = String(form.get("name") || "").trim();
  if (intent === "view.rename") {
    if (!viewId || !name) return redirect("/boxes");
    await renameView({ viewId, name, user: viewUser, module: "boxes" });
    return redirect(`/boxes?view=${encodeURIComponent(viewId)}`);
  }
  if (intent === "view.delete") {
    if (!viewId) return redirect("/boxes");
    await deleteView({ viewId, user: viewUser, module: "boxes" });
    return redirect("/boxes");
  }
  if (intent === "view.duplicate") {
    if (!viewId) return redirect("/boxes");
    const view = await duplicateView({
      viewId,
      name: name || null,
      user: viewUser,
      module: "boxes",
    });
    return redirect(`/boxes?view=${encodeURIComponent(String(view.id))}`);
  }
  if (intent === "view.publish") {
    if (!viewId) return redirect("/boxes");
    await publishView({ viewId, user: viewUser, module: "boxes" });
    return redirect(`/boxes?view=${encodeURIComponent(viewId)}`);
  }
  if (intent === "view.unpublish") {
    if (!viewId) return redirect("/boxes");
    await unpublishView({ viewId, user: viewUser, module: "boxes" });
    return redirect(`/boxes?view=${encodeURIComponent(viewId)}`);
  }
  if (
    intent === "saveView" ||
    intent === "view.saveAs" ||
    intent === "view.overwriteFromUrl"
  ) {
    if (intent === "view.overwriteFromUrl") {
      if (!viewId) return redirect("/boxes");
    } else if (!name) {
      return redirect("/boxes");
    }
    const url = new URL(request.url);
    const sp = url.searchParams;
    const semanticKeys = Array.from(boxSpec.find.deriveSemanticKeys());
    const q = sp.get("q");
    const findReqs = sp.get("findReqs");
    const filters: Record<string, any> = {};
    for (const key of semanticKeys) {
      const value = sp.get(key);
      if (value !== null && value !== "") filters[key] = value;
    }
    if (findReqs) filters.findReqs = findReqs;
    const hasSemantic =
      (q != null && q !== "") ||
      !!findReqs ||
      Object.keys(filters).length > (findReqs ? 1 : 0);
    const viewParam = sp.get("view");
    let baseParams: any = null;
    if (viewParam && !hasSemantic) {
      const base = await getView("boxes", viewParam);
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
    const defaultColumns = getDefaultColumnKeys(boxColumns);
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
        module: "boxes",
      });
      return redirect(`/boxes?view=${encodeURIComponent(viewId)}`);
    }
    const view = await saveView({
      module: "boxes",
      name,
      params,
      user: viewUser,
    });
    return redirect(`/boxes?view=${encodeURIComponent(String(view.id))}`);
  }
  return redirect("/boxes");
}

export const shouldRevalidate = makeModuleShouldRevalidate(
  "/boxes",
  BOX_FIND_PARAM_KEYS,
  {
    blockOnChild: true,
    blockOnMutation: false,
  }
);

export default function BoxesLayout() {
  const data = useLoaderData<BoxesLoaderData>();
  const { setIdList, addRows } = useRecords();
  useEffect(() => {
    setIdList("boxes", data.idList, data.idListComplete);
    if (data.initialRows?.length) {
      addRows("boxes", data.initialRows, { updateRecordsArray: true });
    }
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);
  return <Outlet context={data} />;
}
