import { json, redirect } from "@remix-run/node";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Textarea,
  Title,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { BreadcrumbSet } from "@aa/timber";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "New Costing" }];

export async function loader(_args: LoaderFunctionArgs) {
  const [products, assemblies] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, sku: true, name: true },
      orderBy: { id: "asc" },
    }),
    prisma.assembly.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return json({ products, assemblies });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const assemblyId = form.get("assemblyId")
    ? Number(form.get("assemblyId"))
    : null;
  const productId = form.get("productId")
    ? Number(form.get("productId"))
    : null;
  const quantityPerUnit = form.get("quantityPerUnit")
    ? Number(form.get("quantityPerUnit"))
    : null;
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

export default function NewCostingRoute() {
  const { products, assemblies } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      assemblyId: null as number | null,
      productId: null as number | null,
      quantityPerUnit: null as number | null,
      unitCost: null as number | null,
      notes: "",
    },
  });
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>New Costing</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Costings", href: "/costings" },
            { label: "New", href: "#" },
          ]}
        />
      </Group>
      <form
        onSubmit={form.handleSubmit((values) => {
          const fd = new FormData();
          if (values.assemblyId != null)
            fd.set("assemblyId", String(values.assemblyId));
          if (values.productId != null)
            fd.set("productId", String(values.productId));
          if (values.quantityPerUnit != null)
            fd.set("quantityPerUnit", String(values.quantityPerUnit));
          if (values.unitCost != null)
            fd.set("unitCost", String(values.unitCost));
          if (values.notes) fd.set("notes", String(values.notes));
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
            name="productId"
            control={form.control}
            render={({ field }) => (
              <Select
                label="Product"
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
          {/* usageType removed from schema */}
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
    </Stack>
  );
}
