import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { prisma } from "../../../utils/prisma.server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { PurchaseOrderPdf } from "../../../base/pdf/PurchaseOrderPdf";

export async function loader({ params }: LoaderFunctionArgs) {
  const idNum = Number(params.id);
  if (!Number.isFinite(idNum))
    throw new Response("Invalid id", { status: 400 });

  const purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: { id: idNum },
    include: {
      lines: { include: { product: true } },
      company: { include: { defaultAddress: true } },
      consignee: true,
      location: true,
    },
  });
  if (!purchaseOrder) return redirect("/purchase-orders");

  const subtotal = (purchaseOrder.lines || []).reduce((acc: number, l: any) => {
    const qty = Number(l.quantityOrdered ?? l.quantity ?? 0);
    const unit = Number(l.priceCost ?? 0);
    return acc + qty * unit;
  }, 0);

  const buffer = await renderToBuffer(
    <PurchaseOrderPdf po={purchaseOrder as any} subtotal={subtotal} />
  );

  // Convert Node Buffer to exact ArrayBuffer slice
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  return new Response(ab as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="PO-${idNum}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
