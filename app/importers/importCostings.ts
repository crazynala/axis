import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick } from "./utils";

export async function importCostings(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (id == null) {
      skipped++;
      continue;
    }
    const data: any = {
      id,
      assemblyId: asNum(pick(r, ["a_AssemblyID"])) as number | null,
      productId: asNum(
        pick(r, ["a__ProductCode", "a_ProductCode", "ComponentId", "ProductId"])
      ) as number | null,
      quantityPerUnit: asNum(pick(r, ["Qty_PerUnit", "QuantityPerUnit"])) as
        | number
        | null,
      unitCost: asNum(pick(r, ["UnitCost"])) as number | null,
      notes: (pick(r, ["Notes"]) ?? "").toString().trim() || null,
      activityUsed: (pick(r, ["ActivityUsed"]) ?? "").toString().trim() || null,
      salePricePerItem: asNum(pick(r, ["SalePricePerItem"])) as number | null,
      salePricePerUnit: asNum(pick(r, ["SalePricePerUnit"])) as number | null,
      flagAssembly: Boolean(pick(r, ["Flag|Assembly"])) || null,
      flagDefinedInProduct: Boolean(pick(r, ["Flag|DefinedInProduct"])) || null,
      flagIsBillableDefaultOrManual:
        Boolean(pick(r, ["Flag|BillableDefaultOrManual"])) || null,
      flagIsBillableManual: Boolean(pick(r, ["Flag|BillableManual"])) || null,
      flagIsInvoiceableManual:
        Boolean(pick(r, ["Flag|InvoiceableManual"])) || null,
      flagStockTracked: Boolean(pick(r, ["Flag|StockTracked"])) || null,
    };
    try {
      await prisma.costing.upsert({
        where: { id },
        create: data,
        update: data,
      });
      created++;
    } catch (e: any) {
      errors.push({ index: i, id, message: e?.message, code: e?.code });
    }
  }
  return { created, updated, skipped, errors };
}
