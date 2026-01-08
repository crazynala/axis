import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation } from "@remix-run/react";
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
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";
import { jobSpec } from "../spec";
import { hydrateJobRows } from "../services/hydrateJobs";
import { jobColumns } from "../spec/indexList";
import {
  getDefaultColumnKeys,
  normalizeColumnsValue,
} from "~/base/index/columns";

export async function loader(_args: LoaderFunctionArgs) {
  const url = new URL(_args.request.url);
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
  const viewUser = await getViewUser(_args.request);
  const views = await listViews("jobs", viewUser);
  const viewName = url.searchParams.get("view");
  const allFields = jobSpec.find.buildConfig();
  const semanticKeys = Array.from(jobSpec.find.deriveSemanticKeys());
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
  const effectiveQ = viewActive
    ? viewParams?.q ?? null
    : url.searchParams.get("q");
  const effectiveSort =
    url.searchParams.get("sort") || viewParams?.sort || null;
  const effectiveDir =
    url.searchParams.get("dir") || viewParams?.dir || null;
  const aliasMap: Record<string, string> = {
    "job.assembly.sku": "assemblySku",
    "job.assembly.name": "assemblyName",
    "job.assembly.status": "assemblyStatus",
  };
  const aliasReverse = Object.fromEntries(
    Object.entries(aliasMap).map(([from, to]) => [to, from])
  );
  const readValue = (key: string) => {
    if (viewActive) {
      if (key in viewFilters) return viewFilters[key];
      const legacy = aliasReverse[key];
      if (legacy && legacy in viewFilters) return viewFilters[legacy];
      return undefined;
    }
    const direct = url.searchParams.get(key);
    if (direct !== null) return direct;
    const legacy = aliasReverse[key];
    return legacy ? url.searchParams.get(legacy) : null;
  };
  const hasFindIndicators = viewActive
    ? semanticKeys.some((k) => {
        const v = readValue(k);
        return v !== undefined && v !== null && v !== "";
      }) || !!viewFilters.findReqs
    : semanticKeys.some((k) => url.searchParams.has(k)) ||
      url.searchParams.has("findReqs");
  let where: any = undefined;
  if (hasFindIndicators) {
    const values: any = {};
    const pass = (k: string) => {
      const v = readValue(k);
      if (v !== null && v !== undefined && v !== "") values[k] = v;
    };
    semanticKeys.forEach(pass);
    const valuesForSchema = { ...values };
    delete valuesForSchema.name;
    delete valuesForSchema.projectCode;
    delete valuesForSchema.description;
    const simpleBase = buildWhere(valuesForSchema, jobSearchSchema);
    const simpleClauses: any[] = [];
    if (simpleBase && Object.keys(simpleBase).length > 0)
      simpleClauses.push(simpleBase);
    const projectCodeClause = buildTokenizedClause(
      values.projectCode || null,
      (token) => ({ projectCode: { contains: token, mode: "insensitive" } })
    );
    if (projectCodeClause) simpleClauses.push(projectCodeClause);
    const nameClause = buildTokenizedClause(values.name || null, (token) => ({
      nameUnaccented: {
        contains: unaccent(token),
        mode: "insensitive",
      },
    }));
    if (nameClause) simpleClauses.push(nameClause);
    if (values.description)
      simpleClauses.push({
        descriptionUnaccented: {
          contains: unaccent(values.description),
          mode: "insensitive",
        },
      });
    const simple =
      simpleClauses.length === 0
        ? null
        : simpleClauses.length === 1
        ? simpleClauses[0]
        : { AND: simpleClauses };
    const rawFindReqs = viewActive
      ? viewFilters.findReqs
      : url.searchParams.get("findReqs");
    const multi = decodeRequests(rawFindReqs);
    if (multi) {
      const interpreters: Record<string, (val: any) => any> = {
        id: (v) => ({ id: Number(v) }),
        projectCode: (v) =>
          buildTokenizedClause(String(v), (token) => ({
            projectCode: { contains: token, mode: "insensitive" },
          })),
        name: (v) =>
          buildTokenizedClause(String(v), (token) => ({
            nameUnaccented: { contains: unaccent(token), mode: "insensitive" },
          })),
        description: (v) => ({
          descriptionUnaccented: { contains: unaccent(v), mode: "insensitive" },
        }),
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
          assemblies: {
            some: {
              nameUnaccented: { contains: unaccent(v), mode: "insensitive" },
            },
          },
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
  if (effectiveQ != null && String(effectiveQ).trim() !== "") {
    const qv = unaccent(String(effectiveQ).trim());
    const qWhere = {
      OR: [
        { projectCode: { contains: qv, mode: "insensitive" } },
        { nameUnaccented: { contains: qv, mode: "insensitive" } },
        { descriptionUnaccented: { contains: qv, mode: "insensitive" } },
      ],
    };
    where = where ? { AND: [where, qWhere] } : qWhere;
  }
  const orderBy = effectiveSort
    ? { [effectiveSort]: effectiveDir || "asc" }
    : { id: "desc" };
  const ID_CAP = 50000;
  const idRows = await prisma.job.findMany({
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
    initialRows = await prisma.job.findMany({
      where: { id: { in: initialIds } },
      orderBy,
      select: {
        id: true,
        projectCode: true,
        name: true,
        jobType: true,
        startDate: true,
        endDate: true,
        status: true,
        companyId: true,
        company: { select: { name: true } },
        _count: { select: { assemblies: true } },
      },
    });
    initialRows = hydrateJobRows(initialRows);
  }
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

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  const viewUser = await getViewUser(request);
  const viewId = String(form.get("viewId") || "").trim();
  const name = String(form.get("name") || "").trim();
  if (intent === "view.rename") {
    if (!viewId || !name) return redirect("/jobs");
    await renameView({ viewId, name, user: viewUser, module: "jobs" });
    return redirect(`/jobs?view=${encodeURIComponent(viewId)}`);
  }
  if (intent === "view.delete") {
    if (!viewId) return redirect("/jobs");
    await deleteView({ viewId, user: viewUser, module: "jobs" });
    return redirect("/jobs");
  }
  if (intent === "view.duplicate") {
    if (!viewId) return redirect("/jobs");
    const view = await duplicateView({
      viewId,
      name: name || null,
      user: viewUser,
      module: "jobs",
    });
    return redirect(`/jobs?view=${encodeURIComponent(String(view.id))}`);
  }
  if (intent === "view.publish") {
    if (!viewId) return redirect("/jobs");
    await publishView({ viewId, user: viewUser, module: "jobs" });
    return redirect(`/jobs?view=${encodeURIComponent(viewId)}`);
  }
  if (intent === "view.unpublish") {
    if (!viewId) return redirect("/jobs");
    await unpublishView({ viewId, user: viewUser, module: "jobs" });
    return redirect(`/jobs?view=${encodeURIComponent(viewId)}`);
  }
  if (
    intent === "saveView" ||
    intent === "view.saveAs" ||
    intent === "view.overwriteFromUrl"
  ) {
    if (intent === "view.overwriteFromUrl") {
      if (!viewId) return redirect("/jobs");
    } else if (!name) {
      return redirect("/jobs");
    }
    const url = new URL(request.url);
    const sp = url.searchParams;
    const allFields = jobSpec.find.buildConfig();
    const semanticKeys = Array.from(jobSpec.find.deriveSemanticKeys());
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
      const base = await getView("jobs", viewParam);
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
    const defaultColumns = getDefaultColumnKeys(jobColumns);
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
        module: "jobs",
      });
      return redirect(`/jobs?view=${encodeURIComponent(viewId)}`);
    }
    const view = await saveView({
      module: "jobs",
      name,
      params,
      user: viewUser,
    });
    return redirect(`/jobs?view=${encodeURIComponent(String(view.id))}`);
  }
  return redirect("/jobs");
}

// DAN 251030 this should be handled in the index page
//
// export async function action({ request }: ActionFunctionArgs) {
//   const form = await request.formData();
//   const intent = form.get("_intent");
//   if (intent === "saveView") {
//     const name = String(form.get("name") || "").trim();
//     if (!name) return redirect("/jobs");
//     const url = new URL(request.url);
//     const params = Object.fromEntries(url.searchParams.entries());
//     const filters: Record<string, any> = {};
//     for (const [k, v] of Object.entries(params)) {
//       if (["view"].includes(k)) continue;
//       filters[k] = v;
//     }
//     const findReqs = params["findReqs"];
//     if (findReqs) filters.findReqs = findReqs;
//     await saveView({
//       module: "jobs",
//       name,
//       params: { page: 1, perPage: 0, sort: null, dir: null, q: null, filters },
//     });
//     return redirect(`/jobs?view=${encodeURIComponent(name)}`);
//   }
//   return redirect("/jobs");
// }

export default function JobsLayout() {
  const data = useLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
    views?: any[];
    activeView?: string | null;
    activeViewParams?: any | null;
  }>();
  const { setRecordSet, setIdList, addRows } = useRecords();
  const location = useLocation();
  const isAssemblySection =
    location.pathname.includes("/jobs/") &&
    location.pathname.includes("/assembly/");
  useEffect(() => {
    // Avoid overriding assemblies navigation when inside /jobs/:jobId/assembly/*
    if (!isAssemblySection) {
      // Ensure the jobs module uses numeric IDs for map keys on index/detail pages
      setRecordSet("jobs", data.initialRows || [], {
        getId: (r: any) => r.id,
        getPath: (r: any) => `/jobs/${r.id}`,
      });
      setIdList("jobs", data.idList, data.idListComplete);
      if (data.initialRows?.length)
        addRows("jobs", data.initialRows, { updateRecordsArray: true });
    }
  }, [
    isAssemblySection,
    data.idList,
    data.idListComplete,
    data.initialRows,
    setRecordSet,
    setIdList,
    addRows,
  ]);
  return (
    <>
      <JobFindManager activeViewParams={data?.activeViewParams || null} />
      <Outlet />
    </>
  );
}

// Keep jobs parent data stable while navigating within job details
// and avoid revalidating after non-GET mutations.
export const shouldRevalidate = makeModuleShouldRevalidate("/jobs", [
  "id",
  "projectCode",
  "name",
  "description",
  "status",
  "jobType",
  "endCustomerName",
  "companyId",
  "assemblySku",
  "assemblyName",
  "assemblyStatus",
  "findReqs",
  "view",
  "sort",
  "dir",
  "perPage",
  "q",
]);
