import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { prismaBase, runWithDbActivity } from "../utils/prisma.server";
import { productSearchSchema } from "../find/product.search-schema";
import { buildWhere } from "../find/buildWhere";
import { decodeRequests, buildWhereFromRequests, mergeSimpleAndMulti } from "../find/multiFind";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { listViews } from "../utils/views.server";
import { useEffect } from "react";
import { useRecords } from "../record/RecordContext";

export async function loader(args: LoaderFunctionArgs) {
  return runWithDbActivity("products.index", async () => {
    const url = new URL(args.request.url);
    const params = parseTableParams(args.request.url);
    const views = await listViews("products");
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
    // Advanced / find filters
    const findKeys = [
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
    ];
    const hasFindIndicators = findKeys.some((k) => url.searchParams.has(k)) || url.searchParams.has("findReqs");
    let findWhere: any = null;
    if (hasFindIndicators) {
      const values: Record<string, any> = {};
      for (const k of findKeys) {
        const v = url.searchParams.get(k);
        if (v !== null && v !== "") values[k] = v;
      }
      const simple = buildWhere(values, productSearchSchema);
      const multi = decodeRequests(url.searchParams.get("findReqs"));
      if (multi) {
        const interpreters: Record<string, (val: any) => any> = {
          sku: (v) => ({ sku: { contains: v, mode: "insensitive" } }),
          name: (v) => ({ name: { contains: v, mode: "insensitive" } }),
          description: (v) => ({
            description: { contains: v, mode: "insensitive" },
          }),
          // 'type' enum: use equals semantics
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
          // child.type is enum; equals semantics
          componentChildType: (v) => ({
            productLines: { some: { child: { type: v } } },
          }),
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
    const { where, orderBy } = buildPrismaArgs(baseParams, {
      // 'type' is an enum in Prisma schema; do not include in fuzzy search.
      searchableFields: ["name", "sku", "description"],
      filterMappers: {},
      defaultSort: { field: "id", dir: "asc" },
    });
    if (findWhere) (where as any).AND = [...((where as any).AND || []), findWhere];

    const ID_CAP = 50000;
    const idRows = await prismaBase.product.findMany({
      where,
      orderBy,
      select: { id: true },
      take: ID_CAP,
    });
    const idList = idRows.map((r) => r.id);
    const idListComplete = idRows.length < ID_CAP;
    const INITIAL_COUNT = 100;
    const initialIds = idList.slice(0, INITIAL_COUNT);
    let initialRows: any[] = [];
    if (initialIds.length) {
      initialRows = await prismaBase.product.findMany({
        where: { id: { in: initialIds } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          costPrice: true,
          manualSalePrice: true,
          autoSalePrice: true,
          stockTrackingEnabled: true,
          batchTrackingEnabled: true,
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
  });
}

export default function ProductsLayout() {
  const data = useLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
  }>();
  const { setIdList, addRows } = useRecords();
  useEffect(() => {
    setIdList("products", data.idList, data.idListComplete);
    if (data.initialRows?.length) {
      addRows("products", data.initialRows, { updateRecordsArray: true });
    }
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);
  return <Outlet />;
}
