import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Group, Stack, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { ProductDetailForm } from "../components/ProductDetailForm";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "New Product" }];

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const sku = (form.get("sku") as string | null)?.trim() || null;
  const name = (form.get("name") as string | null)?.trim() || null;
  if (!sku && !name) return json({ error: "SKU or Name is required" }, { status: 400 });
  const data = {
    sku,
    name,
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
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      sku: "",
      name: "",
      type: "",
      costPrice: undefined as any,
      manualSalePrice: undefined as any,
      autoSalePrice: undefined as any,
      stockTrackingEnabled: false,
      batchTrackingEnabled: false,
    },
  });
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = form.getValues();
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined || v === null || v === "") continue;
      if (typeof v === "boolean") {
        if (v) fd.set(k, "on");
      } else {
        fd.set(k, String(v));
      }
    }
    submit(fd, { method: "post" });
  };
  return (
    <Stack>
      <Title order={2}>Create New Product</Title>
      <form onSubmit={onSubmit}>
        <ProductDetailForm mode="edit" form={form as any} />
        <Group mt="md">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Create"}
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
