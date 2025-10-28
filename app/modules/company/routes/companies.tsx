import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { prisma } from "../../../utils/prisma.server";
import { useRecords } from "../../../base/record/RecordContext";
import { CompanyFindManagerNew } from "~/modules/company/findify/CompanyFindManagerNew";
import { listViews, saveView } from "../../../utils/views.server";
import { decodeRequests, buildWhereFromRequests, mergeSimpleAndMulti } from "../../../base/find/multiFind";

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
  if (viewName) {
    const v = views.find((x: any) => x.name === viewName) as any;
    const vp: any = v?.params;
    if (vp?.filters) {
      const savedFilters = vp.filters as any;
      // carry advanced find blob if present
      if (savedFilters.findReqs && !url.searchParams.has("findReqs")) {
        url.searchParams.set("findReqs", savedFilters.findReqs);
      }
      // Apply all simple filters generically (avoid brittle whitelists)
      for (const [rawKey, rawVal] of Object.entries(savedFilters)) {
        if (rawKey === "findReqs") continue; // handled above
        if (rawVal === undefined || rawVal === null || rawVal === "") continue;
        if (!url.searchParams.has(rawKey)) url.searchParams.set(rawKey, String(rawVal));
      }
    }
  }
  const triKeys = ["isCarrier", "isCustomer", "isSupplier", "isInactive"];
  const keys = ["name", "notes", ...triKeys];
  let where: any = undefined;
  const hasFindIndicators = keys.some((k) => url.searchParams.has(k)) || url.searchParams.has("findReqs");
  if (hasFindIndicators) {
    const values: Record<string, any> = {};
    for (const k of keys) {
      const v = url.searchParams.get(k);
      if (v !== null && v !== "") values[k] = v;
    }
    const simple: any = {};
    if (values.name) simple.nameUnaccented = { contains: unaccent(values.name), mode: "insensitive" };
    if (values.notes) simple.notesUnaccented = { contains: unaccent(values.notes), mode: "insensitive" };
    for (const tk of triKeys) {
      const raw = values[tk];
      if (raw === "true") simple[tk] = true;
      else if (raw === "false") simple[tk] = false;
    }
    const multi = decodeRequests(url.searchParams.get("findReqs"));
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        name: (v) => ({ nameUnaccented: { contains: unaccent(v), mode: "insensitive" } }),
        notes: (v) => ({ notesUnaccented: { contains: unaccent(v), mode: "insensitive" } }),
        isCarrier: (v) => ({ isCarrier: v === "true" }),
        isCustomer: (v) => ({ isCustomer: v === "true" }),
        isSupplier: (v) => ({ isSupplier: v === "true" }),
        isInactive: (v) => ({ isInactive: v === "true" }),
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      where = mergeSimpleAndMulti(simple, multiWhere);
    } else {
      where = simple;
    }
  }
  const ID_CAP = 50000;
  const idRows = await prisma.company.findMany({
    where,
    orderBy: { id: "asc" },
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
      orderBy: { id: "asc" },
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
    activeView: viewName || null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  if (form.get("_intent") === "saveView") {
    const name = String(form.get("name") || "").trim();
    if (!name) return redirect("/companies");
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const filters: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (["view"].includes(k)) continue;
      filters[k] = v;
    }
    if (params.findReqs) filters.findReqs = params.findReqs;
    await saveView({
      module: "companies",
      name,
      params: { page: 1, perPage: 0, sort: null, dir: null, q: null, filters },
    });
    return redirect(`/companies?view=${encodeURIComponent(name)}`);
  }
  return redirect("/companies");
}

export default function CompaniesLayout() {
  const data = useLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
    views?: any[];
    activeView?: string | null;
  }>();
  const { setIdList, addRows } = useRecords();
  useEffect(() => {
    setIdList("companies", data.idList, data.idListComplete);
    if (data.initialRows?.length) {
      addRows("companies", data.initialRows, { updateRecordsArray: true });
    }
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);
  return (
    <>
      <CompanyFindManagerNew />
      <Outlet />
    </>
  );
}
