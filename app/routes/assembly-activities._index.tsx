import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useSubmit, useSearchParams, useNavigate, Form } from "@remix-run/react";
import { Button, Group, Stack, Title, TextInput, Select } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";
import { NavDataTable } from "../components/NavDataTable";
import { idLinkColumn, nameOrFallbackColumn, simpleColumn, dateColumn } from "../components/tableColumns";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";

export const meta: MetaFunction = () => [{ title: "Assembly Activities" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["name", "description", "status", "notes"],
    filterMappers: {
      assemblyId: (v: string) => ({ assemblyId: Number(v) }),
      jobId: (v: string) => ({ jobId: Number(v) }),
    },
  });
  const [rows, total, assemblies, jobs] = await Promise.all([
    prisma.assemblyActivity.findMany({
      ...prismaArgs,
      include: { assembly: true, job: true },
    }),
    prisma.assemblyActivity.count({ where: prismaArgs.where }),
    prisma.assembly.findMany({ select: { id: true, name: true } }),
    prisma.job.findMany({ select: { id: true, name: true } }),
  ]);
  return json({
    rows,
    total,
    page: params.page,
    perPage: params.perPage,
    q: params.q,
    sort: params.sort,
    dir: params.dir,
    filters: params.filters || {},
    assemblies,
    jobs,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "create") {
    const data = {
      name: (form.get("name") as string) || null,
      description: (form.get("description") as string) || null,
      assemblyId: form.get("assemblyId") ? Number(form.get("assemblyId")) : null,
      jobId: form.get("jobId") ? Number(form.get("jobId")) : null,
      startTime: form.get("startTime") ? new Date(form.get("startTime") as string) : null,
      endTime: form.get("endTime") ? new Date(form.get("endTime") as string) : null,
      status: (form.get("status") as string) || null,
      notes: (form.get("notes") as string) || null,
    };
    await prisma.assemblyActivity.create({ data });
    return redirect("/assembly-activities");
  }

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.assemblyActivity.delete({ where: { id } });
    return redirect("/assembly-activities");
  }

  return redirect("/assembly-activities");
}

export default function AssemblyActivitiesIndexRoute() {
  const { rows, total, page, perPage, q, filters, assemblies, jobs } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const form = useForm<{
    name: string | null;
    description: string | null;
    assemblyId: number | null;
    jobId: number | null;
    startTime: string | null;
    endTime: string | null;
    status: string | null;
    notes: string | null;
  }>({
    defaultValues: {
      name: "",
      description: "",
      assemblyId: null,
      jobId: null,
      startTime: "",
      endTime: "",
      status: "",
      notes: "",
    },
  });

  return (
    <Stack gap="lg">
      <Title order={2}>Assembly Activities</Title>

      <Group justify="space-between" align="center">
        <BreadcrumbSet breadcrumbs={[{ label: "Assembly Activities", href: "/assembly-activities" }]} />
        <Button component="a" href="/assembly-activities/new" variant="filled" color="blue">
          New Assembly Activity
        </Button>
      </Group>

      <section>
        <Title order={4} mb="xs">
          All Activities
        </Title>
        <Form method="get">
          <Group wrap="wrap" align="flex-end" mb="sm">
            <TextInput name="q" label="Search" placeholder="Name, description, notes" defaultValue={q || ""} w={240} />
            <TextInput name="assemblyId" label="Assembly ID" defaultValue={filters?.assemblyId || ""} w={140} />
            <TextInput name="jobId" label="Job ID" defaultValue={filters?.jobId || ""} w={140} />
            <Button type="submit" variant="default">
              Apply
            </Button>
          </Group>
        </Form>
        <NavDataTable
          withTableBorder
          withColumnBorders
          highlightOnHover
          idAccessor="id"
          records={rows as any}
          totalRecords={total}
          page={page}
          recordsPerPage={perPage}
          recordsPerPageOptions={[10, 20, 50, 100]}
          autoFocusFirstRow
          keyboardNavigation
          onRowClick={(_rec: any, rowIndex?: number) => {
            const rec = typeof rowIndex === "number" ? (rows as any[])[rowIndex] : _rec;
            if (rec?.id != null) navigate(`/assembly-activities/${rec.id}`);
          }}
          onRowActivate={(rec: any) => {
            if (rec?.id != null) navigate(`/assembly-activities/${rec.id}`);
          }}
          onPageChange={(p: number) => {
            const next = new URLSearchParams(sp);
            next.set("page", String(p));
            navigate(`?${next.toString()}`);
          }}
          onRecordsPerPageChange={(n: number) => {
            const next = new URLSearchParams(sp);
            next.set("perPage", String(n));
            next.set("page", "1");
            navigate(`?${next.toString()}`);
          }}
          columns={[
            idLinkColumn("assembly-activities"),
            nameOrFallbackColumn("name", "activity"),
            simpleColumn("description", "Description"),
            { accessor: "assemblyId", title: "Assembly", render: (r: any) => r.assembly?.name || r.assemblyId },
            { accessor: "jobId", title: "Job", render: (r: any) => r.job?.name || r.jobId },
            dateColumn("startTime", "Start", { withTime: true }),
            dateColumn("endTime", "End", { withTime: true }),
            simpleColumn("status", "Status"),
            simpleColumn("notes", "Notes"),
          ]}
        />
      </section>
    </Stack>
  );
}
