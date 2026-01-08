import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { Prisma } from "@prisma/client";
import { getLogger } from "@aa/timber";
import { useEffect } from "react";
import { useRecords } from "../../../base/record/RecordContext";
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";
import { prisma } from "~/utils/prisma.server";
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
import { buildPurchaseOrderWarnings } from "../spec/warnings";
import {
  getDefaultColumnKeys,
  normalizeColumnsValue,
} from "~/base/index/columns";

function normalizeTaxRate(value: Prisma.Decimal | number | null | undefined) {
  const rate = new Prisma.Decimal(value ?? 0);
  return rate.gt(1) ? rate.div(100) : rate;
}

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
        invoiceTrackingStatus: true,
        company: { select: { id: true, name: true } },
        consignee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        lines: { select: { manualCost: true, priceCost: true, quantity: true } },
      },
    });
    const invoiceRows = await prisma.supplierInvoice.findMany({
      where: { purchaseOrderId: { in: initialIds } },
      select: { purchaseOrderId: true, type: true, totalExTax: true },
    });
    const lineRows = await prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: { in: initialIds } },
      select: {
        id: true,
        purchaseOrderId: true,
        manualCost: true,
        priceCost: true,
        taxRate: true,
      },
    });
    const lineIdToPo = new Map<number, number>();
    for (const line of lineRows) {
      const lineId = Number(line.id || 0);
      const poId = Number(line.purchaseOrderId || 0);
      if (!Number.isFinite(lineId) || !Number.isFinite(poId)) continue;
      lineIdToPo.set(lineId, poId);
    }
    const lineIds = lineRows.map((l) => l.id);
    const receiptLines = lineIds.length
      ? await prisma.shipmentLine.findMany({
          where: {
            purchaseOrderLineId: { in: lineIds },
            shipment: { type: "In" },
          },
          select: { purchaseOrderLineId: true, quantity: true },
        })
      : [];
    const receiptLineCountByPo = new Map<number, number>();
    for (const sl of receiptLines) {
      const lineId = Number(sl.purchaseOrderLineId || 0);
      if (!Number.isFinite(lineId) || !lineId) continue;
      const poId = lineIdToPo.get(lineId);
      if (!poId) continue;
      receiptLineCountByPo.set(poId, (receiptLineCountByPo.get(poId) || 0) + 1);
    }
    const invoicesByPo = new Map<number, typeof invoiceRows>();
    for (const inv of invoiceRows) {
      const poId = Number(inv.purchaseOrderId || 0);
      if (!Number.isFinite(poId) || !poId) continue;
      const list = invoicesByPo.get(poId) || [];
      list.push(inv);
      invoicesByPo.set(poId, list);
    }
    const linesByPo = new Map<number, typeof lineRows>();
    for (const line of lineRows) {
      const poId = Number(line.purchaseOrderId || 0);
      if (!Number.isFinite(poId) || !poId) continue;
      const list = linesByPo.get(poId) || [];
      list.push(line);
      linesByPo.set(poId, list);
    }
    const receivedByLine = new Map<number, Prisma.Decimal>();
    for (const sl of receiptLines) {
      const lid = Number(sl.purchaseOrderLineId || 0);
      if (!Number.isFinite(lid) || !lid) continue;
      const qty = new Prisma.Decimal(sl.quantity ?? 0);
      receivedByLine.set(
        lid,
        (receivedByLine.get(lid) || new Prisma.Decimal(0)).plus(qty)
      );
    }
    initialRows = base.map((r: any) => {
      const poId = Number(r.id || 0);
      const poInvoices = invoicesByPo.get(poId) || [];
      const poLines = linesByPo.get(poId) || [];
      let expectedExSum = new Prisma.Decimal(0);
      let expectedTaxSum = new Prisma.Decimal(0);
      let hasReceipts = false;
      for (const line of poLines) {
        const qty = receivedByLine.get(line.id) || new Prisma.Decimal(0);
        if (qty.gt(0)) hasReceipts = true;
        const unit = new Prisma.Decimal(line.manualCost ?? line.priceCost ?? 0);
        const lineEx = qty.mul(unit);
        const lineEx2 = lineEx.toDecimalPlaces(2);
        const taxRate = normalizeTaxRate(line.taxRate);
        const lineTax = lineEx2.mul(taxRate);
        const lineTax2 = lineTax.toDecimalPlaces(2);
        expectedExSum = expectedExSum.plus(lineEx2);
        expectedTaxSum = expectedTaxSum.plus(lineTax2);
      }
      const expectedIncSum = expectedExSum.plus(expectedTaxSum);
      const effectiveRate = expectedExSum.eq(0)
        ? new Prisma.Decimal(0)
        : expectedTaxSum.div(expectedExSum);
      let invoicedSum = new Prisma.Decimal(0);
      for (const inv of poInvoices) {
        const amt = new Prisma.Decimal(inv.totalExTax ?? 0).toDecimalPlaces(2);
        invoicedSum =
          inv.type === "CREDIT_MEMO"
            ? invoicedSum.minus(amt)
            : invoicedSum.plus(amt);
      }
      const invoicedIncSum = invoicedSum
        .mul(new Prisma.Decimal(1).plus(effectiveRate))
        .toDecimalPlaces(2);
      const expected2 = expectedIncSum.toDecimalPlaces(2);
      const invoiced2 = invoicedIncSum.toDecimalPlaces(2);
      const delta2 = invoiced2.minus(expected2);
      const warnings = buildPurchaseOrderWarnings({
        invoiceCount: poInvoices.length,
        hasReceipts,
        receiptShipmentLineCount: receiptLineCountByPo.get(poId) || 0,
        deltaRounded: delta2,
        expectedRounded: expected2,
        invoicedRounded: invoiced2,
        invoiceTrackingStatus: r.invoiceTrackingStatus,
      });
      return {
        ...r,
        vendorName: r.company?.name || "",
        consigneeName: r.consignee?.name || "",
        locationName: r.location?.name || "",
        totalCost: (r.lines || []).reduce((sum: number, l: any) => {
          const unit = Number(l.manualCost ?? l.priceCost ?? 0) || 0;
          return sum + unit * (Number(l.quantity || 0) || 0);
        }, 0),
        warnings,
      };
    });
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
