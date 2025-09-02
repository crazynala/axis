import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useNavigation } from "@remix-run/react";
import { Button, Checkbox, Group, NumberInput, Stack, TextInput, Title } from "@mantine/core";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "New Product" }];

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const code = String(form.get("code") || "").trim();
  if (!code) return json({ error: "Code is required" }, { status: 400 });
  const data = {
    code,
    sku: (form.get("sku") as string | null)?.trim() || null,
    name: (form.get("name") as string | null)?.trim() || null,
    type: (form.get("type") as string | null)?.trim() || null,
    costPrice: form.get("costPrice") ? Number(form.get("costPrice")) : null,
    manualSalePrice: form.get("manualSalePrice") ? Number(form.get("manualSalePrice")) : null,
    autoSalePrice: form.get("autoSalePrice") ? Number(form.get("autoSalePrice")) : null,
    stockTrackingEnabled: form.get("stockTrackingEnabled") === "on",
    batchTrackingEnabled: form.get("batchTrackingEnabled") === "on",
  } as const;
  const created = await prisma.product.create({ data: data as any });
  return redirect(`/products/${created.id}`);
}

export default function NewProductRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <Stack>
      <Title order={2}>Create New Product</Title>
      <Form method="post">
        <Stack>
          <TextInput name="code" label="Code" required w={240} />
          <TextInput name="sku" label="SKU" w={240} />
          <TextInput name="name" label="Name" w={360} />
          <TextInput name="type" label="Type" w={200} />
          <NumberInput name="costPrice" label="Cost Price" step={0.01} w={200} allowDecimal />
          <NumberInput name="manualSalePrice" label="Manual Sale Price" step={0.01} w={220} allowDecimal />
          <NumberInput name="autoSalePrice" label="Auto Sale Price" step={0.01} w={220} allowDecimal />
          <Checkbox name="stockTrackingEnabled" label="Stock Tracking" />
          <Checkbox name="batchTrackingEnabled" label="Batch Tracking" />
          <Group>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Create"}
            </Button>
          </Group>
        </Stack>
      </Form>
    </Stack>
  );
}
