import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, coerceFlag, resetSequence } from "./utils";

export async function importCostings(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const toCreate: any[] = [];
  const primaryTargets: Array<{ assemblyId: number; costingId: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (id == null) {
      skipped++;
      continue;
    }

    const isPrimary = coerceFlag(
      pick(r, ["Flag_isPrimaryCosting", "Flag_isPrimary"])
    );
    const data: any = {
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
      flagAssembly: coerceFlag(pick(r, ["Flag_Assembly"])),
      flagDefinedInProduct: coerceFlag(pick(r, ["Flag_DefinedInProduct"])),
      flagIsBillableManual: coerceFlag(pick(r, ["Flag_IsBillable|Manual"])),
      flagIsInvoiceableManual: coerceFlag(
        pick(r, ["Flag_IsInvoiceable|Manual"])
      ),
      flagIsDisabled: coerceFlag(pick(r, ["is_Disabled"])),
      flagStockTracked: coerceFlag(pick(r, ["Flag_StockTracked"])),
    };

      try {
        const existing = await prisma.costing.findUnique({ where: { id } });
        if (existing) {
          await prisma.costing.update({ where: { id }, data });
          if (isPrimary && data.assemblyId) {
            await prisma.assembly.update({
              where: { id: data.assemblyId },
              data: { primaryCostingId: id },
            });
          }
          updated++;
        } else {
          toCreate.push({ id, ...data });
          if (isPrimary && data.assemblyId) {
            primaryTargets.push({
              assemblyId: data.assemblyId,
              costingId: id,
            });
          }
        }
      } catch (e: any) {
        errors.push({ index: i, id, message: e?.message, code: e?.code });
      }

    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] costings progress ${i + 1}/${rows.length} staged=${
          toCreate.length
        } updated=${updated} skipped=${skipped} errors=${errors.length}`
      );
    }
  }

  if (toCreate.length) {
    try {
      const res = await prisma.costing.createMany({
        data: toCreate as any[],
        skipDuplicates: true,
      });
      created += res.count;
      if (primaryTargets.length) {
        for (const t of primaryTargets) {
          await prisma.assembly.update({
            where: { id: t.assemblyId },
            data: { primaryCostingId: t.costingId },
          });
        }
      }
    } catch (e: any) {
      errors.push({
        index: -1,
        id: null,
        message: e?.message,
        code: e?.code,
        note: `createMany failed for ${toCreate.length} records`,
      });
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

  await resetSequence(prisma, "Costing");
  return { created, updated, skipped, errors };
}
