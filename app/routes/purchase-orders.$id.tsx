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
import { useForm } from "react-hook-form";

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
  return json({ purchaseOrder });
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
  return redirect(`/purchase-orders/${id}`);
}

export default function PurchaseOrderDetailRoute() {
  const { purchaseOrder } = useLoaderData<typeof loader>();
  useRecordBrowserShortcuts(purchaseOrder.id);
  const { records: masterRecords } = useMasterTable();
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      id: purchaseOrder.id,
      date: purchaseOrder.date
        ? new Date(purchaseOrder.date).toISOString().slice(0, 10)
        : "",
    },
  });
  useInitGlobalFormContext(form as any, (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "po.update");
    fd.set("date", values.date || "");
    submit(fd, { method: "post" });
  });
  const recordBrowser = useRecordBrowser(purchaseOrder.id, masterRecords);
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
            label="Vendor"
            value={purchaseOrder.company?.name ?? ""}
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="Consignee"
            value={purchaseOrder.consignee?.name ?? ""}
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="Location"
            value={purchaseOrder.location?.name ?? ""}
            readOnly
            mod="data-autoSize"
          />
        </Stack>
      </Card>

      {purchaseOrder.lines?.length ? (
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={5}>Lines</Title>
          </Card.Section>
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
              {purchaseOrder.lines.map((l: any) => (
                <Table.Tr key={l.id}>
                  <Table.Td>{l.id}</Table.Td>
                  <Table.Td>{l.productId ?? ""}</Table.Td>
                  <Table.Td>{l.quantityOrdered ?? ""}</Table.Td>
                  <Table.Td>{l.quantity ?? ""}</Table.Td>
                  <Table.Td>{l.qtyShipped ?? ""}</Table.Td>
                  <Table.Td>{l.qtyReceived ?? ""}</Table.Td>
                  <Table.Td>{l.priceCost ?? ""}</Table.Td>
                  <Table.Td>{l.priceSell ?? ""}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      ) : null}
    </Stack>
  );
}
