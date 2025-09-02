import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Table, Group, Stack, Title, Select, NumberInput, Textarea } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Costings" }];

export async function loader(_args: LoaderFunctionArgs) {
  const costings = await prisma.costing.findMany({ orderBy: { id: "asc" } });
  const products = await prisma.product.findMany({ select: { id: true, code: true }, orderBy: { code: "asc" } });
  const assemblies = await prisma.assembly.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });
  return json({ costings, products, assemblies });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "create") {
    const assemblyId = form.get("assemblyId") ? Number(form.get("assemblyId")) : null;
    const componentId = form.get("componentId") ? Number(form.get("componentId")) : null;
    const quantityPerUnit = form.get("quantityPerUnit") ? Number(form.get("quantityPerUnit")) : null;
    const unitCost = form.get("unitCost") ? Number(form.get("unitCost")) : null;
    const usageType = (form.get("usageType") as string) || null;
    const notes = (form.get("notes") as string) || null;
    await prisma.costing.create({
      data: { assemblyId: assemblyId ?? undefined, componentId: componentId ?? undefined, quantityPerUnit, unitCost, usageType: usageType as any, notes },
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

export default function CostingsRoute() {
  const { costings, products, assemblies } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";

  const form = useForm<{ assemblyId: number | null; componentId: number | null; quantityPerUnit: number | null; unitCost: number | null; usageType: string | null; notes: string | null }>({
    defaultValues: { assemblyId: null, componentId: null, quantityPerUnit: null, unitCost: null, usageType: null, notes: "" },
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
            if (values.assemblyId != null) fd.set("assemblyId", String(values.assemblyId));
            if (values.componentId != null) fd.set("componentId", String(values.componentId));
            if (values.quantityPerUnit != null) fd.set("quantityPerUnit", String(values.quantityPerUnit));
            if (values.unitCost != null) fd.set("unitCost", String(values.unitCost));
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
                  data={assemblies.map((a: any) => ({ value: String(a.id), label: a.name || `Assembly #${a.id}` }))}
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
                  data={products.map((p: any) => ({ value: String(p.id), label: p.code }))}
                  clearable
                />
              )}
            />
            <Controller
              name="quantityPerUnit"
              control={form.control}
              render={({ field }) => <NumberInput label="Qty / Unit" w={140} value={field.value ?? undefined} onChange={(v) => field.onChange(v === "" ? null : Number(v))} allowDecimal />}
            />
            <Controller
              name="unitCost"
              control={form.control}
              render={({ field }) => <NumberInput label="Unit Cost" w={140} value={field.value ?? undefined} onChange={(v) => field.onChange(v === "" ? null : Number(v))} allowDecimal />}
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
            <Textarea label="Notes" autosize minRows={1} w={240} {...form.register("notes")} />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </Group>
        </form>
      </section>

      <section>
        <Title order={4} mb="sm">
          All Costings
        </Title>
        <Table striped withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Assembly</Table.Th>
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
                <Table.Td>{c.assemblyId}</Table.Td>
                <Table.Td>{c.componentId}</Table.Td>
                <Table.Td>{c.usageType}</Table.Td>
                <Table.Td>{c.quantityPerUnit}</Table.Td>
                <Table.Td>{c.unitCost}</Table.Td>
                <Table.Td>
                  <Button
                    variant="light"
                    color="red"
                    disabled={busy}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("_intent", "delete");
                      fd.set("id", String(c.id));
                      submit(fd, { method: "post" });
                    }}
                  >
                    Delete
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </section>
    </Stack>
  );
}
