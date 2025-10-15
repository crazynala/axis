import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { productSearchSchema } from "~/modules/product/findify/product.search-schema";
import { buildWhere } from "~/base/find/buildWhere";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "~/base/find/multiFind";
import { inspect } from "node:util";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { useRecords } from "~/base/record/RecordContext";

export async function loader(args: LoaderFunctionArgs) {
  const [
    { runWithDbActivity, prismaBase, prisma },
    { buildPrismaArgs, parseTableParams },
    { listViews },
  ] = await Promise.all([
    import("~/utils/prisma.server"),
    import("~/utils/table.server"),
    import("~/utils/views.server"),
  ]);
  return runWithDbActivity("products.index", async () => {
    const url = new URL(args.request.url);
    const q = url.searchParams;
    const params = parseTableParams(args.request.url);
    const views = await listViews("products");
    const viewName = q.get("view");
    const __debug = process.env.NODE_ENV !== "production";
    const d = (label: string, obj: any) => {
      if (!__debug) return;
      try {
        // eslint-disable-next-line no-console
        console.log(
          label,
          inspect(obj, {
            depth: null,
            colors: false,
            compact: false,
            breakLength: 140,
          })
        );
      } catch {
        // eslint-disable-next-line no-console
        console.log(label, obj);
      }
    };
    d("[products.index] request params", Object.fromEntries(q));
    let effective = params;
    if (viewName) {
      const v = views.find((x: any) => x.name === viewName);
      if (v) {
        const saved = v.params as any;
        effective = {
          page: Number(q.get("page") || saved.page || 1),
          perPage: Number(q.get("perPage") || saved.perPage || 20),
          sort: (q.get("sort") || saved.sort || null) as any,
          dir: (q.get("dir") || saved.dir || null) as any,
          q: (q.get("q") || saved.q || null) as any,
          filters: { ...(saved.filters || {}), ...params.filters },
        };
        if (saved.filters?.findReqs && !q.get("findReqs")) {
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
    const hasFindIndicators =
      findKeys.some((k) => q.has(k)) || q.has("findReqs");
    let findWhere: any = null;
    if (hasFindIndicators) {
      const values: Record<string, any> = {};
      for (const k of findKeys) {
        const v = q.get(k);
        if (v !== null && v !== "") values[k] = v;
      }
      // Guard against stray params accidentally treated as filters
      delete (values as any).refreshed;
      // Normalize enum-like params (case-insensitive -> canonical)
      const TYPE_CANON = [
        "CMT",
        "Fabric",
        "Finished",
        "Trim",
        "Service",
      ] as const;
      const canonType = (v: any) => {
        if (v == null || v === "") return v;
        const s = String(v).toLowerCase();
        const hit = TYPE_CANON.find((t) => t.toLowerCase() === s);
        return hit ?? v;
      };
      if (values.type) values.type = canonType(values.type);
      if ((values as any).componentChildType)
        (values as any).componentChildType = canonType(
          (values as any).componentChildType
        );
      // Build simple where: exclude name/sku from schema-driven builder, then add partial/insensitive clauses for them
      const valuesForSchema = { ...values };
      delete valuesForSchema.name;
      delete valuesForSchema.sku;
      const simpleBase = buildWhere(valuesForSchema, productSearchSchema);
      d("[products.index] simple values", valuesForSchema);
      d("[products.index] simpleBase", simpleBase);
      const simpleClauses: any[] = [];
      if (simpleBase && Object.keys(simpleBase).length > 0)
        simpleClauses.push(simpleBase);
      if (values.name)
        simpleClauses.push({
          name: { contains: values.name, mode: "insensitive" },
        });
      if (values.sku)
        simpleClauses.push({
          sku: { contains: values.sku, mode: "insensitive" },
        });
      const simple =
        simpleClauses.length === 0
          ? null
          : simpleClauses.length === 1
          ? simpleClauses[0]
          : { AND: simpleClauses };
      const multi = decodeRequests(q.get("findReqs"));
      if (multi) {
        const interpreters: Record<string, (val: any) => any> = {
          sku: (v) => ({ sku: { contains: v, mode: "insensitive" } }),
          name: (v) => ({ name: { contains: v, mode: "insensitive" } }),
          description: (v) => ({
            description: { contains: v, mode: "insensitive" },
          }),
          // 'type' enum: use equals semantics
          type: (v) => ({ type: canonType(v) }),
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
            productLines: { some: { child: { type: canonType(v) } } },
          }),
        };
        const multiWhere = buildWhereFromRequests(multi, interpreters);
        findWhere = mergeSimpleAndMulti(simple, multiWhere);
        d("[products.index] multiFind decoded", multi);
        d("[products.index] simpleWhere", simple);
        d("[products.index] multiWhere", multiWhere);
        d("[products.index] findWhere (merged)", findWhere);
      } else {
        findWhere = simple;
        d("[products.index] findWhere (simple)", findWhere);
      }
    }
    let baseParams = findWhere ? { ...effective, page: 1 } : effective;
    // Remove any find-related keys from generic filters to avoid accidental exact-match filtering
    if (baseParams.filters) {
      const {
        findReqs: _omitFindReqs,
        find: _legacy,
        refreshed: _omitRefreshed,
        ...rest
      } = baseParams.filters;
      // Also strip all explicit find keys handled above (name contains, sku contains, ids, enums, ranges, etc.)
      for (const k of [
        "ids", // prevent accidental where.ids from batch routes
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
      ]) {
        if (k in rest) delete (rest as any)[k];
      }
      baseParams = { ...baseParams, filters: rest };
    }
    const { where, orderBy } = buildPrismaArgs(baseParams, {
      // 'type' is an enum in Prisma schema; do not include in fuzzy search.
      searchableFields: ["name", "sku", "description"],
      filterMappers: {},
      defaultSort: { field: "id", dir: "asc" },
    });
    if (findWhere)
      (where as any).AND = [...((where as any).AND || []), findWhere];
    d("[products.index] prisma where", where);
    d("[products.index] prisma orderBy", orderBy);
    if (__debug) {
      try {
        const matchCount = await prismaBase.product.count({ where });
        // eslint-disable-next-line no-console
        console.log("[products.index] prisma where count", matchCount);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[products.index] count failed", (e as any)?.message);
      }
    }
    const ID_CAP = 50000;
    const idRows = await prismaBase.product.findMany({
      where,
      orderBy,
      select: { id: true },
      take: ID_CAP,
    });
    const idList = idRows.map((r) => r.id);
    const idListComplete = idRows.length < ID_CAP;
    d("[products.index] idList length", idList.length);
    const INITIAL_COUNT = 100;
    const initialIds = idList.slice(0, INITIAL_COUNT);
    let initialRows: any[] = [];
    if (initialIds.length) {
      const { fetchAndHydrateProductsByIds } = await import(
        "~/modules/product/services/hydrateProducts"
      );
      initialRows = await fetchAndHydrateProductsByIds(initialIds);
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
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const { prismaBase } = await import("~/utils/prisma.server");
  const ct = request.headers.get("content-type") || "";
  let intent = "";
  let body: any = null;
  if (ct.includes("application/json")) {
    try {
      body = await request.json();
      intent = String(body?._intent || "");
    } catch {
      // noop
    }
  }
  if (intent === "product.batchCreate") {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const { batchCreateProducts } = await import(
      "~/modules/product/services/batchCreateProducts.server"
    );
    const result = await batchCreateProducts(rows);
    return json(result);
  }
  if (intent === "product.batchUpdate") {
    const ids = Array.isArray(body?.ids)
      ? body.ids
          .map((n: any) => Number(n))
          .filter((n: any) => Number.isFinite(n))
      : [];
    const patch = body?.patch || {};
    const { batchUpdateProducts } = await import(
      "~/modules/product/services/batchUpdateProducts.server"
    );
    const result = await batchUpdateProducts(ids, patch);
    return json(result);
  }
  if (intent === "product.batchSaveRows") {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const { batchSaveProductRows } = await import(
      "~/modules/product/services/batchSaveProductRows.server"
    );
    const result = await batchSaveProductRows(rows);
    return json(result);
  }
  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
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
