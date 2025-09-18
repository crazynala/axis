import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { Button, Group, Stack, Title, Tooltip } from "@mantine/core";
import { BreadcrumbSet } from "@aa/timber";
import { prisma } from "../utils/prisma.server";
import { parseTableParams, buildPrismaArgs } from "../utils/table.server";
import * as jobDetail from "../formConfigs/jobDetail";
import { JobFindModal } from "../components/JobFindModal";
import { VirtualizedNavDataTable } from "../components/VirtualizedNavDataTable";
import { useHybridWindow } from "../record/useHybridWindow";

export const meta: MetaFunction = () => [{ title: "Jobs" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  if ((params as any).filters && "find" in (params as any).filters)
    delete (params as any).filters.find;
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["name", "projectCode", "status", "jobType"],
    filterMappers: {
      id: (v: any) => {
        const n = Number(v);
        if (isNaN(n)) return {};
        return { id: n };
      },
    },
  });
  const ID_CAP = 50000;
  const idRows = await prisma.job.findMany({
    where: prismaArgs.where,
    orderBy: prismaArgs.orderBy || { id: "asc" },
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
      orderBy: { id: "asc" },
    });
  }
  return json({ idList, idListComplete, initialRows, total: idList.length });
}

export default function JobsIndexRoute() {
  const { idList, idListComplete, initialRows, total } =
    useLoaderData<typeof loader>();
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
        <Title order={2}>Jobs</Title>
        <BreadcrumbSet breadcrumbs={[{ label: "Jobs", href: "/jobs" }]} />
      </Group>
      <Group>
        <Button component="a" href="/jobs/new" variant="filled" color="blue">
          New Job
        </Button>
        <Button
          variant="light"
          onClick={() => {
            const next = new URLSearchParams(sp);
            if (next.get("find") === "1") {
              next.delete("find");
              for (const f of fields) next.delete(f.name);
            } else {
              next.set("find", "1");
            }
            navigate(`?${next.toString()}`);
          }}
        >
          {findOpen ? "Close Find" : "Find"}
        </Button>
        {Array.from(sp.keys()).some(
          (k) => !["page", "perPage", "sort", "dir", "view", "find"].includes(k)
        ) && (
          <Tooltip label="Clear all filters">
            <Button
              variant="default"
              onClick={() => {
                const next = new URLSearchParams(sp);
                for (const k of Array.from(next.keys())) {
                  if (
                    ["page", "perPage", "sort", "dir", "view", "find"].includes(
                      k
                    )
                  )
                    continue;
                  next.delete(k);
                }
                navigate(`?${next.toString()}`);
              }}
            >
              Clear Filters
            </Button>
          </Tooltip>
        )}
      </Group>

      <section>
        <Title order={4} mb="sm">
          All Jobs
        </Title>
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
