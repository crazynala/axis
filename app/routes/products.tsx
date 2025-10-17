import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { productSearchSchema } from "../find/product.search-schema";
import { buildWhere } from "../find/buildWhere";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../find/multiFind";
import { useEffect } from "react";
import { useRecords } from "../base/record/RecordContext";

export async function loader(args: LoaderFunctionArgs) {
  const [
    { runWithDbActivity, prismaBase },
    { buildPrismaArgs, parseTableParams },
    { listViews },
  ] = await Promise.all([
    import("../utils/prisma.server"),
    import("../utils/table.server"),
    import("../utils/views.server"),
  ]);
  return runWithDbActivity("products.index", async () => {
    const url = new URL(args.request.url);
    const q = url.searchParams;
    const params = parseTableParams(args.request.url);
    const views = await listViews("products");
    const viewName = q.get("view");
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

      // Build simple where: exclude name/sku from schema-driven builder, then add partial/insensitive clauses for them
      const valuesForSchema = { ...values };
      delete valuesForSchema.name;
      delete valuesForSchema.sku;
      const simpleBase = buildWhere(valuesForSchema, productSearchSchema);

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
      } else {
        findWhere = simple;
      }
    }
    let baseParams = findWhere ? { ...effective, page: 1 } : effective;
    if (baseParams.filters) {
      const {
        findReqs: _omitFindReqs,
        find: _legacy,
        refreshed: _omitRefreshed,
        ...rest
      } = baseParams.filters;
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

export async function action({ request }: ActionFunctionArgs) {
  const { prismaBase } = await import("../utils/prisma.server");
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
  if (intent !== "product.batchCreate")
    return json({ ok: false, error: "Unknown intent" }, { status: 400 });
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const errors: Array<{ index: number; message: string }> = [];
  let created = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const blank =
      !r ||
      Object.values(r).every((v) => v === null || v === undefined || v === "");
    if (blank) continue;
    try {
      const data: any = {};
      const str = (k: string) => {
        const v = r[k];
        if (v === undefined || v === null || v === "") return;
        data[k] = String(v).trim();
      };
      const num = (k: string) => {
        const v = r[k];
        if (v === undefined || v === null || v === "") return;
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`Invalid number for ${k}`);
        data[k] = n;
      };
      const bool = (k: string) => {
        const v = r[k];
        if (v === undefined || v === null || v === "") return;
        const s = String(v).toLowerCase();
        data[k] = s === "true" || s === "1" || s === "yes";
      };
      str("sku");
      str("name");
      str("type");
      num("supplierId");
      num("categoryId");
      num("purchaseTaxId");
      num("costPrice");
      num("manualSalePrice");
      bool("stockTrackingEnabled");
      bool("batchTrackingEnabled");
      await prismaBase.product.create({ data });
      created++;
    } catch (e: any) {
      const msg = e?.message || "Create failed";
      errors.push({ index: i, message: msg });
    }
  }
  return json({ ok: true, created, errors });
}
