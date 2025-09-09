import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick } from "./utils";

export async function importInvoiceLines(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (idNum == null) {
      skipped++;
      errors.push({
        index: i,
        message: "Missing a__Serial/id for invoice line",
      });
      continue;
    }
    const data: any = {
      id: idNum,
      costingId: asNum(pick(r, ["a_CostingID"])) as number | null,
      expenseId: asNum(pick(r, ["a_ExpenseID"])) as number | null,
      invoiceId: asNum(pick(r, ["a_InvoiceID"])) as number | null,
      jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
      productId: asNum(
        pick(r, ["a__ProductCode", "a_ProductCode", "ProductCode"])
      ) as number | null,
      purchaseOrderLineId: asNum(pick(r, ["a_PurchaseOrderLineID"])) as
        | number
        | null,
      shippingIdActual: asNum(pick(r, ["a_ShippingID|Actual"])) as
        | number
        | null,
      shippingIdDuty: asNum(pick(r, ["a_ShippingID|Duty"])) as number | null,
      category: (pick(r, ["Category"]) ?? "").toString().trim() || null,
      details: (pick(r, ["Details"]) ?? "").toString().trim() || null,
      subCategory: (pick(r, ["SubCategory"]) ?? "").toString().trim() || null,
      priceCost: asNum(pick(r, ["Price|Cost", "PriceCost"])) as number | null,
      priceSell: asNum(pick(r, ["Price|Sell", "PriceSell"])) as number | null,
      quantity: asNum(pick(r, ["Quantity"])) as number | null,
      taxCodeId: asNum(pick(r, ["TaxCode|Cost", "a_TaxCodeID"])) as
        | number
        | null,
      taxRateCopy: asNum(pick(r, ["TaxRate|Cost", "TaxRateCost"])) as
        | number
        | null,
      invoicedTotalManual: asNum(pick(r, ["InvoicedTotalManual"])) as
        | number
        | null,
    };
    try {
      await prisma.invoiceLine.upsert({
        where: { id: idNum },
        create: data,
        update: data,
      });
      created += 1;
    } catch (e: any) {
      const log = {
        index: i,
        id: idNum,
        invoiceId: data.invoiceId,
        jobId: data.jobId,
        productId: data.productId,
        purchaseOrderLineId: data.purchaseOrderLineId,
        taxCodeId: data.taxCodeId,
        code: e?.code,
        constraint: e?.meta?.field_name || e?.meta?.target || null,
        message: e?.message,
      };
      errors.push(log);
      console.error("[import] invoice_lines upsert error", log);
    }
  }
  return { created, updated, skipped, errors };
}
