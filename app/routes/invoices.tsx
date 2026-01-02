import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { prismaBase } from "../utils/prisma.server";
import { InvoiceFindManager } from "../modules/invoice/findify/InvoiceFindManager";
import { useEffect } from "react";
import { useRecords } from "../base/record/RecordContext";
import { listViews, saveView, getView } from "../utils/views.server";
import { allInvoiceFindFields } from "../modules/invoice/forms/invoiceDetail";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../base/find/multiFind";
import { deriveSemanticKeys } from "../base/index/indexController";
import { invoiceColumns } from "~/modules/invoice/config/invoiceColumns";
import {
  getDefaultColumnKeys,
  normalizeColumnsValue,
} from "~/base/index/columns";

// Hybrid A' Light loader: returns full ordered id list (capped at 50k) and initial rows (first batch) with amount aggregates.
export async function loader(_args: LoaderFunctionArgs) {
  const url = new URL(_args.request.url);
  const views = await listViews("invoices");
  const viewName = url.searchParams.get("view");
  const semanticKeys = deriveSemanticKeys(allInvoiceFindFields());
  const hasSemantic =
    url.searchParams.has("q") ||
    url.searchParams.has("findReqs") ||
    semanticKeys.some((k) => {
      const v = url.searchParams.get(k);
      return v !== null && v !== "";
    });
  const viewActive = !!viewName && !hasSemantic;
  const activeView = viewActive
    ? (views.find((x: any) => x.name === viewName) as any)
    : null;
  const viewParams: any = activeView?.params || null;
  const viewFilters: Record<string, any> = (viewParams?.filters || {}) as any;
  const effectiveSort =
    url.searchParams.get("sort") || viewParams?.sort || null;
  const effectiveDir = url.searchParams.get("dir") || viewParams?.dir || null;
  const effectiveQ = viewActive
    ? viewParams?.q ?? null
    : url.searchParams.get("q");

  const keys = semanticKeys;
  let findWhere: any = null;
  const hasFindIndicators = viewActive
    ? keys.some((k) => viewFilters[k] !== undefined && viewFilters[k] !== null) ||
      !!viewFilters.findReqs
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
    }
    if (values.invoiceCode)
      simple.invoiceCode = { contains: values.invoiceCode, mode: "insensitive" };
    if (values.date) simple.date = values.date;
    if (values.status)
      simple.status = { contains: values.status, mode: "insensitive" };
    if (values.companyId) {
      const n = Number(values.companyId);
      if (Number.isFinite(n)) simple.companyId = n;
    }
    if (values.notes)
      simple.notes = { contains: values.notes, mode: "insensitive" };
    const rawFindReqs = viewActive
      ? viewFilters.findReqs
      : url.searchParams.get("findReqs");
    const multi = decodeRequests(rawFindReqs);
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        id: (v) => ({ id: Number(v) }),
        invoiceCode: (v) => ({
          invoiceCode: { contains: v, mode: "insensitive" },
        }),
        date: (v) => ({ date: v }),
        status: (v) => ({ status: { contains: v, mode: "insensitive" } }),
        companyId: (v) => ({ companyId: Number(v) }),
        notes: (v) => ({ notes: { contains: v, mode: "insensitive" } }),
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      findWhere = mergeSimpleAndMulti(simple, multiWhere);
    } else {
      findWhere = simple;
    }
  }
  if (effectiveQ != null && String(effectiveQ).trim() !== "") {
    const q = String(effectiveQ).trim();
    const qWhere = {
      OR: [
        { invoiceCode: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        { status: { contains: q, mode: "insensitive" } },
        { company: { name: { contains: q, mode: "insensitive" } } },
      ],
    };
    findWhere = findWhere ? { AND: [findWhere, qWhere] } : qWhere;
  }
  const orderBy = effectiveSort
    ? { [effectiveSort]: effectiveDir || "asc" }
    : { id: "desc" };
  // Cap of 50k
  const ID_CAP = 50000;
  // Fetch all ids up to cap
  const ids = await prismaBase.invoice.findMany({
    where: findWhere || undefined,
    orderBy,
    select: { id: true },
    take: ID_CAP,
  });
  const idList = ids.map((r) => r.id);
  const idListComplete = ids.length < ID_CAP; // if we hit cap, not complete
  // Load initial row slice (first 100 or fewer)
  const INITIAL_COUNT = 100;
  const initialIds = idList.slice(0, INITIAL_COUNT);
  let initialRows: any[] = [];
  if (initialIds.length) {
    const rows = await prismaBase.invoice.findMany({
      where: { id: { in: initialIds } },
      orderBy,
      select: {
        id: true,
        invoiceCode: true,
        date: true,
        status: true,
        company: { select: { name: true } },
      },
    });
    // Compute amounts for these
    const lines = await prismaBase.invoiceLine.findMany({
      where: { invoiceId: { in: initialIds } },
      select: { invoiceId: true, priceSell: true, quantity: true },
    });
    const totals = new Map<number, number>();
    for (const l of lines) {
      const amt = Number(l.priceSell ?? 0) * Number(l.quantity ?? 0);
      totals.set(l.invoiceId!, (totals.get(l.invoiceId!) ?? 0) + amt);
    }
    initialRows = rows.map((r) => ({ ...r, amount: totals.get(r.id) ?? 0 }));
  }
  return json({
    idList,
    idListComplete,
    initialRows,
    total: idList.length,
    views,
    activeView: viewActive ? viewName || null : null,
    activeViewParams: viewActive ? viewParams || null : null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
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
    if (!name) return redirect("/invoices");
    const url = new URL(request.url);
    const sp = url.searchParams;
    const semanticKeys = deriveSemanticKeys(allInvoiceFindFields());
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
      const base = await getView("invoices", viewParam);
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
    const defaultColumns = getDefaultColumnKeys(invoiceColumns);
    const columns =
      columnsFromUrl.length > 0
        ? columnsFromUrl
        : baseColumns.length > 0
        ? baseColumns
        : defaultColumns;
    await saveView({
      module: "invoices",
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
    return redirect(`/invoices?view=${encodeURIComponent(name)}`);
  }
  return redirect("/invoices");
}

export default function InvoicesLayout() {
  const data = useLoaderData<{
    idList: Array<number>;
    idListComplete: boolean;
    initialRows: any[];
    total: number;
    views?: any[];
    activeView?: string | null;
    activeViewParams?: any | null;
  }>();
  const { setIdList, addRows } = useRecords();
  useEffect(() => {
    setIdList("invoices", data.idList, data.idListComplete);
    if (data.initialRows?.length) {
      addRows("invoices", data.initialRows, { updateRecordsArray: true });
    }
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);
  return (
    <>
      <InvoiceFindManager />
      <Outlet />
    </>
  );
}
