import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";

export async function importInvoices(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    const companyId = asNum(pick(r, ["a_CompanyID"])) as number | null;
    const invoiceCode = (pick(r, ["Code", "InvoiceNo", "InvoiceCode"]) ?? "")
      .toString()
      .trim();
    const date = asDate(pick(r, ["Date"])) as Date | null;
    const productSkuCopy =
      (pick(r, ["ProductSKU"]) ?? "").toString().trim() || null;
    const productNameCopy =
      (pick(r, ["ProductName"]) ?? "").toString().trim() || null;
    const priceCost = asNum(pick(r, ["Price|Cost", "PriceCost"])) as
      | number
      | null;
    const priceSell = asNum(pick(r, ["Price|Sell", "PriceSell"])) as
      | number
      | null;
    const taxCodeId = asNum(pick(r, ["TaxCode"])) as number | null;
    const taxRateCopy = asNum(pick(r, ["TaxRate"])) as number | null;
    const data: any = {
      companyId,
      invoiceCode: invoiceCode || null,
      date,
      productSkuCopy,
      productNameCopy,
      priceCost,
      priceSell,
      taxCodeId,
      taxRateCopy,
    };
    try {
      if (idNum != null) {
        await prisma.invoice.upsert({
          where: { id: idNum },
          create: { id: idNum, ...data },
          update: data,
        });
      } else {
        await prisma.invoice.create({ data });
      }
      created += 1;
    } catch (e: any) {
      const log = {
        index: i,
        id: idNum,
        companyId,
        invoiceCode,
        code: e?.code,
        constraint: e?.meta?.field_name || e?.meta?.target || null,
        message: e?.message,
      };
      errors.push(log);
      console.error("[import] invoices upsert error", log);
    }
  }
  return { created, updated, skipped, errors };
}
