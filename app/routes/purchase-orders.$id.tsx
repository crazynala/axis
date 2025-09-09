import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import {
  BreadcrumbSet,
  useRecordBrowser,
  useMasterTable,
  useRecordBrowserShortcuts,
  useInitGlobalFormContext,
  RecordNavButtons,
} from "@aa/timber";
import {
  Card,
  Divider,
  Group,
  Stack,
  TextInput,
  Title,
  Table,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { NumberInput, Button, Modal } from "@mantine/core";
import { ProductSelect, type ProductOption } from "../components/ProductSelect";
import { useState } from "react";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.purchaseOrder
      ? `PO ${data.purchaseOrder.id}`
      : "Purchase Order",
  },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: true,
      company: { select: { name: true } },
      consignee: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!purchaseOrder) throw new Response("Not found", { status: 404 });
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, name: true },
    orderBy: [{ sku: "asc" }, { name: "asc" }],
    take: 1000,
  });
  const totals = (purchaseOrder.lines || []).reduce(
    (acc: any, l: any) => {
      const qty = Number(l.quantity ?? 0);
      const qtyOrd = Number(l.quantityOrdered ?? 0);
      const cost = Number(l.priceCost ?? 0);
      const sell = Number(l.priceSell ?? 0);
      acc.qty += qty;
      acc.qtyOrdered += qtyOrd;
      acc.cost += cost * qty;
      acc.sell += sell * qty;
      return acc;
    },
    { qty: 0, qtyOrdered: 0, cost: 0, sell: 0 }
  );
  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.sku ? `[${p.sku}] ` : ""}${p.name || p.id}`,
    sku: p.sku,
    name: p.name,
  }));
  return json({ purchaseOrder, totals, productOptions });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  if (form.get("_intent") === "po.update") {
    const dateRaw = form.get("date") as string | null;
    const date = dateRaw ? new Date(dateRaw) : null;
    await prisma.purchaseOrder.update({ where: { id }, data: { date } });
    return redirect(`/purchase-orders/${id}`);
  }
  if (form.get("_intent") === "line.add") {
    if (!Number.isFinite(id)) return redirect(`/purchase-orders/${params.id}`);
    const productId = Number(form.get("productId"));
    const qtyOrdered = Number(form.get("quantityOrdered"));
    if (Number.isFinite(productId) && Number.isFinite(qtyOrdered)) {
      const max = await prisma.purchaseOrderLine.aggregate({
        _max: { id: true },
      });
      const nextId = (max._max.id || 0) + 1;
      await prisma.purchaseOrderLine.create({
        data: {
          id: nextId,
          purchaseOrderId: id,
          productId,
          quantityOrdered: qtyOrdered,
          quantity: 0,
        },
      });
    }
    return redirect(`/purchase-orders/${id}`);
  }
  return redirect(`/purchase-orders/${id}`);
}

export default function PurchaseOrderDetailRoute() {
  const { purchaseOrder, totals, productOptions } =
    useLoaderData<typeof loader>();
  useRecordBrowserShortcuts(purchaseOrder.id);
  const { records: masterRecords } = useMasterTable();
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      id: purchaseOrder.id,
      date: purchaseOrder.date
        ? new Date(purchaseOrder.date).toISOString().slice(0, 10)
        : "",
      status: (purchaseOrder as any).status || "",
    },
  });
  useInitGlobalFormContext(form as any, (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "po.update");
    fd.set("date", values.date || "");
    submit(fd, { method: "post" });
  });
  const recordBrowser = useRecordBrowser(purchaseOrder.id, masterRecords);
  const [addOpen, setAddOpen] = useState(false);
  const [newProductId, setNewProductId] = useState<number | null>(null);
  const [newQtyOrdered, setNewQtyOrdered] = useState<number>(1);
  const doAddLine = () => {
    const fd = new FormData();
    fd.set("_intent", "line.add");
    if (newProductId != null) fd.set("productId", String(newProductId));
    fd.set("quantityOrdered", String(newQtyOrdered || 0));
    submit(fd, { method: "post" });
  };
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "POs", href: "/purchase-orders" },
            {
              label: String(purchaseOrder.id),
              href: `/purchase-orders/${purchaseOrder.id}`,
            },
          ]}
        />
        <RecordNavButtons recordBrowser={recordBrowser} />
      </Group>

      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Title order={4}>Purchase Order</Title>
        </Card.Section>
        <Divider my="xs" />
        <Stack gap={6}>
          <TextInput
            label="ID"
            value={String(purchaseOrder.id)}
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="Date"
            {...form.register("date")}
            mod="data-autoSize"
            placeholder="YYYY-MM-DD"
          />
          <TextInput
            label="Status"
            {...form.register("status")}
            mod="data-autoSize"
          />
          <TextInput
            label="Vendor"
            value={
              purchaseOrder.company?.name ||
              (purchaseOrder as any).companyId ||
              ""
            }
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="Consignee"
            value={
              purchaseOrder.consignee?.name ||
              (purchaseOrder as any).consigneeCompanyId ||
              ""
            }
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="Location"
            value={
              purchaseOrder.location?.name ||
              (purchaseOrder as any).locationId ||
              ""
            }
            readOnly
            mod="data-autoSize"
          />
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Group justify="space-between" align="center">
            <Title order={5}>Lines</Title>
            <Button size="xs" variant="light" onClick={() => setAddOpen(true)}>
              Add Line
            </Button>
          </Group>
        </Card.Section>
        <Modal
          opened={addOpen}
          onClose={() => setAddOpen(false)}
          title="Add PO Line"
          centered
        >
          <Stack gap="sm">
            <ProductSelect
              label="Product"
              value={newProductId}
              onChange={setNewProductId}
              options={productOptions as unknown as ProductOption[]}
            />
            <NumberInput
              label="Qty Ordered"
              value={newQtyOrdered as any}
              onChange={(v) => setNewQtyOrdered(Number(v) || 0)}
              min={0}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={doAddLine} disabled={newProductId == null}>
                Add
              </Button>
            </Group>
          </Stack>
        </Modal>
        <Table withColumnBorders withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Product</Table.Th>
              <Table.Th>Qty Ordered</Table.Th>
              <Table.Th>Qty</Table.Th>
              <Table.Th>Shipped</Table.Th>
              <Table.Th>Received</Table.Th>
              <Table.Th>Cost</Table.Th>
              <Table.Th>Sell</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {purchaseOrder.lines?.map((l: any, idx: number) => (
              <Table.Tr key={l.id}>
                <Table.Td>{l.id}</Table.Td>
                <Table.Td>{l.productId ?? ""}</Table.Td>
                <Table.Td>
                  <Controller
                    name={`lines.${idx}.quantityOrdered` as any}
                    control={form.control}
                    defaultValue={l.quantityOrdered ?? 0}
                    render={({ field }) => (
                      <NumberInput
                        {...field}
                        allowNegative={false}
                        min={0}
                        size="xs"
                      />
                    )}
                  />
                </Table.Td>
                <Table.Td>
                  <Controller
                    name={`lines.${idx}.quantity` as any}
                    control={form.control}
                    defaultValue={l.quantity ?? 0}
                    render={({ field }) => (
                      <NumberInput
                        {...field}
                        allowNegative={false}
                        min={0}
                        size="xs"
                      />
                    )}
                  />
                </Table.Td>
                <Table.Td>{l.qtyShipped ?? ""}</Table.Td>
                <Table.Td>{l.qtyReceived ?? ""}</Table.Td>
                <Table.Td>{l.priceCost ?? ""}</Table.Td>
                <Table.Td>{l.priceSell ?? ""}</Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr>
              <Table.Td colSpan={2}>
                <strong>Totals</strong>
              </Table.Td>
              <Table.Td>
                <strong>{totals.qtyOrdered}</strong>
              </Table.Td>
              <Table.Td>
                <strong>{totals.qty}</strong>
              </Table.Td>
              <Table.Td></Table.Td>
              <Table.Td></Table.Td>
              <Table.Td>
                <strong>{totals.cost.toFixed(2)}</strong>
              </Table.Td>
              <Table.Td>
                <strong>{totals.sell.toFixed(2)}</strong>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
