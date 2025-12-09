import { prisma } from "~/utils/prisma.server";
import type {
  PendingCostingItem,
  PendingExpenseItem,
  PendingPOLineItem,
  PendingShipmentItem,
} from "./types";
import { computeInvoiceLineTotal } from "./util";

export type InvoiceLineInput = {
  sourceType:
    | "costing"
    | "shippingFreight"
    | "shippingDuty"
    | "po"
    | "expense";
  sourceId: number;
  quantity?: string;
  unitPrice?: string;
  manualTotal?: string;
  category?: string;
  description?: string;
};

export async function createInvoiceLines(
  invoiceId: number,
  items: InvoiceLineInput[]
) {
  for (const item of items) {
    switch (item.sourceType) {
      case "costing": {
        await createFromCosting(invoiceId, item);
        break;
      }
      case "shippingFreight": {
        const total = Number(item.manualTotal ?? 0) || 0;
        await prisma.invoiceLine.create({
          data: {
            invoiceId,
            shippingIdActual: item.sourceId,
            invoicedTotalManual: total,
            category: item.category || "Shipping",
          } as any,
        });
        break;
      }
      case "shippingDuty": {
        const total = Number(item.manualTotal ?? 0) || 0;
        await prisma.invoiceLine.create({
          data: {
            invoiceId,
            shippingIdDuty: item.sourceId,
            invoicedTotalManual: total,
            category: item.category || "Duty",
          } as any,
        });
        break;
      }
      case "po": {
        const unitPrice = Number(item.unitPrice ?? 0) || 0;
        const amount = Number(item.manualTotal ?? 0) || 0;
        const quantity = unitPrice ? amount / unitPrice : 0;
        await prisma.invoiceLine.create({
          data: {
            invoiceId,
            purchaseOrderLineId: item.sourceId,
            quantity,
            priceSell: unitPrice,
            invoicedPrice: unitPrice,
            category: item.category || "Materials",
          } as any,
        });
        break;
      }
      case "expense": {
        const amount = Number(item.manualTotal ?? 0) || 0;
        // Use existing expense quantities/prices where possible
        const expense = await prisma.expense.findUnique({
          where: { id: item.sourceId },
          select: { quantity: true, priceSell: true },
        });
        let quantity = Number(expense?.quantity ?? 0) || 0;
        let priceSell = Number(expense?.priceSell ?? 0) || 0;
        if (quantity && priceSell && quantity * priceSell !== amount) {
          priceSell = quantity ? amount / quantity : priceSell;
        } else if (!quantity && priceSell) {
          quantity = priceSell ? amount / priceSell : 0;
        } else if (!priceSell && quantity) {
          priceSell = quantity ? amount / quantity : 0;
        }
        await prisma.invoiceLine.create({
          data: {
            invoiceId,
            expenseId: item.sourceId,
            quantity,
            priceSell,
            invoicedPrice: priceSell,
            category: item.category || "Expense",
          } as any,
        });
        break;
      }
      default:
        break;
    }
  }
}

async function createFromCosting(
  invoiceId: number,
  item: InvoiceLineInput
): Promise<void> {
  const costing = await prisma.costing.findUnique({
    where: { id: item.sourceId },
    include: { assembly: { select: { jobId: true, id: true } } },
  });
  if (!costing) return;
  const quantity = Number(item.quantity ?? 0) || 0;
  const priceSell = item.unitPrice != null ? Number(item.unitPrice) || 0 : 0;
  await prisma.invoiceLine.create({
    data: {
      invoiceId,
      costingId: costing.id,
      jobId: costing.assembly?.jobId ?? null,
      assemblyId: costing.assembly?.id ?? null,
      quantity,
      priceSell,
      invoicedPrice: priceSell,
      category: item.category || "Production",
    } as any,
  });
}

export type {
  PendingCostingItem,
  PendingShipmentItem,
  PendingPOLineItem,
  PendingExpenseItem,
};
