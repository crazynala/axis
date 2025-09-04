import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Group, Stack, Table, Title, Text, Select, NumberInput, Textarea } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";
import { BreadcrumbSet, useRecordBrowser, RecordNavButtons, useRecordBrowserShortcuts } from "packages/timber";

export const meta: MetaFunction = () => [{ title: "Assembly" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const assembly = await prisma.assembly.findUnique({
    where: { id },
    include: { job: true },
  });
  if (!assembly) throw new Response("Not Found", { status: 404 });
  const costings = await prisma.costing.findMany({
    where: { assemblyId: id },
    include: { component: { select: { id: true, sku: true, name: true } } },
  });
  const activities = await prisma.assemblyActivity.findMany({
    where: { assemblyId: id },
    include: { job: true },
  });
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, name: true },
    orderBy: { id: "asc" },
  });
  return json({ assembly, costings, activities, products });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const id = idRaw && !Number.isNaN(Number(idRaw)) ? Number(idRaw) : NaN;
  if (!Number.isFinite(id)) return redirect("/assembly");
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "costing.create") {
    const compRaw = form.get("componentId");
    const compNum = compRaw == null || compRaw === "" ? null : Number(compRaw);
    const componentId = Number.isFinite(compNum as any) ? (compNum as number) : null;
    const quantityPerUnit = form.get("quantityPerUnit") ? Number(form.get("quantityPerUnit")) : null;
    const unitCost = form.get("unitCost") ? Number(form.get("unitCost")) : null;
    const usageType = (form.get("usageType") as string) || null;
    const notes = (form.get("notes") as string) || null;
    await prisma.costing.create({
      data: {
        assemblyId: id,
        componentId: componentId ?? undefined,
        quantityPerUnit,
        unitCost,
        usageType: usageType as any,
        notes,
      },
    });
    return redirect(`/assembly/${id}`);
  }

  if (intent === "costing.delete") {
    const cid = Number(form.get("id"));
    if (cid) await prisma.costing.delete({ where: { id: cid } });
    return redirect(`/assembly/${id}`);
  }

  if (intent === "activity.delete") {
    const aid = Number(form.get("id"));
    if (aid) await prisma.assemblyActivity.delete({ where: { id: aid } });
    return redirect(`/assembly/${id}`);
  }

  return redirect(`/assembly/${id}`);
}

