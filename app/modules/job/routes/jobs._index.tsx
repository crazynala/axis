import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import {
  Link,
  useRouteLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { Button, Group, Stack } from "@mantine/core";
import { BreadcrumbSet } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import * as jobDetail from "~/modules/job/forms/jobDetail";
import { JobFindModal } from "~/modules/job/components/JobFindModal";
import { VirtualizedNavDataTable } from "../../../components/VirtualizedNavDataTable";
import { useHybridWindow } from "../../../base/record/useHybridWindow";
import { FindRibbonAuto } from "../../../components/find/FindRibbonAuto";
import { deriveSemanticKeys } from "~/base/index/indexController";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
  getSavedIndexSearch,
} from "~/hooks/useNavLocation";
import { useMemo } from "react";
import { jobColumns } from "../config/jobColumns";
import {
  buildTableColumns,
  getVisibleColumnKeys,
} from "~/base/index/columns";

export const meta: MetaFunction = () => [{ title: "Jobs" }];

// DAN removed loader; it is all handled by parent loader
// export async function loader(args: LoaderFunctionArgs) {
//   const params = parseTableParams(args.request.url);
//   if ((params as any).filters && "find" in (params as any).filters)
//     delete (params as any).filters.find;
//   // Never pass findReqs through to Prisma where; decode and merge instead
//   if ((params as any).filters && "findReqs" in (params as any).filters)
//     delete (params as any).filters.findReqs;
//   const prismaArgs = buildPrismaArgs<any>(params, {
//     defaultSort: { field: "id", dir: "asc" },
//     searchableFields: ["name", "projectCode", "status", "jobType"],
//     filterMappers: {
//       id: (v: any) => {
//         const n = Number(v);
//         if (isNaN(n)) return {};
//         return { id: n };
//       },
//     },
//   });

//   // Build merged where (simple + multi) per find pattern
//   const url = new URL(args.request.url);
//   // Accept dotted alias keys (back-compat): job.assembly.* => assembly*
//   const alias = (from: string, to: string) => {
//     const v = url.searchParams.get(from);
//     if (v !== null && !url.searchParams.has(to)) url.searchParams.set(to, v);
//   };
//   alias("job.assembly.sku", "assemblySku");
//   alias("job.assembly.name", "assemblyName");
//   alias("job.assembly.status", "assemblyStatus");
//   const values: any = {};
//   const pass = (k: string) => {
//     const v = url.searchParams.get(k);
//     if (v !== null && v !== "") values[k] = v;
//   };
//   [
//     "id",
//     "projectCode",
//     "name",
//     "status",
//     "jobType",
//     "endCustomerName",
//     "companyId",
//     "assemblySku",
//     "assemblyName",
//     "assemblyStatus",
//   ].forEach(pass);
//   const simpleWhere = buildWhere(values, jobSearchSchema);
//   const multi = decodeRequests(url.searchParams.get("findReqs"));
//   let where: any = simpleWhere;
//   if (multi) {
//     const interpreters: Record<string, (val: any) => any> = {
//       id: (v) => ({ id: Number(v) }),
//       projectCode: (v) => ({
//         projectCode: { contains: v, mode: "insensitive" },
//       }),
//       name: (v) => ({ name: { contains: v, mode: "insensitive" } }),
//       status: (v) => ({ status: { contains: v, mode: "insensitive" } }),
//       jobType: (v) => ({ jobType: { contains: v, mode: "insensitive" } }),
//       endCustomerName: (v) => ({
//         endCustomerName: { contains: v, mode: "insensitive" },
//       }),
//       companyId: (v) => ({ companyId: Number(v) }),
//       assemblySku: (v) => ({
//         assemblies: {
//           some: { product: { sku: { contains: v, mode: "insensitive" } } },
//         },
//       }),
//       assemblyName: (v) => ({
//         assemblies: { some: { name: { contains: v, mode: "insensitive" } } },
//       }),
//       assemblyStatus: (v) => ({
//         assemblies: { some: { status: { contains: v, mode: "insensitive" } } },
//       }),
//     };
//     const multiWhere = buildWhereFromRequests(multi, interpreters);
//     where = mergeSimpleAndMulti(simpleWhere, multiWhere);
//   }
//   const ID_CAP = 50000;
//   const idRows = await prisma.job.findMany({
//     where,
//     orderBy: prismaArgs.orderBy || { id: "asc" },
//     select: { id: true },
//     take: ID_CAP,
//   });
//   const idList = idRows.map((r) => r.id);
//   const idListComplete = idRows.length < ID_CAP;
//   const INITIAL_COUNT = 100;
//   const initialIds = idList.slice(0, INITIAL_COUNT);
//   let initialRows: any[] = [];
//   if (initialIds.length) {
//     initialRows = await prisma.job.findMany({
//       where: { id: { in: initialIds } },
//       select: {
//         id: true,
//         projectCode: true,
//         name: true,
//         jobType: true,
//         startDate: true,
//         endDate: true,
//         status: true,
//         company: { select: { name: true } },
//       },
//       orderBy: { id: "asc" },
//     });
//   }
//   return json({ idList, idListComplete, initialRows, total: idList.length });
// }

