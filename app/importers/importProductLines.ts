import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, coerceFlag, resetSequence } from "./utils";

export async function importProductLines(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const primaryTargets: Array<{ productId: number; productLineId: number }> =
    [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (id == null) {
      skipped++;
      continue;
    }
    const isPrimary = coerceFlag(pick(r, ["Flag_isPrimaryProductLine"]));
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
        pick(r, ["a_ProductCode", "a_ProductCode|Child", "ChildProductId"])
      ) as number | null,
      quantity: asNum(pick(r, ["Quantity"])) as number | null,
      unitCost: asNum(pick(r, ["UnitCost"])) as number | null,
      unitCostManual: asNum(pick(r, ["UnitCost|Manual"])) as number | null,
      activityUsed: (pick(r, ["ActivityUsed"]) ?? "").toString().trim() || null,
      flagAssemblyOmit: coerceFlag(pick(r, ["Flag|AssemblyOmit"])),
    };
    try {
      await prisma.productLine.upsert({
        where: { id },
        create: data,
        update: data,
      });
      if (isPrimary && data.parentId) {
        primaryTargets.push({ productId: data.parentId, productLineId: id });
      }
      created++;
    } catch (e: any) {
      errors.push({ index: i, id, message: e?.message, code: e?.code });
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] product_lines progress ${i + 1}/${
          rows.length
        } created=${created} skipped=${skipped} errors=${errors.length}`
      );
    }
  }
  if (errors.length) {
    const grouped: Record<
      string,
      { key: string; count: number; ids: (number | null)[] }
    > = {};
    for (const e of errors) {
      const key = e.code || "error";
      if (!grouped[key]) grouped[key] = { key, count: 0, ids: [] };
      grouped[key].count++;
      grouped[key].ids.push(e.id ?? null);
    }
    console.log("[import] product_lines error summary", Object.values(grouped));
  }
  if (primaryTargets.length) {
    for (const t of primaryTargets) {
      await prisma.product.update({
        where: { id: t.productId },
        data: { primaryProductLineId: t.productLineId },
      });
    }
  }
  await resetSequence(prisma, "ProductLine");
  return { created, updated, skipped, errors };
}
