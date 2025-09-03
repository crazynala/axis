import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigation,
  useSubmit,
  useSearchParams,
  useNavigate,
  Form,
} from "@remix-run/react";
import {
  Button,
  Group,
  Stack,
  Title,
  TextInput,
  Textarea,
  Select,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";
import { DataTable } from "mantine-datatable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";

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
      assemblyId: form.get("assemblyId")
        ? Number(form.get("assemblyId"))
        : null,
      jobId: form.get("jobId") ? Number(form.get("jobId")) : null,
      startTime: form.get("startTime")
        ? new Date(form.get("startTime") as string)
        : null,
      endTime: form.get("endTime")
        ? new Date(form.get("endTime") as string)
        : null,
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
  const { rows, total, page, perPage, q, filters, assemblies, jobs } =
    useLoaderData<typeof loader>();
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

      <section>
        <Title order={4} mb="sm">
          Add Activity
        </Title>
        <form
          onSubmit={form.handleSubmit((values) => {
            const fd = new FormData();
            fd.set("_intent", "create");
            Object.entries(values).forEach(([k, v]) =>
              fd.set(k, v != null ? String(v) : "")
            );
            submit(fd, { method: "post" });
          })}
        >
          <Group gap="md" align="flex-end">
            <TextInput label="Name" w={180} {...form.register("name")} />
            <Textarea
              label="Description"
              w={220}
              {...form.register("description")}
            />
            <Controller
              name="assemblyId"
              control={form.control}
              render={({ field }) => (
                <Select
                  label="Assembly"
                  w={160}
                  value={field.value ? String(field.value) : null}
                  onChange={(v) => field.onChange(v ? Number(v) : null)}
                  data={assemblies.map((a: any) => ({
                    value: String(a.id),
                    label: a.name || `Assembly #${a.id}`,
                  }))}
                  clearable
                />
              )}
            />
            <Controller
              name="jobId"
              control={form.control}
              render={({ field }) => (
                <Select
                  label="Job"
                  w={160}
                  value={field.value ? String(field.value) : null}
                  onChange={(v) => field.onChange(v ? Number(v) : null)}
                  data={jobs.map((j: any) => ({
                    value: String(j.id),
                    label: j.name || `Job #${j.id}`,
                  }))}
                  clearable
                />
              )}
            />
            <TextInput
              label="Start Time"
              type="datetime-local"
              w={180}
              {...form.register("startTime")}
            />
            <TextInput
              label="End Time"
              type="datetime-local"
              w={180}
              {...form.register("endTime")}
            />
            <TextInput label="Status" w={120} {...form.register("status")} />
            <Textarea label="Notes" w={180} {...form.register("notes")} />
            <Button type="submit" disabled={busy}>
              Add
            </Button>
          </Group>
        </form>
      </section>

      <section>
        <Title order={4} mb="xs">
          All Activities
        </Title>
        <Form method="get">
          <Group wrap="wrap" align="flex-end" mb="sm">
            <TextInput
              name="q"
              label="Search"
              placeholder="Name, description, notes"
              defaultValue={q || ""}
              w={240}
            />
            <TextInput
              name="assemblyId"
              label="Assembly ID"
              defaultValue={filters?.assemblyId || ""}
              w={140}
            />
            <TextInput
              name="jobId"
              label="Job ID"
              defaultValue={filters?.jobId || ""}
              w={140}
            />
            <Button type="submit" variant="default">
              Apply
            </Button>
          </Group>
        </Form>
        <DataTable
          withTableBorder
          withColumnBorders
          highlightOnHover
          idAccessor="id"
          records={rows as any}
          totalRecords={total}
          page={page}
          recordsPerPage={perPage}
          recordsPerPageOptions={[10, 20, 50, 100]}
          onRowClick={(_rec: any, rowIndex?: number) => {
            const rec =
              typeof rowIndex === "number" ? (rows as any[])[rowIndex] : _rec;
            if (rec?.id != null) navigate(`/assembly-activities/${rec.id}`);
          }}
          onPageChange={(p) => {
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
            { accessor: "id", title: "ID", width: 70, sortable: true },
            {
              accessor: "name",
              title: "Name",
              render: (r: any) => r.name || `Activity #${r.id}`,
            },
            { accessor: "description", title: "Description" },
            {
              accessor: "assemblyId",
              title: "Assembly",
              render: (r: any) => r.assembly?.name || r.assemblyId,
            },
            {
              accessor: "jobId",
              title: "Job",
              render: (r: any) => r.job?.name || r.jobId,
            },
            {
              accessor: "startTime",
              title: "Start",
              render: (r: any) =>
                r.startTime ? new Date(r.startTime).toLocaleString() : "",
            },
            {
              accessor: "endTime",
              title: "End",
              render: (r: any) =>
                r.endTime ? new Date(r.endTime).toLocaleString() : "",
            },
            { accessor: "status", title: "Status" },
            { accessor: "notes", title: "Notes" },
          ]}
        />
      </section>
    </Stack>
  );
}
