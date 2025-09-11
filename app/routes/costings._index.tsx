import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useSubmit, useSearchParams, useNavigate, Form, useRouteLoaderData } from "@remix-run/react";
import { Button, Group, Stack, Title, Select, NumberInput, TextInput } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { BreadcrumbSet } from "@aa/timber";
import { prisma } from "../utils/prisma.server";
import { NavDataTable } from "../components/NavDataTable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { idLinkColumn, simpleColumn } from "../components/tableColumns";

export const meta: MetaFunction = () => [{ title: "Costings" }];

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const params = parseTableParams(args.request.url);
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["notes", "activityUsed"],
    filterMappers: {
      assemblyId: (v: string) => ({ assemblyId: Number(v) }),
      productId: (v: string) => ({ productId: Number(v) }),
    },
  });
  const [rows, total, products, assemblies] = await Promise.all([
    prisma.costing.findMany({
      ...prismaArgs,
      include: {
        assembly: { select: { id: true, name: true } },
        product: { select: { id: true, sku: true, name: true } },
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
    const assemblyId = form.get("assemblyId") ? Number(form.get("assemblyId")) : null;
    const productId = form.get("productId") ? Number(form.get("productId")) : null;
    const quantityPerUnit = form.get("quantityPerUnit") ? Number(form.get("quantityPerUnit")) : null;
    const unitCost = form.get("unitCost") ? Number(form.get("unitCost")) : null;
    const notes = (form.get("notes") as string) || null;
    await prisma.costing.create({
      data: {
        assemblyId: assemblyId ?? undefined,
        productId: productId ?? undefined,
        quantityPerUnit,
        unitCost,
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
  const { rows, total, page, perPage, q, filters, products, assemblies } = useLoaderData<typeof loader>();
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
      <Group justify="space-between" align="center">
        <Title order={2}>Costings</Title>
        <BreadcrumbSet breadcrumbs={[{ label: "Costings", href: "/costings" }]} />
      </Group>
      <Group>
        <Button component={Link} to="/costings/new" variant="filled" color="blue">
          New Costing
        </Button>
      </Group>

      <section>
        <Title order={4} mb="xs">
          All Costings
        </Title>
        <Form method="get">
          <Group wrap="wrap" align="flex-end" mb="sm">
            <TextInput name="q" label="Search" placeholder="Notes, usage" defaultValue={q || ""} w={200} />
            <TextInput name="assemblyId" label="Assembly ID" defaultValue={filters?.assemblyId || ""} w={140} />
            <TextInput name="productId" label="Product ID" defaultValue={filters?.productId || ""} w={140} />
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
            if (rec?.id != null) navigate(`/costings/${rec.id}`);
          }}
          onRowActivate={(rec: any) => {
            if (rec?.id != null) navigate(`/costings/${rec.id}`);
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
            { accessor: "id", title: "ID", width: 70, sortable: true },
            {
              accessor: "assemblyId",
              title: "Assembly",
              render: (r: any) => r.assembly?.name || r.assemblyId,
            },
            {
              accessor: "componentId",
              title: "Component",
              render: (r: any) => r.component?.name || r.component?.sku || r.componentId,
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
