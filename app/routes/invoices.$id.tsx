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
import { Card, Divider, Group, Stack, Title, Table } from "@mantine/core";
import { InvoiceDetailForm } from "../components/InvoiceDetailForm";
import { Controller, useForm } from "react-hook-form";
import { CompanySelect, type CompanyOption } from "../components/CompanySelect";

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
    include: { lines: true, company: { select: { id: true, name: true } } },
  });
  if (!invoice) throw new Response("Not found", { status: 404 });
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      isCustomer: true,
      isSupplier: true,
      isCarrier: true,
    },
    orderBy: { name: "asc" },
    take: 1000,
  });
  // Totals
  const totals = (invoice.lines || []).reduce(
    (acc: any, l: any) => {
      const qty = Number(l.quantity ?? 0);
      const cost = Number(l.priceCost ?? 0);
      const sell = Number(l.priceSell ?? 0);
      acc.qty += qty;
      acc.cost += cost * qty;
      acc.sell += sell * qty;
      return acc;
    },
    { qty: 0, cost: 0, sell: 0 }
  );
  return json({ invoice, companies, totals });
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
    const companyIdRaw = form.get("companyId") as string | null;
    const companyId = companyIdRaw ? Number(companyIdRaw) : null;
    await prisma.invoice.update({
      where: { id },
      data: { invoiceCode, date, status, notes, companyId },
    });
    return redirect(`/invoices/${id}`);
  }
  return redirect(`/invoices/${id}`);
}

export default function InvoiceDetailRoute() {
  const { invoice, companies, totals } = useLoaderData<typeof loader>();
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
      companyId: invoice.company?.id ?? null,
    },
  });
  useInitGlobalFormContext(form as any, (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "invoice.update");
    fd.set("invoiceCode", values.invoiceCode || "");
    fd.set("status", values.status || "");
    fd.set("notes", values.notes || "");
    fd.set("date", values.date || "");
    if (values.companyId != null) fd.set("companyId", String(values.companyId));
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
        <RecordNavButtons recordBrowser={recordBrowser} />
      </Group>

      <InvoiceDetailForm
        mode="edit"
        form={form as any}
        invoice={{ ...invoice, companyName: invoice.company?.name }}
        customerOptions={companies.map((c) => ({
          value: String(c.id),
          label: c.name || String(c.id),
        }))}
      />

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
              <Table.Tr>
                <Table.Td colSpan={2}>
                  <strong>Totals</strong>
                </Table.Td>
                <Table.Td>
                  <strong>{totals.qty}</strong>
                </Table.Td>
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
      ) : null}
    </Stack>
  );
}
