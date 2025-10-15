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
      quantityPerUnit: asNum(pick(r, ["Qty_PerUnit", "QtyRequiredPerUnit"])) as
        | number
        | null,
      unitCost: asNum(pick(r, ["UnitCost"])) as number | null,
      notes: (pick(r, ["Notes"]) ?? "").toString().trim() || null,
      activityUsed: (pick(r, ["ActivityUsed"]) ?? "").toString().trim() || null,
      salePricePerItem: asNum(pick(r, ["Price|Sale_PerItem"])) as number | null,
      costPricePerItem: asNum(pick(r, ["Price|CostWithVAT_PerItem"])) as
        | number
        | null,
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
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] costings progress ${i + 1}/${
          rows.length
        } created=${created} updated=${updated} skipped=${skipped} errors=${
          errors.length
        }`
      );
    }
  }
  console.log(
    `[import] costings complete total=${rows.length} created=${created} updated=${updated} skipped=${skipped} errors=${errors.length}`
  );
  if (errors.length) {
    const grouped: Record<
      string,
      { key: string; count: number; samples: (number | null)[] }
    > = {};
    for (const e of errors) {
      const key = e.code || "error";
      if (!grouped[key]) grouped[key] = { key, count: 0, samples: [] };
      grouped[key].count++;
      if (grouped[key].samples.length < 5)
        grouped[key].samples.push(e.id ?? null);
    }
    console.log("[import] costings error summary", Object.values(grouped));
  }
  return { created, updated, skipped, errors };
}
