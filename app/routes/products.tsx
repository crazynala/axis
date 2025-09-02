import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Checkbox, NumberInput, Table, TextInput, Group, Stack, Title, Modal } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Products" }];

export async function loader(_args: LoaderFunctionArgs) {
  const products = await prisma.product.findMany({ orderBy: { id: "asc" } });
  return json({ products });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "create") {
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
    await prisma.product.create({ data: data as any });
    return redirect("/products");
  }

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (id) await prisma.product.delete({ where: { id } });
    return redirect("/products");
  }

  if (intent === "update") {
    const id = Number(form.get("id"));
    if (!id) return redirect("/products");
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
    await prisma.product.update({ where: { id }, data: data as any });
    return redirect("/products");
  }

  return redirect("/products");
}

export default function ProductsRoute() {
  const { products } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";

  const createForm = useForm<{
    code: string;
    sku?: string | null;
    name?: string | null;
    type?: string | null;
    costPrice?: number | null;
    manualSalePrice?: number | null;
    autoSalePrice?: number | null;
    stockTrackingEnabled?: boolean;
    batchTrackingEnabled?: boolean;
  }>({
    defaultValues: { code: "", sku: null, name: null, type: null, costPrice: null, manualSalePrice: null, autoSalePrice: null, stockTrackingEnabled: false, batchTrackingEnabled: false },
  });

  const [editing, setEditing] = useState<any | null>(null);
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <Stack gap="lg">
      <Title order={2}>Products</Title>

      <section>
        <Title order={4} mb="sm">
          Add Product
        </Title>
        <form
          onSubmit={createForm.handleSubmit((values) => {
            const fd = new FormData();
            fd.set("_intent", "create");
            fd.set("code", values.code || "");
            if (values.sku) fd.set("sku", values.sku);
            if (values.name) fd.set("name", values.name);
            if (values.type) fd.set("type", values.type);
            if (values.costPrice != null) fd.set("costPrice", String(values.costPrice));
            if (values.manualSalePrice != null) fd.set("manualSalePrice", String(values.manualSalePrice));
            if (values.autoSalePrice != null) fd.set("autoSalePrice", String(values.autoSalePrice));
            if (values.stockTrackingEnabled) fd.set("stockTrackingEnabled", "on");
            if (values.batchTrackingEnabled) fd.set("batchTrackingEnabled", "on");
            submit(fd, { method: "post" });
          })}
        >
          <Group align="flex-end" wrap="wrap">
            <TextInput label="Code" required w={160} {...createForm.register("code", { required: true })} />
            <TextInput label="SKU" w={160} {...createForm.register("sku")} />
            <TextInput label="Name" w={220} {...createForm.register("name")} />
            <TextInput label="Type" w={140} {...createForm.register("type")} />
            <Controller
              name="costPrice"
              control={createForm.control}
              render={({ field }) => (
                <NumberInput
                  label="Cost Price"
                  step={0.01}
                  w={160}
                  allowDecimal
                  value={field.value ?? undefined}
                  onChange={(v) => field.onChange(v === "" ? null : typeof v === "number" ? v : Number(v))}
                />
              )}
            />
            <Controller
              name="manualSalePrice"
              control={createForm.control}
              render={({ field }) => (
                <NumberInput
                  label="Manual Sale Price"
                  step={0.01}
                  w={200}
                  allowDecimal
                  value={field.value ?? undefined}
                  onChange={(v) => field.onChange(v === "" ? null : typeof v === "number" ? v : Number(v))}
                />
              )}
            />
            <Controller
              name="autoSalePrice"
              control={createForm.control}
              render={({ field }) => (
                <NumberInput
                  label="Auto Sale Price"
                  step={0.01}
                  w={200}
                  allowDecimal
                  value={field.value ?? undefined}
                  onChange={(v) => field.onChange(v === "" ? null : typeof v === "number" ? v : Number(v))}
                />
              )}
            />
            <Controller
              name="stockTrackingEnabled"
              control={createForm.control}
              render={({ field }) => <Checkbox label="Stock Tracking" checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />}
            />
            <Controller
              name="batchTrackingEnabled"
              control={createForm.control}
              render={({ field }) => <Checkbox label="Batch Tracking" checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />}
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </Group>
        </form>
      </section>

      <section>
        <Title order={4} mb="sm">
          All Products
        </Title>
        <Table striped withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Code</Table.Th>
              <Table.Th>SKU</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Cost</Table.Th>
              <Table.Th>Manual</Table.Th>
              <Table.Th>Auto</Table.Th>
              <Table.Th>Stock</Table.Th>
              <Table.Th>Batch</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {products.map((p: any) => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.id}</Table.Td>
                <Table.Td>{p.code}</Table.Td>
                <Table.Td>{p.sku}</Table.Td>
                <Table.Td>{p.name}</Table.Td>
                <Table.Td>{p.type}</Table.Td>
                <Table.Td>{p.costPrice}</Table.Td>
                <Table.Td>{p.manualSalePrice}</Table.Td>
                <Table.Td>{p.autoSalePrice}</Table.Td>
                <Table.Td>{p.stockTrackingEnabled ? "Yes" : "No"}</Table.Td>
                <Table.Td>{p.batchTrackingEnabled ? "Yes" : "No"}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      variant="default"
                      onClick={() => {
                        setEditing(p);
                        open();
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="light"
                      color="red"
                      disabled={busy}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("_intent", "delete");
                        fd.set("id", String(p.id));
                        submit(fd, { method: "post" });
                      }}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </section>

      <EditProductModal
        opened={opened}
        onClose={() => {
          setEditing(null);
          close();
        }}
        product={editing}
      />
    </Stack>
  );
}

