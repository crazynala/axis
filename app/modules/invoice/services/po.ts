import { prisma } from "~/utils/prisma.server";
import { computeInvoiceLineTotal } from "./util";

export type PendingPOLineItem = {
  sourceType: "po";
  purchaseOrderLineId: number;
  amountPendingUSD: string;
  unitPrice: string;
};

function roundCurrency(value: number) {
  // Clamp tiny floating point residue and standardize to cents
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getPOLinesPendingInvoicing(
  invoiceId: number | null | undefined
): Promise<PendingPOLineItem[]> {
  if (!invoiceId) return [];
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { companyId: true },
  });
  if (!invoice?.companyId) return [];
  const lines = await prisma.purchaseOrderLine.findMany({
    where: {
      purchaseOrder: { consigneeCompanyId: invoice.companyId },
    },
    select: {
      id: true,
      purchaseOrderId: true,
      quantityOrdered: true,
      qtyReceived: true,
      priceSell: true,
      taxRate: true,
      product: { select: { name: true } },
      productNameCopy: true,
    },
  });
  const results: PendingPOLineItem[] = [];
  for (const line of lines) {
    const orderedAmount =
      (Number(line.quantityOrdered ?? 0) || 0) *
      (Number(line.priceSell ?? 0) || 0);
    const receivedAmount =
      (Number(line.qtyReceived ?? 0) || 0) * (Number(line.priceSell ?? 0) || 0);
    // Quantity-based invoiceability
    const orderedQty = Number(line.quantityOrdered ?? 0) || 0;
    const receivedQty = Number(line.qtyReceived ?? 0) || 0;
    const targetQty = receivedQty || orderedQty; // prefer received qty; fall back to ordered if none
    const invoiced = await prisma.invoiceLine.findMany({
      where: { purchaseOrderLineId: line.id },
      select: {
        id: true,
        quantity: true,
        priceSell: true,
        invoicedPrice: true,
        invoicedTotalManual: true,
        category: true,
        subCategory: true,
      },
    });
    const alreadyInvoicedQty = invoiced.reduce(
      (sum, l) => sum + (Number(l.quantity ?? 0) || 0),
      0
    );
    const pendingQty = Math.max(0, targetQty - alreadyInvoicedQty);
    const pendingAmount = pendingQty * (Number(line.priceSell ?? 0) || 0);
    const pendingAmountRounded = roundCurrency(pendingAmount);
    const unitPriceRounded = roundCurrency(Number(line.priceSell ?? 0) || 0);
    if (pendingAmount > 0) {
      results.push({
        sourceType: "po",
        purchaseOrderLineId: line.id,
        purchaseOrderId: line.purchaseOrderId ?? null,
        productName: line.product?.name ?? line.productNameCopy ?? null,
        quantityOrdered: (Number(line.quantityOrdered ?? 0) || 0).toString(),
        quantityReceived: (Number(line.qtyReceived ?? 0) || 0).toString(),
        amountPendingUSD: pendingAmountRounded.toString(),
        unitPrice: unitPriceRounded.toString(),
        calcDebug: {
          orderedQuantity: orderedQty,
          receivedQuantity: receivedQty,
          targetQuantity: targetQty,
          invoicedQuantity: alreadyInvoicedQty,
          pendingQuantity: pendingQty,
          unitPrice: unitPriceRounded,
          pendingAmount: pendingAmountRounded,
          invoiceLines: invoiced.map((l) => ({
            id: l.id,
            quantity: l.quantity,
            priceSell: l.priceSell,
            invoicedPrice: l.invoicedPrice,
            invoicedTotalManual: l.invoicedTotalManual,
            category: l.category,
            subCategory: l.subCategory,
            computedTotal: roundCurrency(computeInvoiceLineTotal(l)),
          })),
        },
      });
    }
  }
  return results;
}
