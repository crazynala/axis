import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
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
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";
import { allProductFindFields } from "../forms/productDetail";
import { buildProductMetadataFields } from "~/modules/productMetadata/utils/productMetadataFields";
import { deriveSemanticKeys } from "~/base/index/indexController";
import { getProductIndexDefaultColumns } from "../config/productIndexColumns";
import { normalizeColumnsValue } from "~/base/index/columns";

// Keys that influence the Products index filter/query
const PRODUCT_FIND_PARAM_KEYS = [
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
  // multi-find blob
  "findReqs",
  // table/view params that alter id order/selection
  "view",
  "sort",
  "dir",
  "perPage",
  "q",
];

export async function loader(args: LoaderFunctionArgs) {
  const [
    { runWithDbActivity, prismaBase, prisma },
    { buildPrismaArgs },
    { listViews, getView },
    { getFilterableProductAttributeDefinitions },
  ] = await Promise.all([
    import("~/utils/prisma.server"),
    import("~/utils/table.server"),
    import("~/utils/views.server"),
    import("~/modules/productMetadata/services/productMetadata.server"),
  ]);
  console.log("!! Product master loader");
  return runWithDbActivity("products.index", async () => {
    const url = new URL(args.request.url);
    const q = url.searchParams;
    const views = await listViews("products");
    const metadataDefinitions = await getFilterableProductAttributeDefinitions();
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
    const metadataFields = buildProductMetadataFields(metadataDefinitions, {
      onlyFilterable: true,
    });
    const semanticKeys = deriveSemanticKeys(
      allProductFindFields(metadataFields)
    );
    const hasSemantic =
      q.has("q") ||
      q.has("findReqs") ||
      semanticKeys.some((k) => {
        const v = q.get(k);
        return v !== null && v !== "";
      });
    const viewActive = !!viewName && !hasSemantic;
    const activeView = viewActive
      ? (views.find((x: any) => x.name === viewName) as any)
      : null;
    const viewParams: any = activeView?.params || null;
    const viewFilters: Record<string, any> = (viewParams?.filters || {}) as any;
    const effectivePage = Number(q.get("page") || viewParams?.page || 1);
    const effectivePerPage = Number(q.get("perPage") || viewParams?.perPage || 20);
    const effectiveSort = q.get("sort") || viewParams?.sort || null;
    const effectiveDir = q.get("dir") || viewParams?.dir || null;
    const effectiveQ = viewActive ? viewParams?.q ?? null : q.get("q");
    // Advanced / find filters
    const unaccent = (s: any) =>
      s == null
        ? s
        : String(s)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    const tokenize = (value: string | null) =>
      (value || "")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
    const buildTokenizedClause = (
      value: string | null,
      builder: (token: string) => Record<string, any>
    ) => {
      if (!value) return null;
      const tokens = tokenize(value);
      if (!tokens.length) return null;
      if (tokens.length === 1) return builder(tokens[0]);
      return { AND: tokens.map((token) => builder(token)) };
    };
    const findKeys = semanticKeys;
    const hasFindIndicators = viewActive
      ? findKeys.some(
          (k) => viewFilters[k] !== undefined && viewFilters[k] !== null
        ) || !!viewFilters.findReqs
      : findKeys.some((k) => q.has(k)) || q.has("findReqs");
    let findWhere: any = null;
    if (hasFindIndicators) {
      const values: Record<string, any> = {};
      for (const k of findKeys) {
        const v = viewActive ? viewFilters[k] : q.get(k);
        if (v !== null && v !== undefined && v !== "") values[k] = v;
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
      // Exclude fields we handle with unaccented shadow columns
      delete valuesForSchema.name;
      delete valuesForSchema.sku;
      delete valuesForSchema.description;
      const simpleBase = buildWhere(valuesForSchema, productSearchSchema);
      d("[products.index] simple values", valuesForSchema);
      d("[products.index] simpleBase", simpleBase);
      const simpleClauses: any[] = [];
      if (simpleBase && Object.keys(simpleBase).length > 0)
        simpleClauses.push(simpleBase);
      const nameClause = buildTokenizedClause(values.name || null, (token) => ({
        nameUnaccented: {
          contains: unaccent(token),
          mode: "insensitive",
        },
      }));
      if (nameClause) simpleClauses.push(nameClause);
      const skuClause = buildTokenizedClause(values.sku || null, (token) => ({
        sku: { contains: token, mode: "insensitive" },
      }));
      if (skuClause) simpleClauses.push(skuClause);
      if (values.description)
        simpleClauses.push({
          descriptionUnaccented: {
            contains: unaccent(values.description),
            mode: "insensitive",
          },
        });
      const { buildMetadataWhereFromParams, buildMetadataInterpreters } =
        await import(
          "~/modules/productMetadata/services/productMetadataFilters.server"
        );
      const metaParams = viewActive
        ? (() => {
            const sp = new URLSearchParams();
            for (const k of findKeys) {
              if (!k.startsWith("meta__")) continue;
              const v = viewFilters[k];
              if (v !== undefined && v !== null && v !== "")
                sp.set(k, String(v));
            }
            return sp;
          })()
        : q;
      const metadataWhere = buildMetadataWhereFromParams(
        metaParams,
        metadataDefinitions
      );
      if (metadataWhere) simpleClauses.push(metadataWhere);
      const simple =
        simpleClauses.length === 0
          ? null
          : simpleClauses.length === 1
          ? simpleClauses[0]
          : { AND: simpleClauses };
      const rawFindReqs = viewActive
        ? viewFilters.findReqs
        : q.get("findReqs");
      const multi = decodeRequests(rawFindReqs);
      if (multi) {
        const interpreters: Record<string, (val: any) => any> = {
          sku: (v) =>
            buildTokenizedClause(String(v), (token) => ({
              sku: { contains: token, mode: "insensitive" },
            })),
          name: (v) =>
            buildTokenizedClause(String(v), (token) => ({
              nameUnaccented: {
                contains: unaccent(token),
                mode: "insensitive",
              },
            })),
          description: (v) => ({
            descriptionUnaccented: {
              contains: unaccent(v),
              mode: "insensitive",
            },
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
              some: {
                child: {
                  nameUnaccented: {
                    contains: unaccent(v),
                    mode: "insensitive",
                  },
                },
              },
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
        Object.assign(
          interpreters,
          buildMetadataInterpreters(metadataDefinitions)
        );
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
    let baseParams: any = {
      page: findWhere ? 1 : effectivePage,
      perPage: effectivePerPage,
      sort: effectiveSort,
      dir: effectiveDir,
      q: effectiveQ ?? null,
      filters: viewActive ? viewFilters : filtersFromSearch(q, findKeys),
    };
    // Remove any find-related keys from generic filters to avoid accidental exact-match filtering
    if (baseParams.filters) {
      const {
        findReqs: _omitFindReqs,
        find: _legacy,
        refreshed: _omitRefreshed,
        ...rest
      } = baseParams.filters;
      // Also strip all explicit find keys handled above (name contains, sku contains, ids, enums, ranges, etc.)
      for (const k of ["ids", ...findKeys]) {
        if (k in rest) delete (rest as any)[k];
      }
      for (const k of Object.keys(rest)) {
        if (k.startsWith("meta__")) delete (rest as any)[k];
      }
      baseParams = { ...baseParams, filters: rest };
    }
    const { where, orderBy } = buildPrismaArgs(baseParams, {
      // 'type' is an enum in Prisma schema; do not include in fuzzy search.
      searchableFields: ["name", "sku", "description"],
      filterMappers: {},
      defaultSort: { field: "id", dir: "desc" },
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
      activeView: viewActive ? viewName || null : null,
      activeViewParams: viewActive ? viewParams || null : null,
      metadataDefinitions,
    });
  });
  return null;
}

// Avoid re-running the heavy products index loader on child/detail navigations
// unless relevant search params actually change or a mutation occurs.
export const shouldRevalidate = makeModuleShouldRevalidate(
  "/products",
  [...PRODUCT_FIND_PARAM_KEYS, "meta__*"],
  {
    // Block revalidation on child/detail routes and after non-GET mutations
    blockOnChild: true,
    blockOnMutation: false,
  }
);

export async function action({ request }: ActionFunctionArgs) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const form = await request.formData();
    const intent = String(form.get("_intent") || "");
    if (
      intent === "saveView" ||
      intent === "view.saveAs" ||
      intent === "view.overwriteFromUrl"
    ) {
      const name =
        intent === "view.overwriteFromUrl"
          ? String(form.get("viewId") || form.get("name") || "").trim()
          : String(form.get("name") || "").trim();
      if (!name) return redirect("/products");
      const url = new URL(request.url);
      const sp = url.searchParams;
      const { saveView, getView } = await import("~/utils/views.server");
      const { getFilterableProductAttributeDefinitions } = await import(
        "~/modules/productMetadata/services/productMetadata.server"
      );
      const metadataDefinitions = await getFilterableProductAttributeDefinitions();
      const metadataFields = buildProductMetadataFields(metadataDefinitions, {
        onlyFilterable: true,
      });
      const semanticKeys = deriveSemanticKeys(
        allProductFindFields(metadataFields)
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
        const base = await getView("products", viewParam);
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
      const defaultColumns = getProductIndexDefaultColumns();
      const columns =
        columnsFromUrl.length > 0
          ? columnsFromUrl
          : baseColumns.length > 0
          ? baseColumns
          : defaultColumns;
      await saveView({
        module: "products",
        name,
        params: {
          page: 1,
          perPage,
          sort,
          dir,
          q: nextQ ?? null,
          filters: nextFilters,
          columns,
        },
      });
      return redirect(`/products?view=${encodeURIComponent(name)}`);
    }
  }
  const { prismaBase } = await import("~/utils/prisma.server");
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
