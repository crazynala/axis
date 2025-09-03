import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link, Form, useNavigation } from "@remix-run/react";
import {
  Stack,
  Title,
  Group,
  Text,
  Button,
  Checkbox,
  NumberInput,
  TextInput,
} from "@mantine/core";
import { Table } from "@mantine/core";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.product
      ? `Product ${data.product.name ?? data.product.id}`
      : "Product",
  },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const idStr = params.id;
  const id = Number(idStr);
  if (!idStr || Number.isNaN(id)) {
    throw new Response("Invalid product id", { status: 400 });
  }
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      batches: true,
      productLines: {
        include: { child: { select: { id: true, sku: true, name: true } } },
      },
    },
  });
  if (!product) throw new Response("Not found", { status: 404 });
  return json({ product });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const id = idRaw && !Number.isNaN(Number(idRaw)) ? Number(idRaw) : NaN;
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "delete") {
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id" }, { status: 400 });
    await prisma.product.delete({ where: { id } });
    return redirect("/products");
  }
  if (intent === "update") {
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id" }, { status: 400 });
    // map free-text to enum if it matches, else null
    const typeStr = (form.get("type") as string | null)?.trim() || null;
    const typeEnum =
      typeStr &&
      ["CMT", "Fabric", "Finished", "Trim", "Service"].includes(typeStr)
        ? (typeStr as any)
        : null;
    await prisma.product.update({
      where: { id },
      data: {
        sku: (form.get("sku") as string | null)?.trim() || null,
        name: (form.get("name") as string | null)?.trim() || null,
        type: typeEnum,
        costPrice: form.get("costPrice") ? Number(form.get("costPrice")) : null,
        manualSalePrice: form.get("manualSalePrice")
          ? Number(form.get("manualSalePrice"))
          : null,
        autoSalePrice: form.get("autoSalePrice")
          ? Number(form.get("autoSalePrice"))
          : null,
        stockTrackingEnabled: form.get("stockTrackingEnabled") === "on",
        batchTrackingEnabled: form.get("batchTrackingEnabled") === "on",
      },
    });
    return redirect(`/products/${id}`);
  }
  if (intent === "addProductLine") {
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id" }, { status: 400 });
    const childRef = String(form.get("childRef") || "").trim();
    const quantity = form.get("quantity") ? Number(form.get("quantity")) : null;
    const unitCost = form.get("unitCost") ? Number(form.get("unitCost")) : null;
    if (!childRef || quantity === null || unitCost === null) {
      return json(
        {
          error:
            "Child product (ID or SKU), quantity, and unit cost are required",
        },
        { status: 400 }
      );
    }
    let childProduct = null as any;
    const byId = Number(childRef);
    if (Number.isFinite(byId)) {
      childProduct = await prisma.product.findUnique({ where: { id: byId } });
    }
    if (!childProduct) {
      childProduct = await prisma.product.findFirst({
        where: { sku: childRef },
      });
    }
    if (!childProduct) {
      return json(
        { error: `Child product '${childRef}' not found` },
        { status: 404 }
      );
    }
    await prisma.productLine.create({
      data: {
        parentId: id,
        childId: childProduct.id,
        quantity,
        unitCost,
      },
    });
    return redirect(`/products/${id}`);
  }
  if (intent === "deleteProductLine") {
    const productLineId = Number(form.get("productLineId"));
    if (Number.isNaN(productLineId)) {
      return json({ error: "Invalid product line id" }, { status: 400 });
    }
    await prisma.productLine.delete({ where: { id: productLineId } });
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
        <Title order={2}>{product.name || `Product #${product.id}`}</Title>
        <Link to="/products">Back</Link>
      </Group>

      <Form method="post">
        <Stack>
          <input type="hidden" name="_intent" value="update" />
          <TextInput
            name="sku"
            label="SKU"
            defaultValue={product.sku || ""}
            w={240}
          />
          <TextInput
            name="name"
            label="Name"
            defaultValue={product.name || ""}
            w={360}
          />
          <TextInput
            name="type"
            label="Type"
            defaultValue={product.type || ""}
            w={200}
          />
          <NumberInput
            name="costPrice"
            label="Cost Price"
            defaultValue={product.costPrice ?? undefined}
            step={0.01}
            w={200}
            allowDecimal
          />
          <NumberInput
            name="manualSalePrice"
            label="Manual Sale Price"
            defaultValue={product.manualSalePrice ?? undefined}
            step={0.01}
            w={220}
            allowDecimal
          />
          <NumberInput
            name="autoSalePrice"
            label="Auto Sale Price"
            defaultValue={product.autoSalePrice ?? undefined}
            step={0.01}
            w={220}
            allowDecimal
          />
          <Checkbox
            name="stockTrackingEnabled"
            label="Stock Tracking"
            defaultChecked={!!product.stockTrackingEnabled}
          />
          <Checkbox
            name="batchTrackingEnabled"
            label="Batch Tracking"
            defaultChecked={!!product.batchTrackingEnabled}
          />
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

      <section>
        <Title order={4} mb="sm">
          Bill of Materials (ProductLines)
        </Title>
        <Form method="post">
          <input type="hidden" name="_intent" value="addProductLine" />
          <Group align="flex-end" wrap="wrap">
            <TextInput name="childRef" label="Child (ID or SKU)" w={200} />
            <NumberInput
              name="quantity"
              label="Quantity"
              w={120}
              allowDecimal
            />
            <NumberInput
              name="unitCost"
              label="Unit Cost"
              w={120}
              allowDecimal
            />
            <Button type="submit" disabled={busy}>
              Add
            </Button>
          </Group>
        </Form>
        <Table
          striped
          withTableBorder
          withColumnBorders
          highlightOnHover
          mt="md"
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Child</Table.Th>
              <Table.Th>Quantity</Table.Th>
              <Table.Th>Unit Cost</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {product.productLines.map((pl: any) => (
              <Table.Tr key={pl.id}>
                <Table.Td>{pl.id}</Table.Td>
                <Table.Td>
                  {pl.child?.sku || pl.child?.name || pl.childId}
                </Table.Td>
                <Table.Td>{pl.quantity}</Table.Td>
                <Table.Td>{pl.unitCost}</Table.Td>
                <Table.Td>
                  <Form method="post">
                    <input
                      type="hidden"
                      name="_intent"
                      value="deleteProductLine"
                    />
                    <input type="hidden" name="productLineId" value={pl.id} />
                    <Button
                      type="submit"
                      color="red"
                      variant="light"
                      disabled={busy}
                    >
                      Delete
                    </Button>
                  </Form>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </section>

      <Text c="dimmed" size="sm">
        ID: {product.id}
      </Text>
    </Stack>
  );
}
