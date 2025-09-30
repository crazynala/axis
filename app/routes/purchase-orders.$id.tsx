import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { prisma, refreshProductStockSnapshot } from "../utils/prisma.server";
import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import { Card, Group, Stack, Title, Table, Button } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { NumberInput, Modal } from "@mantine/core";
import { PurchaseOrderDetailForm } from "~/modules/purchaseOrder/forms/PurchaseOrderDetailForm";
import {
  ProductSelect,
  type ProductOption,
} from "../modules/product/components/ProductSelect";
import { useState, useEffect } from "react";
import { useRecordContext } from "../base/record/RecordContext";
import { formatUSD } from "../utils/format";
import { POReceiveModal } from "../components/POReceiveModal";

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
      lines: { include: { product: true } },
      company: { select: { name: true } },
      consignee: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!purchaseOrder) throw new Response("Not found", { status: 404 });

  // Derive shipped/received from Product Movements to make PMs the source of truth
  const lineIds = (purchaseOrder.lines || []).map((l: any) => l.id);
  let receivedByLine = new Map<number, number>();
  let shippedByLine = new Map<number, number>();
  if (lineIds.length) {
    const mls = await prisma.productMovementLine.findMany({
      where: {
        purchaseOrderLineId: { in: lineIds },
      },
      select: {
        purchaseOrderLineId: true,
        quantity: true,
        movement: { select: { movementType: true } },
      },
    });
    for (const ml of mls) {
      const lid = ml.purchaseOrderLineId as number;
      const qty = Number(ml.quantity || 0);
      const t = (ml.movement?.movementType || "").toLowerCase();
      if (t === "po (receive)") {
        receivedByLine.set(lid, (receivedByLine.get(lid) || 0) + qty);
      } else if (t === "po (ship)") {
        shippedByLine.set(lid, (shippedByLine.get(lid) || 0) + qty);
      }
    }
  }
  const linesWithComputed = (purchaseOrder.lines || []).map((l: any) => ({
    ...l,
    qtyReceived: receivedByLine.get(l.id) || 0,
    qtyShipped: shippedByLine.get(l.id) || 0,
  }));

  const poWithComputed = {
    ...purchaseOrder,
    lines: linesWithComputed,
  } as typeof purchaseOrder;

  const totals = (poWithComputed.lines || []).reduce(
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

  // Fetch related Product Movements (headers + lines) tied to this PO's lines
  let poMovements: Array<any> = [];
  if (lineIds.length) {
    poMovements = await prisma.productMovement.findMany({
      where: {
        purchaseOrderLineId: { in: lineIds },
      },
      select: {
        id: true,
        date: true,
        movementType: true,
        purchaseOrderLineId: true,
        quantity: true,
        notes: true,
        // locationId relation isn't used for PO receive; we enforce PO.locationId via locationInId scalar
        lines: {
          select: {
            id: true,
            quantity: true,
            purchaseOrderLineId: true,
            product: { select: { sku: true, name: true } },
            batch: {
              select: {
                id: true,
                codeMill: true,
                codeSartor: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
  }

  return json({
    purchaseOrder: poWithComputed,
    totals,
    productOptions,
    poMovements,
  });
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
  if (intent === "po.receive") {
    // Reuse the already-read form data; do not read request.formData() again
    const f = form;
    const poId = Number(f.get("poId"));
    if (!Number.isFinite(poId))
      return json({ error: "Invalid PO id" }, { status: 400 });
    const dateStr = String(f.get("date") || "");
    const date = dateStr ? new Date(dateStr) : new Date();
    // Derive PO location from DB to enforce it server-side
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      select: { id: true, locationId: true },
    });
    if (!po) return json({ error: "PO not found" }, { status: 404 });
    const enforcedLocationId = po.locationId ?? null;

    let payload: Array<{
      lineId: number;
      productId: number;
      total?: number; // ignored, we recompute from batches
      batches: Array<{
        name?: string | null;
        codeMill?: string | null;
        codeSartor?: string | null;
        qty: number;
      }>;
    }> = [];
    try {
      const s = String(f.get("payload") || "[]");
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) payload = parsed;
    } catch {}

    try {
      // Execute the receive as a transaction
      await prisma.$transaction(async (tx) => {
        for (const row of payload) {
          // Validate line belongs to PO and product matches
          const line = await tx.purchaseOrderLine.findUnique({
            where: { id: row.lineId },
            select: {
              id: true,
              purchaseOrderId: true,
              productId: true,
              quantityOrdered: true,
              qtyReceived: true,
            },
          });
          if (!line || line.purchaseOrderId !== poId)
            throw new Error("PO_RECEIVE: Invalid PO line");
          if (Number(line.productId) !== Number(row.productId))
            throw new Error("PO_RECEIVE: Product mismatch for PO line");

          const batches = Array.isArray(row.batches) ? row.batches : [];
          const sum = batches.reduce((t, b) => t + (Number(b.qty) || 0), 0);
          if (sum <= 0) continue; // nothing to do for this row

          const qtyOrdered = Number(line.quantityOrdered || 0);
          const alreadyReceived = Number(line.qtyReceived || 0);
          const remaining = Math.max(0, qtyOrdered - alreadyReceived);
          if (sum > remaining)
            throw new Error("PO_RECEIVE: Receive exceeds remaining quantity");

          // Create header per line
          const hdr = await tx.productMovement.create({
            data: {
              movementType: "PO (Receive)",
              date,
              productId: row.productId,
              purchaseOrderLineId: row.lineId,
              locationInId: enforcedLocationId ?? undefined,
              quantity: Math.abs(sum),
              notes: `PO ${poId} receive`,
            },
          });

          for (const b of batches) {
            const qty = Math.abs(Number(b.qty) || 0);
            if (qty <= 0) continue;
            const created = await tx.batch.create({
              data: {
                productId: row.productId,
                name: b.name || null,
                codeMill: b.codeMill || null,
                codeSartor: b.codeSartor || null,
                locationId: enforcedLocationId ?? undefined,
                receivedAt: date,
                quantity: qty, // seed fallback
              },
            });
            await tx.productMovementLine.create({
              data: {
                movementId: hdr.id,
                productMovementId: hdr.id,
                productId: row.productId,
                batchId: created.id,
                quantity: qty,
                notes: null,
                purchaseOrderLineId: row.lineId,
              },
            });
          }

          // Do not update line fields; received/shipped are derived from movements
        }
      });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.startsWith("PO_RECEIVE:")) {
        return json(
          { error: msg.replace(/^PO_RECEIVE:\s*/, "") },
          { status: 400 }
        );
      }
      throw e; // unexpected
    }

    try {
      await refreshProductStockSnapshot(false);
    } catch (e) {
      console.warn("MV refresh failed (po.receive)", e);
    }
    return redirect(`/purchase-orders/${poId}`);
  }
  return redirect(`/purchase-orders/${id}`);
}

export default function PurchaseOrderDetailRoute() {
  const { purchaseOrder, totals, productOptions, poMovements } =
    useLoaderData<typeof loader>();
  const { setCurrentId } = useRecordContext();
  const submit = useSubmit();

  // Register current id in RecordContext
  useEffect(() => {
    setCurrentId(purchaseOrder.id);
  }, [purchaseOrder.id, setCurrentId]);

  const form = useForm({ defaultValues: purchaseOrder });
  useInitGlobalFormContext(form as any, (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "po.update");
    fd.set("date", values.date || "");
    submit(fd, { method: "post" });
  });

  // Local state for adding a line
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

  const openPrint = () =>
    window.open(`/purchase-orders/${purchaseOrder.id}/print`, "_blank");
  const downloadPdf = () =>
    window.open(`/purchase-orders/${purchaseOrder.id}/pdf`, "_blank");

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
  const [receiveOpen, setReceiveOpen] = useState(false);

  // Prev/Next hotkeys now handled globally in RecordProvider

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
          <Button size="xs" onClick={() => setReceiveOpen(true)}>
            Receive…
          </Button>
          {/* Per-page prev/next removed (global header handles navigation) */}
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
                    render={({ field }) => (
                      <NumberInput
                        {...field}
                        hideControls
                        allowNegative={false}
                        min={0}
                        w="5rem"
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
                        hideControls
                        allowNegative={false}
                        min={0}
                        w="5rem"
                      />
                    )}
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
      {/* Related movements tied to this PO */}
      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Group justify="space-between" align="center">
            <Title order={5}>PO Receive Movements</Title>
          </Group>
        </Card.Section>
        <Table withColumnBorders withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Move ID</Table.Th>
              <Table.Th>PO Line</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Product</Table.Th>
              <Table.Th>Batch</Table.Th>
              <Table.Th>Qty</Table.Th>
              <Table.Th>Notes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(poMovements || []).flatMap((m: any) => {
              const dateStr = m.date
                ? new Date(m.date as any).toLocaleDateString()
                : "";
              if (!m.lines?.length) {
                return [
                  <Table.Tr key={`m-${m.id}`}>
                    <Table.Td>{dateStr}</Table.Td>
                    <Table.Td>{m.id}</Table.Td>
                    <Table.Td>{m.purchaseOrderLineId ?? ""}</Table.Td>
                    <Table.Td>{m.movementType}</Table.Td>
                    <Table.Td></Table.Td>
                    <Table.Td></Table.Td>
                    <Table.Td>{m.quantity ?? ""}</Table.Td>
                    <Table.Td>{m.notes ?? ""}</Table.Td>
                  </Table.Tr>,
                ];
              }
              return m.lines.map((ln: any) => (
                <Table.Tr key={`m-${m.id}-l-${ln.id}`}>
                  <Table.Td>{dateStr}</Table.Td>
                  <Table.Td>{m.id}</Table.Td>
                  <Table.Td>
                    {ln.purchaseOrderLineId ?? m.purchaseOrderLineId ?? ""}
                  </Table.Td>
                  <Table.Td>{m.movementType}</Table.Td>
                  <Table.Td>
                    {[ln.product?.sku, ln.product?.name]
                      .filter(Boolean)
                      .join(" · ")}
                  </Table.Td>
                  <Table.Td>
                    {ln.batch
                      ? [ln.batch.codeSartor, ln.batch.codeMill, ln.batch.name]
                          .filter(Boolean)
                          .join(" · ")
                      : ""}
                  </Table.Td>
                  <Table.Td>{ln.quantity ?? ""}</Table.Td>
                  <Table.Td>{m.notes ?? ""}</Table.Td>
                </Table.Tr>
              ));
            })}
            {(!poMovements || poMovements.length === 0) && (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <em>No related movements yet.</em>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>
      <POReceiveModal
        opened={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        poId={purchaseOrder.id}
        poLocationId={purchaseOrder.locationId ?? null}
        lines={(purchaseOrder.lines || []).map((l: any) => ({
          id: l.id,
          productId: l.productId,
          sku: l.product?.sku,
          name: l.product?.name,
          qtyOrdered: l.quantityOrdered,
          qtyReceived: l.qtyReceived,
        }))}
      />
    </Stack>
  );
}