export default function JobsIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "jobs" });
  usePersistIndexSearch("/jobs");
  const data = useRouteLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
    views?: any[];
    activeView?: string | null;
    activeViewParams?: any | null;
  }>("modules/job/routes/jobs");
  // const { idList, idListComplete, initialRows, total } =
  //   useLoaderData<typeof loader>();
  const idList = data?.idList ?? [];
  const idListComplete = data?.idListComplete ?? true;
  const initialRows = data?.initialRows ?? [];
  const total = data?.total ?? 0;
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const findOpen = sp.get("find") === "1";

  const fields: any[] = [
    ...((jobDetail as any).jobOverviewFields || []),
    ...((jobDetail as any).jobDateStatusLeft || []),
    ...((jobDetail as any).jobDateStatusRight || []),
  ];
  const findConfig = useMemo(
    () => [
      ...((jobDetail as any).jobOverviewFields || []),
      ...((jobDetail as any).jobDateStatusLeft || []),
      ...((jobDetail as any).jobDateStatusRight || []),
      ...((jobDetail as any).assemblyFields || []),
    ],
    []
  );
  const semanticKeys = useMemo(
    () => new Set(deriveSemanticKeys(findConfig)),
    [findConfig]
  );
  const initialFind: Record<string, any> = {};
  for (const f of fields) {
    const v = sp.get(f.name);
    if (v !== null) initialFind[f.name] = v;
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        {(() => {
          const appendHref = useFindHrefAppender();
          const saved = getSavedIndexSearch("/jobs");
          const hrefJobs = saved ? `/jobs${saved}` : appendHref("/jobs");
          return (
            <BreadcrumbSet breadcrumbs={[{ label: "Jobs", href: hrefJobs }]} />
          );
        })()}
        <Button component="a" href="/jobs/new" variant="filled" color="blue">
          New Job
        </Button>
      </Group>

      <section>
        <FindRibbonAuto
          views={data?.views || []}
          activeView={data?.activeView || null}
          activeViewId={data?.activeView || null}
          activeViewParams={data?.activeViewParams || null}
          findConfig={findConfig}
          enableLastView
          columnsConfig={jobColumns}
        />
      </section>
      <section>
        <JobsHybridTable
          initialRows={initialRows}
          idList={idList}
          activeView={data?.activeView || null}
          activeViewParams={data?.activeViewParams || null}
        />
      </section>

      <JobFindModal
        opened={findOpen}
        onClose={() => {
          const next = new URLSearchParams(sp);
          next.delete("find");
          for (const f of fields) next.delete(f.name);
          navigate(`?${next.toString()}`);
        }}
        initialValues={initialFind}
        onSearch={(qs) => {
          const url = new URL(window.location.href);
          const produced = new URLSearchParams(qs);
          const viewName = url.searchParams.get("view");
          Array.from(url.searchParams.keys()).forEach((k) => {
            if (k === "q" || k === "findReqs" || semanticKeys.has(k))
              url.searchParams.delete(k);
          });
          for (const [k, v] of produced.entries())
            url.searchParams.set(k, v);
          url.searchParams.delete("page");
          if (viewName) {
            url.searchParams.delete("view");
            url.searchParams.set("lastView", viewName);
          }
          navigate(`?${url.searchParams.toString()}`);
        }}
        jobSample={{}}
      />
    </Stack>
  );
}

function JobsHybridTable({
  initialRows,
  idList,
  activeView,
  activeViewParams,
}: {
  initialRows: any[];
  idList: number[];
  activeView?: string | null;
  activeViewParams?: any | null;
}) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { records, fetching, requestMore, atEnd } = useHybridWindow({
    module: "jobs",
    rowEndpointPath: "/jobs/rows",
    initialWindow: 100,
    batchIncrement: 100,
    maxPlaceholders: 8,
  });
  // Seed initial rows into context on first render (they should have been added by layout; defensive)
  const viewMode = !!activeView;
  const visibleColumnKeys = useMemo(
    () =>
      getVisibleColumnKeys({
        defs: jobColumns,
        urlColumns: sp.get("columns"),
        viewColumns: activeViewParams?.columns,
        viewMode,
      }),
    [activeViewParams?.columns, sp, viewMode]
  );
  const columns = useMemo(
    () => buildTableColumns(jobColumns, visibleColumnKeys),
    [visibleColumnKeys]
  );
  return (
    <VirtualizedNavDataTable
      records={records as any}
      columns={columns as any}
      sortStatus={
        {
          columnAccessor: sp.get("sort") || "id",
          direction: (sp.get("dir") as any) || "asc",
        } as any
      }
      onSortStatusChange={(s: {
        columnAccessor: string;
        direction: "asc" | "desc";
      }) => {
        const next = new URLSearchParams(sp);
        next.set("sort", s.columnAccessor);
        next.set("dir", s.direction);
        navigate(`?${next.toString()}`);
      }}
      onReachEnd={() => {
        if (!atEnd) requestMore();
      }}
      onRowClick={(rec: any) => {
        if (rec?.id) navigate(`/jobs/${rec.id}`);
      }}
      onRowDoubleClick={(rec: any) => {
        if (rec?.id) navigate(`/jobs/${rec.id}`);
      }}
      footer={
        atEnd ? (
          <span style={{ fontSize: 12 }}>End of results ({idList.length})</span>
        ) : fetching ? (
          <span>Loading…</span>
        ) : (
          <span style={{ fontSize: 11 }}>Scroll to load more…</span>
        )
      }
    />
  );
}
