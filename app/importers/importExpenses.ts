import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";

export async function importExpenses(rows: any[]): Promise<ImportResult> {
  let created = 0, updated = 0, skipped = 0; const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = asNum(pick(r, ["a__Serial","id"])) as number | null;
    if (id == null) { skipped++; continue; }
    const data: any = {
      id,
      jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
      productId: asNum(pick(r, ["a__ProductCode","a_ProductCode","ProductCode"])) as number | null,
      purchaseOrderId: asNum(pick(r, ["a_PurchaseOrderID"])) as number | null,
      shippingId: asNum(pick(r, ["a_ShippingID"])) as number | null,
      category: (pick(r, ["Category"]) ?? "").toString().trim() || null,
      date: asDate(pick(r, ["Date"])) as Date | null,
      details: (pick(r, ["Details"]) ?? "").toString().trim() || null,
      memo: (pick(r, ["Memo"]) ?? "").toString().trim() || null,
      priceCost: asNum(pick(r, ["Price|Cost"])) as number | null,
      priceSell: asNum(pick(r, ["Price|Sell"])) as number | null,
      quantity: asNum(pick(r, ["Quantity"])) as number | null,
      source: (pick(r, ["Source"]) ?? "").toString().trim() || null,
      subcategory: (pick(r, ["SubCategory","Subcategory"]) ?? "").toString().trim() || null,
    };
    try { await prisma.expense.upsert({ where: { id }, create: data, update: data }); created++; }
    catch (e:any) { errors.push({ index:i, id, message:e?.message, code:e?.code }); }
  }
  return { created, updated, skipped, errors };
}
