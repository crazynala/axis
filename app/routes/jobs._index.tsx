import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { Button, Group, Stack, Title, Tooltip } from "@mantine/core";
import { BreadcrumbSet } from "@aa/timber";
import { prisma } from "../utils/prisma.server";
import { parseTableParams, buildPrismaArgs } from "../utils/table.server";
import * as jobDetail from "../formConfigs/jobDetail";
import { JobFindModal } from "../components/JobFindModal";
import { NavDataTable } from "../components/NavDataTable";

export const meta: MetaFunction = () => [{ title: "Jobs" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  // Remove UI toggle control from filters so buildPrismaArgs ignores it
  if ((params as any).filters && "find" in (params as any).filters) {
    delete (params as any).filters.find;
  }
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

  const [rows, total] = await Promise.all([
    prisma.job.findMany({
      ...prismaArgs,
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
    }),
    prisma.job.count({ where: prismaArgs.where }),
  ]);

  return json({
    rows,
    total,
    page: params.page,
    perPage: params.perPage,
    sort: params.sort || null,
    dir: params.dir || null,
  });
}

export default function JobsIndexRoute() {
  const { rows, total, page, perPage } = useLoaderData<typeof loader>();
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const findOpen = sp.get("find") === "1";
  const fields: any[] = [...((jobDetail as any).jobOverviewFields || []), ...((jobDetail as any).jobDateStatusLeft || []), ...((jobDetail as any).jobDateStatusRight || [])];
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
        <NavDataTable
          records={rows as any}
          columns={[
            { accessor: "id", title: "ID", width: 70, sortable: true, render: (r: any) => <Link to={`/jobs/${r.id}`}>{r.id}</Link> },
            { accessor: "company.name", title: "Customer", render: (r: any) => r.company?.name || "" },
            { accessor: "projectCode", title: "Project Code", sortable: true },
            { accessor: "name", title: "Name", sortable: true },
            { accessor: "jobType", title: "Type", sortable: true },
            { accessor: "startDate", title: "Start", sortable: true, render: (r: any) => (r.startDate ? new Date(r.startDate).toLocaleDateString() : "") },
            { accessor: "endDate", title: "End", sortable: true, render: (r: any) => (r.endDate ? new Date(r.endDate).toLocaleDateString() : "") },
            { accessor: "status", title: "Status", sortable: true },
          ]}
          autoFocusFirstRow
          keyboardNavigation
          onRowClick={(rec: any) => {
            if (!rec?.id) return;
            navigate(`/jobs/${rec.id}`);
          }}
          onRowActivate={(rec: any) => {
            const id = rec?.id;
            if (id == null) return;
            const hasFind = sp.get("find") === "1";
            const ret = sp.get("return");
            if (hasFind) {
              const sp2 = new URLSearchParams();
              sp2.set("find", "1");
              if (ret) sp2.set("return", ret);
              navigate(`/jobs/${id}?${sp2.toString()}`);
            } else {
              navigate(`/jobs/${id}`);
            }
          }}
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
          navigate(`?${qs}`);
        }}
        jobSample={{}}
      />
    </Stack>
  );
}
