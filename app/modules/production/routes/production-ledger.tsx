import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { requireUserId } from "~/utils/auth.server";
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
} from "~/utils/views.server";
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";
import {
  getDefaultColumnKeys,
  normalizeColumnsValue,
} from "~/base/index/columns";
import { productionLedgerColumns } from "~/modules/production/spec/indexList";
import { fetchProductionLedgerRows } from "~/modules/production/services/productionLedger.server";
import {
  findBuiltInProductionLedgerView,
  productionLedgerBuiltInViews,
} from "~/modules/production/spec/ledgerViews";
import { loadProductionLedgerBuiltInView } from "~/modules/production/services/productionLedgerViews.server";

const PRODUCTION_LEDGER_FIND_PARAM_KEYS = [
  "view",
  "sort",
  "dir",
  "perPage",
  "q",
  "columns",
];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  const url = new URL(request.url);
  const viewUser = await getViewUser(request);
  const views = await listViews("production-ledger", viewUser);
  const viewName = url.searchParams.get("view");
  const hasSemantic = url.searchParams.has("q");
  const viewActive = !!viewName && !hasSemantic;
  const savedView = viewActive ? findViewByParam(views, viewName) : null;
  const builtInView =
    viewActive && !savedView ? findBuiltInProductionLedgerView(viewName) : null;
  const activeView = savedView || builtInView;
  const viewParams: any = activeView?.params || null;

  const effectiveQ = viewActive
    ? viewParams?.q ?? null
    : url.searchParams.get("q");
  const effectiveSort =
    url.searchParams.get("sort") || viewParams?.sort || null;
  const effectiveDir = url.searchParams.get("dir") || viewParams?.dir || null;

  const q = effectiveQ ? String(effectiveQ).trim() : "";

  let idList: number[] = [];
  let idListComplete = true;
  let initialRows: any[] = [];

  if (builtInView) {
    const { rows, idList: ids } = await loadProductionLedgerBuiltInView({
      viewId: builtInView.id as any,
      q: q || null,
    });
    idList = ids;
    idListComplete = true;
    initialRows = rows;
  } else {
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { job: { projectCode: { contains: q, mode: "insensitive" } } },
            { job: { name: { contains: q, mode: "insensitive" } } },
            { job: { company: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined;
    const allowedSort = new Set(["id", "name", "assemblyType"]);
    const sortKey =
      effectiveSort && allowedSort.has(String(effectiveSort))
        ? String(effectiveSort)
        : null;
    const orderBy = sortKey
      ? { [sortKey]: (effectiveDir as "asc" | "desc") || "asc" }
      : { id: "desc" };

    const ID_CAP = 50000;
    const idRows = await prisma.assembly.findMany({
      where,
      orderBy,
      select: { id: true },
      take: ID_CAP,
    });
    idList = idRows.map((r) => r.id);
    idListComplete = idRows.length < ID_CAP;

    const INITIAL_COUNT = 100;
    const initialIds = idList.slice(0, INITIAL_COUNT);
    if (initialIds.length) {
      const rawRows = await fetchProductionLedgerRows(initialIds);
      const map = new Map(rawRows.map((r) => [r.id, r] as const));
      initialRows = initialIds.map((id) => map.get(id)).filter(Boolean);
    }
  }

  return json({
    idList,
    idListComplete,
    initialRows,
    total: idList.length,
    views: [...productionLedgerBuiltInViews, ...views],
    activeView: viewActive
      ? String(activeView?.id ?? viewName ?? "") || null
      : null,
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
    if (!viewId || !name) return redirect("/production-ledger");
    await renameView({
      viewId,
      name,
      user: viewUser,
      module: "production-ledger",
    });
    return redirect(
      `/production-ledger?view=${encodeURIComponent(String(viewId))}`
    );
  }
  if (intent === "view.delete") {
    if (!viewId) return redirect("/production-ledger");
    await deleteView({ viewId, user: viewUser, module: "production-ledger" });
    return redirect("/production-ledger");
  }
  if (intent === "view.duplicate") {
    if (!viewId) return redirect("/production-ledger");
    const view = await duplicateView({
      viewId,
      name: name || null,
      user: viewUser,
      module: "production-ledger",
    });
    return redirect(
      `/production-ledger?view=${encodeURIComponent(String(view.id))}`
    );
  }
  if (intent === "view.publish") {
    if (!viewId) return redirect("/production-ledger");
    await publishView({ viewId, user: viewUser, module: "production-ledger" });
    return redirect(
      `/production-ledger?view=${encodeURIComponent(String(viewId))}`
    );
  }
  if (intent === "view.unpublish") {
    if (!viewId) return redirect("/production-ledger");
    await unpublishView({ viewId, user: viewUser, module: "production-ledger" });
    return redirect(
      `/production-ledger?view=${encodeURIComponent(String(viewId))}`
    );
  }
  if (
    intent === "saveView" ||
    intent === "view.saveAs" ||
    intent === "view.overwriteFromUrl"
  ) {
    if (intent === "view.overwriteFromUrl") {
      if (!viewId) return redirect("/production-ledger");
    } else if (!name) {
      return redirect("/production-ledger");
    }
    const url = new URL(request.url);
    const sp = url.searchParams;
    const q = sp.get("q");
    const hasSemantic = q != null && String(q).trim() !== "";
    const viewParam = sp.get("view");
    let baseParams: any = null;
    if (viewParam && !hasSemantic) {
      const base = await getView("production-ledger", viewParam);
      if (base?.params) {
        baseParams = base.params as any;
      } else {
        const builtIn = findBuiltInProductionLedgerView(viewParam);
        baseParams = builtIn?.params || null;
      }
    }
    const nextQ = hasSemantic ? q ?? null : baseParams?.q ?? null;
    const perPage = Number(sp.get("perPage") || baseParams?.perPage || 20);
    const sort = sp.get("sort") || baseParams?.sort || null;
    const dir = sp.get("dir") || baseParams?.dir || null;
    const columnsFromUrl = normalizeColumnsValue(sp.get("columns"));
    const baseColumns = normalizeColumnsValue(baseParams?.columns);
    const defaultColumns = getDefaultColumnKeys(productionLedgerColumns);
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
      filters: {},
      columns,
    };
    if (intent === "view.overwriteFromUrl") {
      await updateViewParams({
        viewId,
        params,
        user: viewUser,
        module: "production-ledger",
      });
      return redirect(
        `/production-ledger?view=${encodeURIComponent(String(viewId))}`
      );
    }
    const view = await saveView({
      module: "production-ledger",
      name,
      params,
      user: viewUser,
    });
    return redirect(
      `/production-ledger?view=${encodeURIComponent(String(view.id))}`
    );
  }
  return redirect("/production-ledger");
}

export const shouldRevalidate = makeModuleShouldRevalidate(
  "/production-ledger",
  PRODUCTION_LEDGER_FIND_PARAM_KEYS
);

export default function ProductionLedgerLayout() {
  return <Outlet />;
}
