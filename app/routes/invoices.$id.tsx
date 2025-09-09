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
  NumberInput,
  Stack,
  TextInput,
  Title,
  Textarea,
  Table,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.invoice
      ? `Invoice ${data.invoice.invoiceCode ?? data.invoice.id}`
      : "Invoice",
  },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { lines: true, company: { select: { name: true } } },
  });
  if (!invoice) throw new Response("Not found", { status: 404 });
  return json({ invoice });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  if (form.get("_intent") === "invoice.update") {
    const invoiceCode = (form.get("invoiceCode") as string) || null;
    const dateRaw = form.get("date") as string | null;
    const date = dateRaw ? new Date(dateRaw) : null;
    const status = (form.get("status") as string) || null;
    const notes = (form.get("notes") as string) || null;
    await prisma.invoice.update({
      where: { id },
      data: { invoiceCode, date, status, notes },
    });
    return redirect(`/invoices/${id}`);
  }
  return redirect(`/invoices/${id}`);
}

export default function InvoiceDetailRoute() {
  const { invoice } = useLoaderData<typeof loader>();
  useRecordBrowserShortcuts(invoice.id);
  const { records: masterRecords } = useMasterTable();
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      id: invoice.id,
      invoiceCode: invoice.invoiceCode || "",
      status: invoice.status || "",
      notes: invoice.notes || "",
      date: invoice.date
        ? new Date(invoice.date).toISOString().slice(0, 10)
        : "",
    },
  });
  useInitGlobalFormContext(form as any, (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "invoice.update");
    fd.set("invoiceCode", values.invoiceCode || "");
    fd.set("status", values.status || "");
    fd.set("notes", values.notes || "");
    fd.set("date", values.date || "");
    submit(fd, { method: "post" });
  });
  const recordBrowser = useRecordBrowser(invoice.id, masterRecords);
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Invoices", href: "/invoices" },
            { label: String(invoice.id), href: `/invoices/${invoice.id}` },
          ]}
        />
        {/* RecordNavButtons would go here if imported */}
      </Group>

      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Title order={4}>Invoice</Title>
        </Card.Section>
        <Divider my="xs" />
        <Stack gap={6}>
          <TextInput
            label="ID"
            value={String(invoice.id)}
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="Code"
            {...form.register("invoiceCode")}
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
          <Textarea
            label="Notes"
            {...form.register("notes")}
            autosize
            minRows={2}
          />
        </Stack>
      </Card>

      {invoice.lines?.length ? (
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={5}>Lines</Title>
          </Card.Section>
          <Table withColumnBorders withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Product</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th>Cost</Table.Th>
                <Table.Th>Sell</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {invoice.lines.map((l: any) => (
                <Table.Tr key={l.id}>
                  <Table.Td>{l.id}</Table.Td>
                  <Table.Td>{l.productId ?? ""}</Table.Td>
                  <Table.Td>{l.quantity ?? ""}</Table.Td>
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
