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
  useNavigate,
  useSearchParams,
  Form,
} from "@remix-run/react";
import { Button, TextInput, Group, Stack, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";
import { DataTable } from "mantine-datatable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";

export const meta: MetaFunction = () => [{ title: "Assembly" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["name", "status", "notes"],
  });
  const [rows, total] = await Promise.all([
    prisma.assembly.findMany({ ...prismaArgs }),
    prisma.assembly.count({ where: prismaArgs.where }),
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
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "create") {
    const data = {
      name: (form.get("name") as string) || null,
    } as const;
    await prisma.assembly.create({ data: data as any });
    return redirect("/assembly");
  }

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.assembly.delete({ where: { id } });
    return redirect("/assembly");
  }

  return redirect("/assembly");
}

export default function AssemblyIndexRoute() {
  const { rows, total, page, perPage, q, filters } =
    useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const form = useForm<{ name: string | null }>({
    defaultValues: { name: "" },
  });

  return (
    <Stack gap="lg">
      <Title order={2}>Assembly</Title>

      <section>
        <Title order={4} mb="sm">
          Add Assembly
        </Title>
        <form
          onSubmit={form.handleSubmit((values) => {
            const fd = new FormData();
            fd.set("_intent", "create");
            if (values.name) fd.set("name", values.name);
            submit(fd, { method: "post" });
          })}
        >
          <Group align="flex-end" wrap="wrap">
            <TextInput label="Name" w={260} {...form.register("name")} />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </Group>
        </form>
      </section>

      <section>
        <Title order={4} mb="xs">
          All Assemblies
        </Title>
        <Form method="get">
          <Group wrap="wrap" align="flex-end" mb="sm">
            <TextInput
              name="q"
              label="Search"
              placeholder="Name, status, notes"
              defaultValue={q || ""}
              w={240}
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
            if (rec?.id != null) navigate(`/assembly/${rec.id}`);
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
              render: (r: any) => r.name || `Assembly #${r.id}`,
            },
            { accessor: "status", title: "Status" },
            { accessor: "qtyOrdered", title: "# Ordered" },
          ]}
        />
      </section>
    </Stack>
  );
}
