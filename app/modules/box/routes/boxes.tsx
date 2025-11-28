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
import { parseTableParams, buildPrismaArgs } from "~/utils/table.server";
import { listViews, saveView } from "~/utils/views.server";
import { prismaBase } from "~/utils/prisma.server";
import { boxSearchSchema } from "../findify/box.search-schema";
import { fetchBoxesByIds } from "../services/boxHydrator.server";

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
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const q = url.searchParams;
  const params = parseTableParams(request.url);
  const views = await listViews("boxes");
  const viewName = q.get("view");
  let effective = params;
  if (viewName) {
    const viewDef = views.find((v: any) => v.name === viewName);
    if (viewDef) {
      const saved = (viewDef.params || {}) as any;
      effective = {
        page: Number(q.get("page") || saved.page || 1),
        perPage: Number(q.get("perPage") || saved.perPage || 20),
        sort: (q.get("sort") || saved.sort || null) as any,
        dir: (q.get("dir") || saved.dir || null) as any,
        q: (q.get("q") || saved.q || null) as any,
        filters: { ...(saved.filters || {}), ...(params.filters || {}) },
      };
      if (saved.filters?.findReqs && !q.get("findReqs")) {
        q.set("findReqs", saved.filters.findReqs);
      }
    }
  }

  const findKeys = BOX_FIND_PARAM_KEYS.filter(
    (key) => !["view", "sort", "dir", "perPage", "q", "findReqs"].includes(key)
  );
  const hasFindIndicators =
    findKeys.some((key) => q.has(key)) || q.has("findReqs");
  let findWhere: Record<string, any> | null = null;
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const key of findKeys) {
      const value = q.get(key);
      if (value !== null && value !== "") values[key] = value;
    }
    const simple = buildWhere(values, boxSearchSchema);
    const multi = decodeRequests(q.get("findReqs"));
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

  let baseParams = findWhere ? { ...effective, page: 1 } : effective;
  if (baseParams.filters) {
    const {
      findReqs: _omitFindReqs,
      find: _legacy,
      refreshed: _refreshed,
      ...rest
    } = baseParams.filters;
    for (const key of findKeys) delete (rest as any)[key];
    baseParams = { ...baseParams, filters: rest };
  }

  const { where, orderBy } = buildPrismaArgs(baseParams, {
    searchableFields: ["code", "description", "notes"],
    filterMappers: {},
    defaultSort: { field: "id", dir: "asc" },
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
    activeView: viewName || null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  if (form.get("_intent") === "saveView") {
    const name = String(form.get("name") || "").trim();
    if (!name) return redirect("/boxes");
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const filters: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (["view"].includes(key)) continue;
      filters[key] = value;
    }
    if (params.findReqs) filters.findReqs = params.findReqs;
    await saveView({
      module: "boxes",
      name,
      params: {
        page: 1,
        perPage: Number(params.perPage || 20),
        sort: params.sort || null,
        dir: params.dir || null,
        q: params.q || null,
        filters,
      },
    });
    return redirect(`/boxes?view=${encodeURIComponent(name)}`);
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
