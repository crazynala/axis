import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useRouteLoaderData, useSubmit } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import { useRecordContext } from "../base/record/RecordContext";
import { Card, Divider, Group, Stack, Title, Table } from "@mantine/core";
import { InvoiceDetailForm } from "../modules/invoice/forms/InvoiceDetailForm";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { buildInvoiceLineDetails } from "../utils/invoiceLineDetails";
import { formatQuantity } from "../utils/format";
import { formatUSD } from "../utils/format";

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
    include: {
      lines: {
        include: {
          job: true,
          costing: {
            include: {
              assembly: { select: { name: true } },
              product: { select: { name: true } },
            },
          },
          expense: true,
        },
      },
      company: { select: { id: true, name: true } },
    },
  });
  if (!invoice) return redirect("/invoices");

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
  // Build details strings for each line using related data
  const poLineIds = Array.from(
    new Set(
      (invoice.lines || [])
        .map((l: any) => l.purchaseOrderLineId)
        .filter((v: any) => v != null)
    )
  ) as number[];
  const shipIds = Array.from(
    new Set(
      (invoice.lines || [])
        .flatMap((l: any) => [l.shippingIdActual, l.shippingIdDuty])
        .filter((v: any) => v != null)
    )
  ) as number[];

  const [poLines, shipments] = await Promise.all([
    poLineIds.length
      ? prisma.purchaseOrderLine.findMany({
          where: { id: { in: poLineIds } },
          include: {
            purchaseOrder: { include: { company: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    shipIds.length
      ? prisma.shipment.findMany({
          where: { id: { in: shipIds } },
          include: { companyCarrier: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const poMap = new Map<number, any>();
  for (const po of poLines) poMap.set(po.id, po);
  const shipMap = new Map<number, any>();
  for (const sh of shipments) shipMap.set(sh.id, sh);

  const detailsById: Record<number, string> = {};
  for (const l of invoice.lines || []) {
    const po = l.purchaseOrderLineId ? poMap.get(l.purchaseOrderLineId) : null;
    const shipActual = l.shippingIdActual
      ? shipMap.get(l.shippingIdActual)
      : null;
    const shipDuty = l.shippingIdDuty ? shipMap.get(l.shippingIdDuty) : null;
    const poBrief = po
      ? {
          id: po.id,
          purchaseOrderId: po.purchaseOrderId as number | null,
          productSkuCopy: po.productSkuCopy as string | null,
          productNameCopy: po.productNameCopy as string | null,
          companyName: po.purchaseOrder?.company?.name ?? null,
        }
      : null;
    const shipBrief = (sh: any) =>
      sh
        ? {
            id: sh.id,
            trackingNo: sh.trackingNo as string | null,
            date: sh.date as any,
            packingSlipCode: sh.packingSlipCode as string | null,
            companyCarrierName: sh.companyCarrier?.name ?? null,
          }
        : null;
    detailsById[l.id] = buildInvoiceLineDetails(l, {
      poLine: poBrief,
      shipActual: shipBrief(shipActual),
      shipDuty: shipBrief(shipDuty),
    });
  }

  return json({ invoice, totals, detailsById });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const isNew = idRaw === "new";
  const id = !isNew && idRaw ? Number(idRaw) : NaN;
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (isNew || intent === "invoice.create") {
    const invoiceCode = (form.get("invoiceCode") as string) || null;
    const dateRaw = form.get("date") as string | null;
    const date = dateRaw ? new Date(dateRaw) : null;
    const status = (form.get("status") as string) || null;
    const notes = (form.get("notes") as string) || null;
    const companyIdRaw = form.get("companyId") as string | null;
    const companyId = companyIdRaw ? Number(companyIdRaw) : null;
    const max = await prisma.invoice.aggregate({ _max: { id: true } });
    const nextId = (max._max.id || 0) + 1;
    const created = await prisma.invoice.create({
      data: { id: nextId, invoiceCode, date, status, notes, companyId } as any,
    });
    return redirect(`/invoices/${created.id}`);
  }
  if (intent === "invoice.update") {
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

export function InvoiceDetailView() {
  const { invoice, totals, detailsById } = useRouteLoaderData<typeof loader>(
    "routes/invoices.$id"
  )!;
  console.log("InvoiceDetailRoute invoice:", invoice);
  const { setCurrentId, state } = useRecordContext();
  // Preserve currentId when navigating back to index: do not clear on unmount.
  useEffect(() => {
    setCurrentId(invoice.id);
  }, [invoice.id, setCurrentId]);
  const submit = useSubmit();
  const form = useForm({
    defaultValues: invoice,
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
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Invoices", href: "/invoices" },
            { label: String(invoice.id), href: `/invoices/${invoice.id}` },
          ]}
        />
        {/* Navigation buttons could use GlobalRecordBrowser elsewhere; omit here for now */}
      </Group>

      <InvoiceDetailForm mode="edit" form={form as any} />

      {invoice.lines?.length ? (
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={5}>Lines</Title>
          </Card.Section>
          <Table withColumnBorders withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Job</Table.Th>
                <Table.Th>Details</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th>Cost</Table.Th>
                <Table.Th>Sell</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {invoice.lines.map((l: any) => (
                <Table.Tr key={l.id}>
                  <Table.Td>{l.id}</Table.Td>
                  <Table.Td>{l.job?.projectCode ?? ""}</Table.Td>
                  <Table.Td>{detailsById?.[l.id] ?? ""}</Table.Td>
                  <Table.Td>{formatQuantity(l.quantity)}</Table.Td>
                  <Table.Td>{formatUSD(l.priceCost)}</Table.Td>
                  <Table.Td>{formatUSD(l.priceSell)}</Table.Td>
                </Table.Tr>
              ))}
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <strong>Totals</strong>
                </Table.Td>
                <Table.Td>
                  <strong>{totals.qty}</strong>
                </Table.Td>
                <Table.Td>
                  <strong>{formatUSD(totals.cost)}</strong>
                </Table.Td>
                <Table.Td>
                  <strong>{formatUSD(totals.sell)}</strong>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Card>
      ) : null}
    </Stack>
  );
}

export default function InvoiceDetailLayout() {
  return <Outlet />;
}