function EditProductModal({ opened, onClose, product }: { opened: boolean; onClose: () => void; product: any | null }) {
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";
  const form = useForm<{
    id: number | null;
    code: string;
    sku?: string | null;
    name?: string | null;
    type?: string | null;
    costPrice?: number | null;
    manualSalePrice?: number | null;
    autoSalePrice?: number | null;
    stockTrackingEnabled?: boolean;
    batchTrackingEnabled?: boolean;
  }>({
    defaultValues: { id: null, code: "", sku: null, name: null, type: null, costPrice: null, manualSalePrice: null, autoSalePrice: null, stockTrackingEnabled: false, batchTrackingEnabled: false },
  });

  useEffect(() => {
    if (product) {
      form.reset({
        id: product.id ?? null,
        code: product.code ?? "",
        sku: product.sku ?? null,
        name: product.name ?? null,
        type: product.type ?? null,
        costPrice: product.costPrice ?? null,
        manualSalePrice: product.manualSalePrice ?? null,
        autoSalePrice: product.autoSalePrice ?? null,
        stockTrackingEnabled: !!product.stockTrackingEnabled,
        batchTrackingEnabled: !!product.batchTrackingEnabled,
      });
    }
  }, [product]);

  return (
    <Modal opened={opened} onClose={onClose} title={product ? `Edit Product #${product.id}` : "Edit Product"}>
      <form
        onSubmit={form.handleSubmit((values) => {
          const fd = new FormData();
          fd.set("_intent", "update");
          fd.set("id", String(values.id ?? ""));
          fd.set("code", values.code || "");
          if (values.sku) fd.set("sku", values.sku);
          if (values.name) fd.set("name", values.name);
          if (values.type) fd.set("type", values.type);
          if (values.costPrice != null) fd.set("costPrice", String(values.costPrice));
          if (values.manualSalePrice != null) fd.set("manualSalePrice", String(values.manualSalePrice));
          if (values.autoSalePrice != null) fd.set("autoSalePrice", String(values.autoSalePrice));
          if (values.stockTrackingEnabled) fd.set("stockTrackingEnabled", "on");
          if (values.batchTrackingEnabled) fd.set("batchTrackingEnabled", "on");
          submit(fd, { method: "post" });
          onClose();
        })}
      >
        <Stack>
          <TextInput label="Code" required {...form.register("code", { required: true })} />
          <TextInput label="SKU" {...form.register("sku" as const)} />
          <TextInput label="Name" {...form.register("name" as const)} />
          <TextInput label="Type" {...form.register("type" as const)} />
          <Controller
            name="costPrice"
            control={form.control}
            render={({ field }) => (
              <NumberInput label="Cost Price" step={0.01} allowDecimal value={field.value ?? undefined} onChange={(v) => field.onChange(v === "" ? null : typeof v === "number" ? v : Number(v))} />
            )}
          />
          <Controller
            name="manualSalePrice"
            control={form.control}
            render={({ field }) => (
              <NumberInput
                label="Manual Sale Price"
                step={0.01}
                allowDecimal
                value={field.value ?? undefined}
                onChange={(v) => field.onChange(v === "" ? null : typeof v === "number" ? v : Number(v))}
              />
            )}
          />
          <Controller
            name="autoSalePrice"
            control={form.control}
            render={({ field }) => (
              <NumberInput
                label="Auto Sale Price"
                step={0.01}
                allowDecimal
                value={field.value ?? undefined}
                onChange={(v) => field.onChange(v === "" ? null : typeof v === "number" ? v : Number(v))}
              />
            )}
          />
          <Controller
            name="stockTrackingEnabled"
            control={form.control}
            render={({ field }) => <Checkbox label="Stock Tracking" checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />}
          />
          <Controller
            name="batchTrackingEnabled"
            control={form.control}
            render={({ field }) => <Checkbox label="Batch Tracking" checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
