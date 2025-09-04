import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
import { Button, Group, NumberInput, Select, Stack, Text, Textarea, Title } from "@mantine/core";
import { prisma } from "../utils/prisma.server";
import { BreadcrumbSet, useRecordBrowser, RecordNavButtons, useRecordBrowserShortcuts } from "packages/timber";

export const meta: MetaFunction<typeof loader> = ({ data }) => [{ title: data?.costing ? `Costing #${data.costing.id}` : "Costing" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const costing = await prisma.costing.findUnique({
    where: { id },
    include: { assembly: true, component: true },
  });
  if (!costing) throw new Response("Not Found", { status: 404 });
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, name: true },
    orderBy: { id: "asc" },
  });
  const assemblies = await prisma.assembly.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  return json({ costing, products, assemblies });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "update") {
    const assemblyId = form.get("assemblyId") ? Number(form.get("assemblyId")) : null;
    const componentId = form.get("componentId") ? Number(form.get("componentId")) : null;
    const quantityPerUnit = form.get("quantityPerUnit") ? Number(form.get("quantityPerUnit")) : null;
    const unitCost = form.get("unitCost") ? Number(form.get("unitCost")) : null;
    const usageType = (form.get("usageType") as string) || null;
    const notes = (form.get("notes") as string) || null;
    await prisma.costing.update({
      where: { id },
      data: {
        assemblyId: assemblyId ?? undefined,
        componentId: componentId ?? undefined,
        quantityPerUnit,
        unitCost,
        usageType: usageType as any,
        notes,
      },
    });
    return redirect(`/costings/${id}`);
  }

  if (intent === "delete") {
    await prisma.costing.delete({ where: { id } });
    return redirect("/costings");
  }

  return redirect(`/costings/${id}`);
}

export default function CostingDetailRoute() {
  const { costing, products, assemblies } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  // Bind Cmd/Ctrl+ArrowLeft/Right for prev/next navigation
  useRecordBrowserShortcuts(costing.id);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Costing #{costing.id}</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Costings", href: "/costings" },
            { label: String(costing.id), href: `/costings/${costing.id}` },
          ]}
        />
      </Group>
      <RecordNavButtons recordBrowser={useRecordBrowser(costing.id)} />

      <Form method="post">
        <input type="hidden" name="_intent" value="update" />
        <Group align="flex-end" wrap="wrap">
          <Select
            name="assemblyId"
            label="Assembly"
            w={200}
            data={assemblies.map((a: any) => ({
              value: String(a.id),
              label: a.name || `Assembly #${a.id}`,
            }))}
            defaultValue={costing.assemblyId != null ? String(costing.assemblyId) : null}
            clearable
          />
          <Select
            name="componentId"
            label="Component"
            w={200}
            data={products.map((p: any) => ({
              value: String(p.id),
              label: p.name ? `${p.name} (#${p.id}${p.sku ? ", " + p.sku : ""})` : `#${p.id}`,
            }))}
            defaultValue={costing.componentId != null ? String(costing.componentId) : null}
            clearable
          />
          <NumberInput name="quantityPerUnit" label="Qty / Unit" w={140} defaultValue={costing.quantityPerUnit ?? undefined} allowDecimal />
          <NumberInput name="unitCost" label="Unit Cost" w={140} defaultValue={costing.unitCost ?? undefined} allowDecimal />
          <Select
            name="usageType"
            label="Usage"
            w={140}
            data={[
              { value: "cut", label: "cut" },
              { value: "make", label: "make" },
            ]}
            defaultValue={(costing as any).usageType || null}
            clearable
          />
          <Textarea name="notes" label="Notes" w={260} defaultValue={costing.notes || ""} />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </Group>
      </Form>

      <Form method="post">
        <input type="hidden" name="_intent" value="delete" />
        <Button type="submit" color="red" variant="light" disabled={busy}>
          {busy ? "Deleting..." : "Delete"}
        </Button>
      </Form>

      <Text c="dimmed" size="sm">
        ID: {costing.id}
      </Text>
    </Stack>
  );
}
