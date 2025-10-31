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
  const data = useRouteLoaderData<{
    idList: number[];
    idListComplete: boolean;
    initialRows: any[];
    total: number;
    views?: any[];
    activeView?: string | null;
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
          return (
            <BreadcrumbSet
              breadcrumbs={[{ label: "Jobs", href: appendHref("/jobs") }]}
            />
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
        />
      </section>
      <section>
        <JobsHybridTable initialRows={initialRows} idList={idList} />
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
          navigate(`?${qs}`);
        }}
        jobSample={{}}
      />
    </Stack>
  );
}

function JobsHybridTable({
  initialRows,
  idList,
}: {
  initialRows: any[];
  idList: number[];
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
  // Build columns
  const columns = [
    {
      accessor: "id",
      title: "ID",
      width: 70,
      render: (r: any) => <Link to={`/jobs/${r.id}`}>{r.id}</Link>,
    },
    {
      accessor: "company.name",
      title: "Customer",
      render: (r: any) => r.company?.name || "",
    },
    { accessor: "projectCode", title: "Project Code", sortable: true },
    { accessor: "name", title: "Name", sortable: true },
    { accessor: "jobType", title: "Type", sortable: true },
    {
      accessor: "startDate",
      title: "Start",
      render: (r: any) =>
        r.startDate ? new Date(r.startDate).toLocaleDateString() : "",
    },
    {
      accessor: "endDate",
      title: "End",
      render: (r: any) =>
        r.endDate ? new Date(r.endDate).toLocaleDateString() : "",
    },
    { accessor: "status", title: "Status", sortable: true },
  ];
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
