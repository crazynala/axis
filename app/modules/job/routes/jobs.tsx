import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
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
import { listViews } from "../../../utils/views.server";
import { makeModuleShouldRevalidate } from "~/base/route/shouldRevalidate";

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
  const views = await listViews("jobs");
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
      "description",
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
      "description",
      "status",
      "jobType",
      "endCustomerName",
      "companyId",
      "assemblySku",
      "assemblyName",
      "assemblyStatus",
    ].forEach(pass);
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
    const multi = decodeRequests(url.searchParams.get("findReqs"));
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
        projectCode: true,
        name: true,
        jobType: true,
        startDate: true,
        endDate: true,
        status: true,
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
      <JobFindManager />
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
