import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick, resetSequence } from "./utils";

const normalizeType = (raw: unknown): "INVOICE" | "CREDIT_MEMO" | null => {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  if (v.includes("credit")) return "CREDIT_MEMO";
  if (v.includes("invoice")) return "INVOICE";
  if (v === "cm" || v === "creditmemo" || v === "credit memo")
    return "CREDIT_MEMO";
  return null;
};

export async function importSupplierInvoices(
  rows: any[]
): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const legacySerial = asNum(pick(r, ["a__Serial"])) as number | null;
    const companyId = asNum(pick(r, ["a_CompanyID"])) as number | null;
    const purchaseOrderId = asNum(pick(r, ["a_PurchaseOrderID"])) as
      | number
      | null;
    const invoiceDate = asDate(pick(r, ["Date"])) as Date | null;
    const supplierInvoiceNo =
      (pick(r, ["SupplierInvoiceNo"]) ?? "").toString().trim() || null;
    const type = normalizeType(pick(r, ["Type"]));
    const totalExTaxRaw = asNum(pick(r, ["TotalExTax"])) as number | null;
    const totalExTax =
      totalExTaxRaw == null ? null : Math.abs(Number(totalExTaxRaw) || 0);
    const taxCode = (pick(r, ["c_TaxCode"]) ?? "").toString().trim() || null;
    const createdBy =
      (pick(r, ["Record_CreatedBy"]) ?? "").toString().trim() || null;
    const createdAt = asDate(
      pick(r, ["Record_CreatedTimestamp"])
    ) as Date | null;
    const modifiedBy =
      (pick(r, ["Record_ModifiedBy"]) ?? "").toString().trim() || null;
    const updatedAt = asDate(
      pick(r, ["Record_ModifiedTimestamp"])
    ) as Date | null;

    const data: any = {
      companyId,
      purchaseOrderId,
      invoiceDate,
      supplierInvoiceNo,
      type,
      totalExTax,
      taxCode,
      legacySerial,
      createdBy,
      modifiedBy,
    };
    if (createdAt) data.createdAt = createdAt;
    if (updatedAt) data.updatedAt = updatedAt;
    try {
      if (legacySerial != null) {
        await prisma.supplierInvoice.upsert({
          where: { legacySerial },
          create: data,
          update: data,
        });
        updated += 1;
      } else {
        await prisma.supplierInvoice.create({ data });
        created += 1;
      }
    } catch (e: any) {
      const log = {
        index: i,
        legacySerial,
        companyId,
        purchaseOrderId,
        code: e?.code,
        constraint: e?.meta?.field_name || e?.meta?.target || null,
        message: e?.message,
      };
      errors.push(log);
    }
  }
  if (errors.length) {
    const grouped: Record<
      string,
      { key: string; count: number; samples: (number | null)[] }
    > = {};
    for (const e of errors) {
      const key = e.constraint || e.code || "error";
      if (!grouped[key]) grouped[key] = { key, count: 0, samples: [] };
      grouped[key].count++;
      if (grouped[key].samples.length < 5)
        grouped[key].samples.push(e.legacySerial ?? null);
    }
    console.log(
      "[import] supplier_invoices error summary",
      Object.values(grouped)
    );
  }
  await resetSequence(prisma, "SupplierInvoice");
  return { created, updated, skipped, errors };
}
