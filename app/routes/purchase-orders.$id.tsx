import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { BreadcrumbSet, useRecordBrowser, useMasterTable, useRecordBrowserShortcuts, useInitGlobalFormContext, RecordNavButtons } from "@aa/timber";
import { Card, Group, Stack, Title, Table, Button } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { NumberInput, Modal } from "@mantine/core";
import { PurchaseOrderDetailForm } from "../components/PurchaseOrderDetailForm";
import { ProductSelect, type ProductOption } from "../components/ProductSelect";
import { useState } from "react";
import { formatQuantity } from "../utils/format";
import { formatUSD } from "../utils/format";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.purchaseOrder ? `PO ${data.purchaseOrder.id}` : "Purchase Order",
  },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: { include: { product: true } },
      company: { select: { name: true } },
      consignee: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!purchaseOrder) throw new Response("Not found", { status: 404 });

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

  // Lightweight product options for adding lines
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, name: true },
    orderBy: [{ sku: "asc" }, { name: "asc" }],
    take: 5000,
  });
  const productOptions = products.map((p) => ({
    value: p.id,
    label: [p.sku, p.name].filter(Boolean).join(" · ") || String(p.id),
    sku: p.sku,
    name: p.name,
  }));

  return json({ purchaseOrder, totals, productOptions });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const isNew = idRaw === "new";
  const id = !isNew && idRaw ? Number(idRaw) : NaN;
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (isNew || intent === "po.create") {
    const dateRaw = form.get("date") as string | null;
    const date = dateRaw ? new Date(dateRaw) : null;
    const status = (form.get("status") as string) || null;
    const max = await prisma.purchaseOrder.aggregate({ _max: { id: true } });
    const nextId = (max._max.id || 0) + 1;
    const created = await prisma.purchaseOrder.create({
      data: { id: nextId, date, status } as any,
    });
    return redirect(`/purchase-orders/${created.id}`);
  }
  if (intent === "po.update") {
    const dateRaw = form.get("date") as string | null;
    const date = dateRaw ? new Date(dateRaw) : null;
    await prisma.purchaseOrder.update({ where: { id }, data: { date } });
    return redirect(`/purchase-orders/${id}`);
  }
  if (intent === "line.add") {
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
  const { purchaseOrder, totals, productOptions } = useLoaderData<typeof loader>();
  useRecordBrowserShortcuts(purchaseOrder.id);
  const { records: masterRecords } = useMasterTable();
  const submit = useSubmit();
  const form = useForm({
    defaultValues: purchaseOrder,
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
  const openPrint = () => {
    window.open(`/purchase-orders/${purchaseOrder.id}/print`, "_blank");
  };
  const downloadPdf = () => {
    window.open(`/purchase-orders/${purchaseOrder.id}/pdf`, "_blank");
  };
  const emailDraft = async () => {
    const resp = await fetch(`/purchase-orders/${purchaseOrder.id}/pdf`);
    const arr = new Uint8Array(await resp.arrayBuffer());
    let binary = "";
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
    const b64 = btoa(binary);
    const boundary = "----=_NextPart_" + Math.random().toString(36).slice(2);
    const subject = `Purchase Order ${purchaseOrder.id}`;
    const bodyText = `Dear Vendor,\n\nPlease find attached Purchase Order ${purchaseOrder.id}.\n\nBest regards,\n`;
    const filename = `PO-${purchaseOrder.id}.pdf`;
    const eml = `From: \nTo: \nSubject: ${subject}\nMIME-Version: 1.0\nContent-Type: multipart/mixed; boundary="${boundary}"\n\n--${boundary}\nContent-Type: text/plain; charset="UTF-8"\nContent-Transfer-Encoding: 7bit\n\n${bodyText}\n\n--${boundary}\nContent-Type: application/pdf; name="${filename}"\nContent-Transfer-Encoding: base64\nContent-Disposition: attachment; filename="${filename}"\n\n${b64}\n--${boundary}--`;
    const blob = new Blob([eml], { type: "message/rfc822" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PO-${purchaseOrder.id}.eml`;
    a.click();
    URL.revokeObjectURL(url);
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
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={openPrint}>
            Print
          </Button>
          <Button size="xs" variant="default" onClick={downloadPdf}>
            Download PDF
          </Button>
          <Button size="xs" variant="light" onClick={emailDraft}>
            Email draft (.eml)
          </Button>
          <RecordNavButtons recordBrowser={recordBrowser} />
        </Group>
      </Group>

      <PurchaseOrderDetailForm
        mode="edit"
        form={form as any}
        purchaseOrder={{
          ...purchaseOrder,
          vendorName: purchaseOrder.company?.name,
          consigneeName: purchaseOrder.consignee?.name,
          locationName: purchaseOrder.location?.name,
        }}
      />

      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Group justify="space-between" align="center">
            <Title order={5}>Lines</Title>
            <Button size="xs" variant="light" onClick={() => setAddOpen(true)}>
              Add Line
            </Button>
          </Group>
        </Card.Section>
        <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add PO Line" centered>
          <Stack gap="sm">
            <ProductSelect label="Product" value={newProductId} onChange={setNewProductId} options={productOptions as unknown as ProductOption[]} />
            <NumberInput label="Qty Ordered" value={newQtyOrdered as any} onChange={(v) => setNewQtyOrdered(Number(v) || 0)} min={0} />
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
              <Table.Th>SKU</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Order Qty</Table.Th>
              <Table.Th>Actual Qty</Table.Th>
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
                <Table.Td>{l.product?.sku ?? ""}</Table.Td>
                <Table.Td>{l.product?.name ?? ""}</Table.Td>
                <Table.Td>
                  <Controller
                    name={`lines.${idx}.quantityOrdered` as any}
                    control={form.control}
                    defaultValue={l.quantityOrdered ?? 0}
                    render={({ field }) => <NumberInput {...field} hideControls allowNegative={false} min={0} w="5rem" />}
                  />
                </Table.Td>
                <Table.Td>
                  <Controller
                    name={`lines.${idx}.quantity` as any}
                    control={form.control}
                    defaultValue={l.quantity ?? 0}
                    render={({ field }) => <NumberInput {...field} hideControls allowNegative={false} min={0} w="5rem" />}
                  />
                </Table.Td>
                <Table.Td>{l.qtyShipped ?? ""}</Table.Td>
                <Table.Td>{l.qtyReceived ?? ""}</Table.Td>
                <Table.Td>{formatUSD(l.priceCost)}</Table.Td>
                <Table.Td>{formatUSD(l.priceSell)}</Table.Td>
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
                <strong>{formatUSD(totals.cost)}</strong>
              </Table.Td>
              <Table.Td>
                <strong>{formatUSD(totals.sell)}</strong>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
