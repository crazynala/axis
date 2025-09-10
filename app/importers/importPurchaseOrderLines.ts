import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick } from "./utils";

export async function importPurchaseOrderLines(
  rows: any[]
): Promise<ImportResult> {
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
        message: "Missing a__Serial/id for purchase order line",
      });
      continue;
    }
    const data: any = {
      id: idNum,
      assemblyId: asNum(pick(r, ["a_AssemblyID"])) as number | null,
      jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
      purchaseOrderId: asNum(pick(r, ["a_PurchaseOrderID"])) as number | null,
      productId: asNum(
        pick(r, ["a__ProductCode", "a_ProductCode", "ProductCode"])
      ) as number | null,
      productSkuCopy: (pick(r, ["ProductSKU"]) ?? "").toString().trim() || null,
      productNameCopy:
        (pick(r, ["ProductName"]) ?? "").toString().trim() || null,
      priceCost: asNum(pick(r, ["Price|Cost"])) as number | null,
      priceSell: asNum(pick(r, ["Price|Sell"])) as number | null,
      qtyShipped: asNum(pick(r, ["QtyShipped"])) as number | null,
      qtyReceived: asNum(pick(r, ["QtyReceived"])) as number | null,
      quantity: asNum(pick(r, ["Quantity"])) as number | null,
      quantityOrdered: asNum(pick(r, ["QuantityOrdered"])) as number | null,
      taxCode: (pick(r, ["TaxCode"]) ?? "").toString().trim() || null,
      taxRate: asNum(pick(r, ["TaxRate"])) as number | null,
    };
    try {
      await prisma.purchaseOrderLine.upsert({
        where: { id: idNum },
        create: data,
        update: data,
      });
      created += 1;
    } catch (e: any) {
      const log = {
        index: i,
        id: idNum,
        purchaseOrderId: data.purchaseOrderId,
        productId: data.productId,
        jobId: data.jobId,
        assemblyId: data.assemblyId,
        taxCode: data.taxCode,
        code: e?.code,
        constraint: e?.meta?.field_name || e?.meta?.target || null,
        message: e?.message,
      };
      errors.push(log);
      // per-row error suppressed; consolidated summary will report
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
        grouped[key].samples.push(e.id ?? null);
    }
    console.log(
      "[import] purchase_order_lines error summary",
      Object.values(grouped)
    );
  }
  return { created, updated, skipped, errors };
}
