import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick } from "./utils";

export async function importProductLines(rows: any[]): Promise<ImportResult> {
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
      parentId: asNum(
        pick(r, [
          "a__ProductCode|Parent",
          "a_ProductCode|Parent",
          "ParentProductId",
        ])
      ) as number | null,
      childId: asNum(
        pick(r, [
          "a__ProductCode|Child",
          "a_ProductCode|Child",
          "ChildProductId",
        ])
      ) as number | null,
      quantity: asNum(pick(r, ["Quantity"])) as number | null,
      unitCost: asNum(pick(r, ["UnitCost"])) as number | null,
      unitCostManual: asNum(pick(r, ["UnitCost|Manual"])) as number | null,
      activityUsed: (pick(r, ["ActivityUsed"]) ?? "").toString().trim() || null,
      flagAssemblyOmit: Boolean(pick(r, ["Flag|AssemblyOmit"])) || null,
    };
    try {
      await prisma.productLine.upsert({
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
