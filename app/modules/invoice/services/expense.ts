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
      job: { companyId: customerId },
    },
    include: { job: { select: { projectCode: true } } },
  });
  const results: PendingExpenseItem[] = [];
  for (const expense of expenses) {
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
