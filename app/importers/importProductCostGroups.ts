import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, fixMojibake, resetSequence } from "./utils";

export async function importProductCostGroups(
  rows: any[]
): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const toCreate: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = asNum(
      pick(r, ["a__Serial", "a_Serial", "id", "group_id", "GroupID"])
    ) as number | null;
    if (id == null) {
      skipped++;
      continue;
    }
    const name = fixMojibake(
      (pick(r, ["name", "group_name", "GroupName"]) ?? "").toString().trim()
    );
    const supplierId = asNum(
      pick(r, ["supplierId", "a_CompanyID|Supplier", "SupplierID"])
    ) as number | null;
    const currency = ((pick(r, ["currency"]) ?? "").toString().trim() ||
      null) as string | null;
    const costPrice = asNum(pick(r, ["costPrice", "cost", "Cost"])) as
      | number
      | null;
    const sellPriceManual = asNum(
      pick(r, ["sellPriceManual", "sell", "Sell"]) as any
    ) as number | null;

    try {
      const existing = await prisma.productCostGroup.findUnique({
        where: { id },
      });
      const data: any = { name, currency, costPrice, sellPriceManual };
      if (supplierId != null) data.supplierId = supplierId;
      if (existing) {
        await prisma.productCostGroup.update({ where: { id }, data });
        updated++;
      } else {
        toCreate.push({ id, ...data });
      }
    } catch (e: any) {
      console.error("[import] cost_groups ERROR", {
        index: i,
        id,
        code: e?.code,
        message: e?.message,
        meta: e?.meta,
      });
      errors.push({ index: i, id, message: e?.message, code: e?.code });
    }
  }
  if (toCreate.length) {
    try {
      const res = await prisma.productCostGroup.createMany({
        data: toCreate as any[],
        skipDuplicates: true,
      });
      created += res.count;
    } catch (e: any) {
      errors.push({
        index: -1,
        id: null,
        message: e?.message,
        code: e?.code,
        note: `createMany failed for ${toCreate.length} cost groups`,
      });
    }
  }
  await resetSequence(prisma, "ProductCostGroup");
  return { created, updated, skipped, errors } as ImportResult;
}
