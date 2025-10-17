import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { prisma } from "../../../utils/prisma.server";
import { useEffect } from "react";
import { useRecords } from "../../../base/record/RecordContext";
import { JobFindManager } from "~/modules/job/findify/JobFindManager";
import { jobSearchSchema } from "~/modules/job/findify/job.search-schema";
import { buildWhere } from "~/base/find/buildWhere";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../../../base/find/multiFind";
import { listViews, saveView } from "../../../utils/views.server";

export async function loader(_args: LoaderFunctionArgs) {
  const url = new URL(_args.request.url);
  const views = await listViews("jobs");
  const viewName = url.searchParams.get("view");
  if (viewName) {
    const v = views.find((x: any) => x.name === viewName) as any;
    console.log("!!! found view", v);
    const vp: any = v?.params;
    if (vp?.filters) {
      const savedFilters = vp.filters as any;
      // carry advanced find blob if present
      if (savedFilters.findReqs && !url.searchParams.has("findReqs")) {
        url.searchParams.set("findReqs", savedFilters.findReqs);
      }
      // Map legacy/dotted keys to canonical param names
      const aliasMap: Record<string, string> = {
        "job.assembly.sku": "assemblySku",
        "job.assembly.name": "assemblyName",
        "job.assembly.status": "assemblyStatus",
      };
      // Apply all simple filters generically (avoid brittle whitelists)
      for (const [rawKey, rawVal] of Object.entries(savedFilters)) {
        if (rawKey === "findReqs") continue; // handled above
        if (rawVal === undefined || rawVal === null || rawVal === "") continue;
        const key = aliasMap[rawKey] || rawKey;
        if (!url.searchParams.has(key))
          url.searchParams.set(key, String(rawVal));
      }
    }
  }
  // Accept dotted alias keys (back-compat): job.assembly.* => assembly*
  const alias = (from: string, to: string) => {
    const v = url.searchParams.get(from);
    if (v !== null && !url.searchParams.has(to)) url.searchParams.set(to, v);
  };
  alias("job.assembly.sku", "assemblySku");
  alias("job.assembly.name", "assemblyName");
  alias("job.assembly.status", "assemblyStatus");
  const hasFindIndicators =
    [
      "id",
      "projectCode",
      "name",
      "status",
      "jobType",
      "endCustomerName",
      "companyId",
      "assemblySku",
      "assemblyName",
      "assemblyStatus",
    ].some((k) => url.searchParams.has(k)) || url.searchParams.has("findReqs");
  let where: any = undefined;
  if (hasFindIndicators) {
    const values: any = {};
    const pass = (k: string) => {
      const v = url.searchParams.get(k);
      if (v !== null && v !== "") values[k] = v;
    };
    [
      "id",
      "projectCode",
      "name",
      "status",
      "jobType",
      "endCustomerName",
      "companyId",
      "assemblySku",
      "assemblyName",
      "assemblyStatus",
    ].forEach(pass);
    const simple = buildWhere(values, jobSearchSchema);
    const multi = decodeRequests(url.searchParams.get("findReqs"));
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        id: (v) => ({ id: Number(v) }),
        projectCode: (v) => ({
          projectCode: { contains: v, mode: "insensitive" },
        }),
        name: (v) => ({ name: { contains: v, mode: "insensitive" } }),
        status: (v) => ({ status: { contains: v, mode: "insensitive" } }),
        jobType: (v) => ({ jobType: { contains: v, mode: "insensitive" } }),
        endCustomerName: (v) => ({
          endCustomerName: { contains: v, mode: "insensitive" },
        }),
        companyId: (v) => ({ companyId: Number(v) }),
        assemblySku: (v) => ({
          assemblies: {
            some: { product: { sku: { contains: v, mode: "insensitive" } } },
          },
        }),
        assemblyName: (v) => ({
          assemblies: { some: { name: { contains: v, mode: "insensitive" } } },
        }),
        assemblyStatus: (v) => ({
          assemblies: {
            some: { status: { contains: v, mode: "insensitive" } },
          },
        }),
      };
      const multiWhere = buildWhereFromRequests(multi, interpreters);
      where = mergeSimpleAndMulti(simple, multiWhere);
    } else {
      where = simple;
    }
  }
  const ID_CAP = 50000;
  const idRows = await prisma.job.findMany({
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
    initialRows = await prisma.job.findMany({
      where: { id: { in: initialIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        projectCode: true,
        company: { select: { name: true } },
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
  const intent = form.get("_intent");
  if (intent === "saveView") {
    const name = String(form.get("name") || "").trim();
    if (!name) return redirect("/jobs");
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const filters: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (["view"].includes(k)) continue;
      filters[k] = v;
    }
    const findReqs = params["findReqs"];
    if (findReqs) filters.findReqs = findReqs;
    await saveView({
      module: "jobs",
      name,
      params: { page: 1, perPage: 0, sort: null, dir: null, q: null, filters },
    });
    return redirect(`/jobs?view=${encodeURIComponent(name)}`);
  }
  return redirect("/jobs");
}

export default function JobsLayout() {
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
    setIdList("jobs", data.idList, data.idListComplete);
    if (data.initialRows?.length)
      addRows("jobs", data.initialRows, { updateRecordsArray: true });
  }, [data.idList, data.idListComplete, data.initialRows, setIdList, addRows]);
  return (
    <>
      <JobFindManager />
      <Outlet />
    </>
  );
}
