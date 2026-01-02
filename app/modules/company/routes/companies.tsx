import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Outlet,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { useEffect } from "react";
import { prisma } from "../../../utils/prisma.server";
import { useRecords } from "../../../base/record/RecordContext";
import { getView, listViews, saveView } from "../../../utils/views.server";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../../../base/find/multiFind";
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";

export async function loader(_args: LoaderFunctionArgs) {
  const url = new URL(_args.request.url);
  const unaccent = (s: any) =>
    s == null
      ? s
      : String(s)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
  const views = await listViews("companies");
  const viewName = url.searchParams.get("view");
  const filterKeys = [
    "name",
    "notes",
    "isCarrier",
    "isCustomer",
    "isSupplier",
    "isInactive",
  ];
  const semanticPresent =
    url.searchParams.has("q") ||
    url.searchParams.has("findReqs") ||
    filterKeys.some((k) => {
      const v = url.searchParams.get(k);
      return v !== null && v !== "";
    });
  const viewActive = !!viewName && !semanticPresent;
  const activeView = viewActive
    ? (views.find((x: any) => x.name === viewName) as any)
    : null;
  const viewParams: any = activeView?.params || null;
  const viewFilters: Record<string, any> = (viewParams?.filters || {}) as any;
  const effectivePage = Number(
    url.searchParams.get("page") || viewParams?.page || 1
  );
  const effectivePerPage = Number(
    url.searchParams.get("perPage") || viewParams?.perPage || 20
  );
  const effectiveQ = viewActive ? viewParams?.q ?? null : url.searchParams.get("q");
  const triKeys = ["isCarrier", "isCustomer", "isSupplier", "isInactive"];
  const keys = ["name", "notes", ...triKeys];
  let where: any = undefined;
  const hasFindIndicators = viewActive
    ? keys.some(
        (k) => viewFilters[k] !== undefined && viewFilters[k] !== null
      ) || !!viewFilters.findReqs
    : keys.some((k) => url.searchParams.has(k)) ||
      url.searchParams.has("findReqs") ||
      url.searchParams.has("q");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of keys) {
      const v = viewActive ? (viewFilters as any)[k] : url.searchParams.get(k);
      if (v !== null && v !== undefined && v !== "") values[k] = v;
    }
    const simple: any = {};
    if (values.name)
      simple.nameUnaccented = {
        contains: unaccent(String(values.name)),
        mode: "insensitive",
      };
    if (values.notes)
      simple.notesUnaccented = {
        contains: unaccent(String(values.notes)),
        mode: "insensitive",
      };
    for (const tk of triKeys) {
      const raw = values[tk];
      if (raw === true || raw === "true") simple[tk] = true;
      else if (raw === false || raw === "false") {
        if (tk === "isInactive") {
          simple.OR = [{ isInactive: false }, { isInactive: null }];
        } else {
          simple[tk] = false;
        }
      }
    }
    const rawFindReqs = viewActive
      ? viewFilters.findReqs
      : url.searchParams.get("findReqs");
    const multi = decodeRequests(rawFindReqs);
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        name: (v) => ({
          nameUnaccented: {
            contains: unaccent(String(v)),
            mode: "insensitive",
          },
        }),
        notes: (v) => ({
          notesUnaccented: {
            contains: unaccent(String(v)),
            mode: "insensitive",
          },
        }),
        isCarrier: (v) => ({ isCarrier: v === "true" || v === true }),
        isCustomer: (v) => ({ isCustomer: v === "true" || v === true }),
        isSupplier: (v) => ({ isSupplier: v === "true" || v === true }),
        isInactive: (v) =>
          v === "true" || v === true
            ? { isInactive: true }
            : { OR: [{ isInactive: false }, { isInactive: null }] },
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      where = mergeSimpleAndMulti(simple, multiWhere);
    } else {
      where = simple;
    }
  }
  if (effectiveQ != null && String(effectiveQ).trim() !== "") {
    const q = unaccent(String(effectiveQ).trim());
    const qWhere = {
      OR: [
        { nameUnaccented: { contains: q, mode: "insensitive" } },
        { notesUnaccented: { contains: q, mode: "insensitive" } },
      ],
    };
    where = where ? { AND: [where, qWhere] } : qWhere;
  }
  const sort = url.searchParams.get("sort") || viewParams?.sort || null;
  const dir = url.searchParams.get("dir") || viewParams?.dir || null;
  const orderBy = sort ? { [sort]: dir || "asc" } : { id: "desc" };
  const ID_CAP = 50000;
  const idRows = await prisma.company.findMany({
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
    initialRows = await prisma.company.findMany({
      where: { id: { in: initialIds } },
      orderBy,
      select: {
        id: true,
        name: true,
        notes: true,
        isCarrier: true,
        isCustomer: true,
        isSupplier: true,
        isInactive: true,
      },
    });
  }
  return json({
    idList,
    idListComplete,
    initialRows,
    total: idList.length,
    views,
    activeView: viewActive ? viewName || null : null,
    activeViewParams: viewActive ? viewParams || null : null,
    page: effectivePage,
    perPage: effectivePerPage,
    q: effectiveQ ?? null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (
    intent === "saveView" ||
    intent === "overwriteViewFromUrl" ||
    intent === "saveViewFromUrl" ||
    intent === "view.saveAs" ||
    intent === "view.overwriteFromUrl"
  ) {
    const url = new URL(request.url);
    const sp = url.searchParams;
    const filterKeys = [
      "name",
      "notes",
      "isCarrier",
      "isCustomer",
      "isSupplier",
      "isInactive",
    ];
    const q = sp.get("q");
    const findReqs = sp.get("findReqs");
    const filters: Record<string, any> = {};
    for (const k of filterKeys) {
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
      const base = await getView("companies", viewParam);
      baseParams = (base?.params || {}) as any;
    }
    const nextQ = hasSemantic ? q ?? null : baseParams?.q ?? null;
    const nextFilters = hasSemantic
      ? filters
      : { ...(baseParams?.filters || {}) };
    const perPage = Number(sp.get("perPage") || baseParams?.perPage || 20);
    const sort = sp.get("sort") || baseParams?.sort || null;
    const dir = sp.get("dir") || baseParams?.dir || null;
    const columns = sp.get("columns") || baseParams?.columns || null;
    const saveName =
      intent === "saveView" || intent === "view.saveAs"
        ? String(form.get("name") || "").trim()
        : intent === "saveViewFromUrl"
        ? String(form.get("newName") || "").trim()
        : String(form.get("viewId") || form.get("name") || "").trim();
    if (!saveName) return redirect("/companies");
    await saveView({
      module: "companies",
      name: saveName,
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
    return redirect(`/companies?view=${encodeURIComponent(saveName)}`);
  }
  return redirect("/companies");
}

// Prevent revalidation of the companies parent loader on child/detail routes
// and after mutations, keeping the found-set stable and avoiding heavy reloads.
export const shouldRevalidate = makeModuleShouldRevalidate("/companies", [
  // keys that can influence the companies index filter
  "name",
  "notes",
  "isCarrier",
  "isCustomer",
  "isSupplier",
  "isInactive",
  "findReqs",
  "view",
  "sort",
  "dir",
  "perPage",
  "q",
]);

export default function CompaniesLayout() {
  const data = useLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
    views?: any[];
    activeView?: string | null;
  }>();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { setIdList, addRows } = useRecords();
  useEffect(() => {
    setIdList("companies", data.idList, data.idListComplete);
    if (data.initialRows?.length) {
      addRows("companies", data.initialRows, { updateRecordsArray: true });
    }
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);

  return <Outlet />; // Find manager now rendered in index route to match modern pattern
}
