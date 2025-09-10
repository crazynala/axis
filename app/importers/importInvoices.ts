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
    let attempt = 0;
    let localData = { ...data };
    while (attempt < 2) {
      try {
        if (idNum != null) {
          await prisma.invoice.upsert({
            where: { id: idNum },
            create: { id: idNum, ...localData },
            update: localData,
          });
        } else {
          await prisma.invoice.create({ data: localData });
        }
        created += 1;
        break;
      } catch (e: any) {
        if (
          e?.code === "P2002" &&
          Array.isArray(e?.meta?.target) &&
          e.meta.target.includes("invoiceCode") &&
          attempt === 0
        ) {
          // Deduplicate invoiceCode by appending -dup or -dupN
          const base = (localData.invoiceCode || "").toString();
          if (base) {
            let n = 1;
            let candidate = base + "-dup";
            while (
              await prisma.invoice.findFirst({
                where: { invoiceCode: candidate },
              })
            ) {
              n += 1;
              candidate = base + `-dup${n}`;
              if (n > 50) break; // safety
            }
            localData = { ...localData, invoiceCode: candidate };
            attempt++;
            continue; // retry once with new code
          }
        }
        const log = {
          index: i,
          id: idNum,
          companyId,
          invoiceCode: localData.invoiceCode,
          code: e?.code,
          constraint: e?.meta?.field_name || e?.meta?.target || null,
          message: e?.message,
        };
        errors.push(log);
        break; // don't loop further
      }
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] invoices progress ${i + 1}/${
          rows.length
        } created=${created} skipped=${skipped} errors=${errors.length}`
      );
    }
  }
  console.log(
    `[import] invoices complete total=${rows.length} created=${created} skipped=${skipped} errors=${errors.length}`
  );
  if (errors.length) {
    const grouped: Record<
      string,
      { key: string; count: number; ids: (number | null)[] }
    > = {};
    for (const e of errors) {
      const key = e.constraint || e.code || "error";
      if (!grouped[key]) grouped[key] = { key, count: 0, ids: [] };
      grouped[key].count++;
      grouped[key].ids.push(e.id ?? null);
    }
    console.log("[import] invoices error summary", Object.values(grouped));
  }
  return { created, updated, skipped, errors };
}
