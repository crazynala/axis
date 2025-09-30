import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { useEffect } from "react";
import { useRecords } from "../base/record/RecordContext";
import { JobFindManager } from "~/modules/job/findify/JobFindManager";
import { jobSearchSchema } from "~/modules/job/findify/job.search-schema";
import { buildWhere } from "~/base/find/buildWhere";
import {
  decodeRequests,
  buildWhereFromRequests,
  mergeSimpleAndMulti,
} from "../base/find/multiFind";
import { listViews, saveView } from "../utils/views.server";
import { SavedViews } from "../components/find/SavedViews";

export async function loader(_args: LoaderFunctionArgs) {
  const url = new URL(_args.request.url);
  const views = await listViews("jobs");
  const viewName = url.searchParams.get("view");
  if (viewName) {
    const v = views.find((x: any) => x.name === viewName) as any;
    const vp: any = v?.params;
    if (vp?.filters) {
      const savedFilters = vp.filters as any;
      if (savedFilters.findReqs && !url.searchParams.has("findReqs")) {
        url.searchParams.set("findReqs", savedFilters.findReqs);
      }
      // apply simple keys if not present
      for (const k of [
        "id",
        "projectCode",
        "name",
        "status",
        "jobType",
        "endCustomerName",
        "companyId",
      ]) {
        if (savedFilters[k] && !url.searchParams.has(k))
          url.searchParams.set(k, savedFilters[k]);
      }
    }
  }
  const hasFindIndicators =
    [
      "id",
      "projectCode",
      "name",
      "status",
      "jobType",
      "endCustomerName",
      "companyId",
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
      <SavedViews
        views={data.views || []}
        activeView={data.activeView || null}
      />
      <Outlet />
    </>
  );
}
