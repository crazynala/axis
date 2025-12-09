import { prisma } from "~/utils/prisma.server";
import { computeInvoiceLineTotal } from "./util";

export type PendingExpenseItem = {
  sourceType: "expense";
  expenseId: number;
  amountPendingUSD: string;
  jobProjectCode?: string | null;
};

export async function getExpensesPendingInvoicing(
  customerId: number | null | undefined
): Promise<PendingExpenseItem[]> {
  if (!customerId) return [];
  const expenses = await prisma.expense.findMany({
    where: {
      OR: [
        { job: { companyId: customerId } },
        { shipment: { companyIdReceiver: customerId } },
        // Expenses without a job/shipment but linked to a PO are checked below via PO consignee
        { purchaseOrderId: { not: null } },
      ],
    },
    include: {
      job: { select: { projectCode: true, companyId: true } },
      shipment: { select: { companyIdReceiver: true } },
    },
  });
  const purchaseOrderIds = Array.from(
    new Set(
      expenses
        .map((e) => e.purchaseOrderId)
        .filter((id): id is number => Number.isFinite(id as any))
    )
  );
  const purchaseOrders = purchaseOrderIds.length
    ? await prisma.purchaseOrder.findMany({
        where: { id: { in: purchaseOrderIds } },
        select: { id: true, companyId: true, consigneeCompanyId: true },
      })
    : [];
  const poById = new Map<number, { companyId: number | null; consigneeCompanyId: number | null }>();
  purchaseOrders.forEach((po) =>
    poById.set(po.id, {
      companyId: po.companyId ?? null,
      consigneeCompanyId: po.consigneeCompanyId ?? null,
    })
  );
  const results: PendingExpenseItem[] = [];
  for (const expense of expenses) {
    const matchesCustomer =
      expense.job?.companyId === customerId ||
      expense.shipment?.companyIdReceiver === customerId ||
      (expense.purchaseOrderId != null &&
        (() => {
          const po = poById.get(expense.purchaseOrderId!);
          if (!po) return false;
          return (
            po.consigneeCompanyId === customerId || po.companyId === customerId
          );
        })());
    if (!matchesCustomer) continue;
    const totalAmount =
      (Number(expense.priceSell ?? 0) || 0) *
      (Number(expense.quantity ?? 0) || 0);
    if (!totalAmount) continue;
    const invoiced = await prisma.invoiceLine.findMany({
      where: { expenseId: expense.id },
    });
    const alreadyInvoiced = invoiced.reduce(
      (sum, l) => sum + computeInvoiceLineTotal(l),
      0
    );
    const pendingAmount = totalAmount - alreadyInvoiced;
    if (pendingAmount > 0) {
      results.push({
        sourceType: "expense",
        expenseId: expense.id,
        amountPendingUSD: pendingAmount.toString(),
        jobProjectCode: expense.job?.projectCode ?? null,
      });
    }
  }
  return results;
}
