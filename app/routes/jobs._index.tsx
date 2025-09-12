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
import NavDataTable from "../components/RefactoredNavDataTable";
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
  const { records, fetching, requestMore, atEnd } = useHybridWindow({
    module: "jobs",
    rowEndpointPath: "/jobs/rows",
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
    { accessor: "projectCode", title: "Project Code" },
    { accessor: "name", title: "Name" },
    { accessor: "jobType", title: "Type" },
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
    { accessor: "status", title: "Status" },
  ];
  return (
    <NavDataTable
      module="jobs"
      records={records as any}
      columns={columns as any}
      fetching={fetching}
      onReachEnd={() => {
        if (!atEnd) requestMore();
      }}
      onActivate={(rec: any) => {
        if (rec?.id) window.location.href = `/jobs/${rec.id}`;
      }}
    />
  );
}
