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
  Select,
  NumberInput,
  Textarea,
  TextInput,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";
import { DataTable } from "mantine-datatable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";

export const meta: MetaFunction = () => [{ title: "Costings" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const params = parseTableParams(args.request.url);
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["notes", "usageType", "activityUsed"],
    filterMappers: {
      assemblyId: (v: string) => ({ assemblyId: Number(v) }),
      componentId: (v: string) => ({ componentId: Number(v) }),
      usageType: (v: string) => ({ usageType: v as any }),
    },
  });
  const [rows, total, products, assemblies] = await Promise.all([
    prisma.costing.findMany({
      ...prismaArgs,
      include: {
        assembly: { select: { id: true, name: true } },
        component: { select: { id: true, sku: true, name: true } },
      },
    }),
    prisma.costing.count({ where: prismaArgs.where }),
    prisma.product.findMany({
      select: { id: true, sku: true, name: true },
      orderBy: { id: "asc" },
    }),
    prisma.assembly.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
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
    products,
    assemblies,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "create") {
    const assemblyId = form.get("assemblyId")
      ? Number(form.get("assemblyId"))
      : null;
    const componentId = form.get("componentId")
      ? Number(form.get("componentId"))
      : null;
    const quantityPerUnit = form.get("quantityPerUnit")
      ? Number(form.get("quantityPerUnit"))
      : null;
    const unitCost = form.get("unitCost") ? Number(form.get("unitCost")) : null;
    const usageType = (form.get("usageType") as string) || null;
    const notes = (form.get("notes") as string) || null;
    await prisma.costing.create({
      data: {
        assemblyId: assemblyId ?? undefined,
        componentId: componentId ?? undefined,
        quantityPerUnit,
        unitCost,
        usageType: usageType as any,
        notes,
      },
    });
    return redirect("/costings");
  }

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.costing.delete({ where: { id } });
    return redirect("/costings");
  }

  return redirect("/costings");
}

export default function CostingsIndexRoute() {
  const { rows, total, page, perPage, q, filters, products, assemblies } =
    useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const form = useForm<{
    assemblyId: number | null;
    componentId: number | null;
    quantityPerUnit: number | null;
    unitCost: number | null;
    usageType: string | null;
    notes: string | null;
  }>({
    defaultValues: {
      assemblyId: null,
      componentId: null,
      quantityPerUnit: null,
      unitCost: null,
      usageType: null,
      notes: "",
    },
  });

  return (
    <Stack gap="lg">
      <Title order={2}>Costings</Title>

      <section>
        <Title order={4} mb="sm">
          Add Costing Line
        </Title>
        <form
          onSubmit={form.handleSubmit((values) => {
            const fd = new FormData();
            fd.set("_intent", "create");
            if (values.assemblyId != null)
              fd.set("assemblyId", String(values.assemblyId));
            if (values.componentId != null)
              fd.set("componentId", String(values.componentId));
            if (values.quantityPerUnit != null)
              fd.set("quantityPerUnit", String(values.quantityPerUnit));
            if (values.unitCost != null)
              fd.set("unitCost", String(values.unitCost));
            if (values.usageType) fd.set("usageType", values.usageType);
            if (values.notes) fd.set("notes", values.notes);
            submit(fd, { method: "post" });
          })}
        >
          <Group align="flex-end" wrap="wrap">
            <Controller
              name="assemblyId"
              control={form.control}
              render={({ field }) => (
                <Select
                  label="Assembly"
                  w={220}
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
              name="componentId"
              control={form.control}
              render={({ field }) => (
                <Select
                  label="Component"
                  w={220}
                  value={field.value ? String(field.value) : null}
                  onChange={(v) => field.onChange(v ? Number(v) : null)}
                  data={products.map((p: any) => ({
                    value: String(p.id),
                    label: p.name
                      ? `${p.name} (#${p.id}${p.sku ? ", " + p.sku : ""})`
                      : `#${p.id}`,
                  }))}
                  clearable
                />
              )}
            />
            <Controller
              name="quantityPerUnit"
              control={form.control}
              render={({ field }) => (
                <NumberInput
                  label="Qty / Unit"
                  w={140}
                  value={field.value ?? undefined}
                  onChange={(v) => field.onChange(v === "" ? null : Number(v))}
                  allowDecimal
                />
              )}
            />
            <Controller
              name="unitCost"
              control={form.control}
              render={({ field }) => (
                <NumberInput
                  label="Unit Cost"
                  w={140}
                  value={field.value ?? undefined}
                  onChange={(v) => field.onChange(v === "" ? null : Number(v))}
                  allowDecimal
                />
              )}
            />
            <Controller
              name="usageType"
              control={form.control}
              render={({ field }) => (
                <Select
                  label="Usage"
                  w={140}
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? null)}
                  data={[
                    { value: "cut", label: "cut" },
                    { value: "make", label: "make" },
                  ]}
                  clearable
                />
              )}
            />
            <Textarea
              label="Notes"
              autosize
              minRows={1}
              w={240}
              {...form.register("notes")}
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </Group>
        </form>
      </section>

      <section>
        <Title order={4} mb="xs">
          All Costings
        </Title>
        <Form method="get">
          <Group wrap="wrap" align="flex-end" mb="sm">
            <TextInput
              name="q"
              label="Search"
              placeholder="Notes, usage"
              defaultValue={q || ""}
              w={200}
            />
            <Select
              name="usageType"
              label="Usage"
              data={[
                { value: "cut", label: "cut" },
                { value: "make", label: "make" },
              ]}
              defaultValue={filters?.usageType || null}
              clearable
              w={140}
            />
            <TextInput
              name="assemblyId"
              label="Assembly ID"
              defaultValue={filters?.assemblyId || ""}
              w={140}
            />
            <TextInput
              name="componentId"
              label="Component ID"
              defaultValue={filters?.componentId || ""}
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
            if (rec?.id != null) navigate(`/costings/${rec.id}`);
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
              accessor: "assemblyId",
              title: "Assembly",
              render: (r: any) => r.assembly?.name || r.assemblyId,
            },
            {
              accessor: "componentId",
              title: "Component",
              render: (r: any) =>
                r.component?.name || r.component?.sku || r.componentId,
            },
            { accessor: "usageType", title: "Usage" },
            { accessor: "quantityPerUnit", title: "Qty/Unit" },
            { accessor: "unitCost", title: "Unit Cost" },
          ]}
        />
      </section>
    </Stack>
  );
}