export default function AssemblyDetailRoute() {
  const { assembly, costings, activities, products } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";
  useRecordBrowserShortcuts(assembly.id);

  const costingForm = useForm<{
    componentId: number | null;
    quantityPerUnit: number | null;
    unitCost: number | null;
    usageType: string | null;
    notes: string | null;
  }>({
    defaultValues: {
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
        <Title order={2}>Assembly</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Assembly", href: "/assembly" },
            { label: String(assembly.id), href: `/assembly/${assembly.id}` },
          ]}
        />
      </Group>
      <RecordNavButtons recordBrowser={useRecordBrowser(assembly.id)} />

      <section>
        <Title order={4} mb="xs">
          Info
        </Title>
        <Stack gap={4} styles={() => ({ root: { maxWidth: 720 } } as any)}>
          <Group gap="md">
            <Text fw={600} w={120}>
              ID
            </Text>
            <Text>{assembly.id}</Text>
          </Group>
          <Group gap="md">
            <Text fw={600} w={120}>
              Name
            </Text>
            <Text>{assembly.name || ""}</Text>
          </Group>
          <Group gap="md">
            <Text fw={600} w={120}>
              Job
            </Text>
            <Text>{assembly.job?.name || assembly.jobId || ""}</Text>
          </Group>
        </Stack>
      </section>

      <section>
        <Title order={4} mb="sm">
          Costings
        </Title>
        <form
          onSubmit={costingForm.handleSubmit((v) => {
            const fd = new FormData();
            fd.set("_intent", "costing.create");
            if (v.componentId != null) fd.set("componentId", String(v.componentId));
            if (v.quantityPerUnit != null) fd.set("quantityPerUnit", String(v.quantityPerUnit));
            if (v.unitCost != null) fd.set("unitCost", String(v.unitCost));
            if (v.usageType) fd.set("usageType", v.usageType);
            if (v.notes) fd.set("notes", v.notes);
            submit(fd, { method: "post" });
          })}
        >
          <Group align="flex-end" wrap="wrap">
            <Controller
              name="componentId"
              control={costingForm.control}
              render={({ field }) => (
                <Select
                  label="Component"
                  w={240}
                  value={field.value ? String(field.value) : null}
                  onChange={(v) => field.onChange(v ? Number(v) : null)}
                  data={products.map((p: any) => ({
                    value: String(p.id),
                    label: p.name ? `${p.name} (#${p.id}${p.sku ? ", " + p.sku : ""})` : `#${p.id}`,
                  }))}
                  clearable
                />
              )}
            />
            <Controller
              name="quantityPerUnit"
              control={costingForm.control}
              render={({ field }) => <NumberInput label="Qty / Unit" w={140} value={field.value ?? undefined} onChange={(v) => field.onChange(v === "" ? null : Number(v))} allowDecimal />}
            />
            <Controller
              name="unitCost"
              control={costingForm.control}
              render={({ field }) => <NumberInput label="Unit Cost" w={140} value={field.value ?? undefined} onChange={(v) => field.onChange(v === "" ? null : Number(v))} allowDecimal />}
            />
            <Controller
              name="usageType"
              control={costingForm.control}
              render={({ field }) => (
                <Select
                  label="Usage"
                  w={160}
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
            <Textarea label="Notes" autosize minRows={1} w={240} {...costingForm.register("notes")} />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Add"}
            </Button>
          </Group>
        </form>

        <Table striped withTableBorder withColumnBorders highlightOnHover mt="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Component</Table.Th>
              <Table.Th>Usage</Table.Th>
              <Table.Th>Qty/Unit</Table.Th>
              <Table.Th>Unit Cost</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {costings.map((c: any) => (
              <Table.Tr key={c.id}>
                <Table.Td>{c.id}</Table.Td>
                <Table.Td>{c.component?.name || c.component?.sku || c.componentId}</Table.Td>
                <Table.Td>{c.usageType}</Table.Td>
                <Table.Td>{c.quantityPerUnit}</Table.Td>
                <Table.Td>{c.unitCost}</Table.Td>
                <Table.Td>
                  <form method="post">
                    <input type="hidden" name="_intent" value="costing.delete" />
                    <input type="hidden" name="id" value={c.id} />
                    <Button type="submit" variant="light" color="red" disabled={busy}>
                      Delete
                    </Button>
                  </form>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </section>

      <section>
        <Title order={4} mb="sm">
          Assembly Activities
        </Title>
        <Table striped withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th>Job</Table.Th>
              <Table.Th>Start</Table.Th>
              <Table.Th>End</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {activities.map((a: any) => (
              <Table.Tr key={a.id}>
                <Table.Td>{a.id}</Table.Td>
                <Table.Td>{a.name}</Table.Td>
                <Table.Td>{a.description}</Table.Td>
                <Table.Td>{a.job?.name || a.jobId}</Table.Td>
                <Table.Td>{a.startTime ? new Date(a.startTime).toLocaleString() : ""}</Table.Td>
                <Table.Td>{a.endTime ? new Date(a.endTime).toLocaleString() : ""}</Table.Td>
                <Table.Td>{a.status}</Table.Td>
                <Table.Td>{a.notes}</Table.Td>
                <Table.Td>
                  <form method="post">
                    <input type="hidden" name="_intent" value="activity.delete" />
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" variant="light" color="red" disabled={busy}>
                      Delete
                    </Button>
                  </form>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </section>
    </Stack>
  );
}
