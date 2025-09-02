import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link, Form, useNavigation } from "@remix-run/react";
import { Stack, Title, Group, Text, Button, Checkbox, NumberInput, TextInput } from "@mantine/core";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [{ title: data?.product ? `Product ${data.product.code}` : "Product" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const idStr = params.id;
  const id = Number(idStr);
  if (!idStr || Number.isNaN(id)) {
    throw new Response("Invalid product id", { status: 400 });
  }
  const product = await prisma.product.findUnique({ where: { id }, include: { batches: true, productLines: true } });
  if (!product) throw new Response("Not found", { status: 404 });
  return json({ product });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "delete") {
    await prisma.product.delete({ where: { id } });
    return redirect("/products");
  }
  if (intent === "update") {
    const code = String(form.get("code") || "").trim();
    if (!code) return json({ error: "Code required" }, { status: 400 });
    // map free-text to enum if it matches, else null
    const typeStr = (form.get("type") as string | null)?.trim() || null;
    const typeEnum = typeStr && ["CMT", "Fabric", "Finished", "Trim", "Service"].includes(typeStr) ? (typeStr as any) : null;
    await prisma.product.update({
      where: { id },
      data: {
        code,
        sku: (form.get("sku") as string | null)?.trim() || null,
        name: (form.get("name") as string | null)?.trim() || null,
        type: typeEnum,
        costPrice: form.get("costPrice") ? Number(form.get("costPrice")) : null,
        manualSalePrice: form.get("manualSalePrice") ? Number(form.get("manualSalePrice")) : null,
        autoSalePrice: form.get("autoSalePrice") ? Number(form.get("autoSalePrice")) : null,
        stockTrackingEnabled: form.get("stockTrackingEnabled") === "on",
        batchTrackingEnabled: form.get("batchTrackingEnabled") === "on",
      },
    });
    return redirect(`/products/${id}`);
  }
  return redirect(`/products/${id}`);
}

export default function ProductDetailRoute() {
  const { product } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>
          {product.code} — {product.name}
        </Title>
        <Link to="/products">Back</Link>
      </Group>

      <Form method="post">
        <Stack>
          <input type="hidden" name="_intent" value="update" />
          <TextInput name="code" label="Code" defaultValue={product.code || ""} required w={240} />
          <TextInput name="sku" label="SKU" defaultValue={product.sku || ""} w={240} />
          <TextInput name="name" label="Name" defaultValue={product.name || ""} w={360} />
          <TextInput name="type" label="Type" defaultValue={product.type || ""} w={200} />
          <NumberInput name="costPrice" label="Cost Price" defaultValue={product.costPrice ?? undefined} step={0.01} w={200} allowDecimal />
          <NumberInput name="manualSalePrice" label="Manual Sale Price" defaultValue={product.manualSalePrice ?? undefined} step={0.01} w={220} allowDecimal />
          <NumberInput name="autoSalePrice" label="Auto Sale Price" defaultValue={product.autoSalePrice ?? undefined} step={0.01} w={220} allowDecimal />
          <Checkbox name="stockTrackingEnabled" label="Stock Tracking" defaultChecked={!!product.stockTrackingEnabled} />
          <Checkbox name="batchTrackingEnabled" label="Batch Tracking" defaultChecked={!!product.batchTrackingEnabled} />
          <Group>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save changes"}
            </Button>
          </Group>
        </Stack>
      </Form>

      <Form method="post">
        <input type="hidden" name="_intent" value="delete" />
        <Button color="red" variant="light" type="submit" disabled={busy}>
          {busy ? "Deleting..." : "Delete product"}
        </Button>
      </Form>

      <Text c="dimmed" size="sm">
        ID: {product.id}
      </Text>
    </Stack>
  );
}
