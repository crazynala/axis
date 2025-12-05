import { prisma } from "~/utils/prisma.server";
import { computeInvoiceLineTotal } from "./util";

export type PendingPOLineItem = {
  sourceType: "po";
  purchaseOrderLineId: number;
  amountPendingUSD: string;
  unitPrice: string;
};

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
      purchaseOrder: { companyId: invoice.companyId },
    },
  });
  const results: PendingPOLineItem[] = [];
  for (const line of lines) {
    const orderedAmount =
      (Number(line.quantityOrdered ?? 0) || 0) *
      (Number(line.priceSell ?? 0) || 0);
    const receivedAmount =
      (Number(line.qtyReceived ?? 0) || 0) * (Number(line.priceSell ?? 0) || 0);
    const depositPercent = Number(line.taxRate ?? 0) || 0; // placeholder for legacy depositPercent
    const targetAmount = Math.max(
      receivedAmount,
      (depositPercent / 100) * orderedAmount
    );
    const invoiced = await prisma.invoiceLine.findMany({
      where: { purchaseOrderLineId: line.id },
    });
    const alreadyInvoicedAmount = invoiced.reduce(
      (sum, l) => sum + computeInvoiceLineTotal(l),
      0
    );
    const pendingAmount = Math.max(0, targetAmount - alreadyInvoicedAmount);
    if (pendingAmount > 0) {
      results.push({
        sourceType: "po",
        purchaseOrderLineId: line.id,
        amountPendingUSD: pendingAmount.toString(),
        unitPrice: (line.priceSell ?? 0).toString(),
      });
    }
  }
  return results;
}
