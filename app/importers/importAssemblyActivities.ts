import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick, parseIntListPreserveGaps } from "./utils";

export async function importAssemblyActivities(
  rows: any[]
): Promise<ImportResult> {
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
    const qtyBreakdown = parseIntListPreserveGaps(
      pick(r, [
        "QtyBreakdown_List_c",
        "Qty_Breakdown_List_c",
        "QtyBreakdownList",
      ])
    );
    const qtySum = qtyBreakdown.reduce(
      (t: number, n: number) => (Number.isFinite(n) ? t + (n | 0) : t),
      0
    );
    const data: any = {
      id,
      assemblyId: asNum(pick(r, ["a_AssemblyID"])) as number | null,
      jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
      name: (pick(r, ["Name"]) ?? "").toString().trim() || null,
      description: (pick(r, ["Description"]) ?? "").toString().trim() || null,
      activityType:
        (pick(r, ["AssemblyActivityType", "ActivityType"]) ?? "")
          .toString()
          .trim() || null,
      activityDate: asDate(
        pick(r, ["ActivityDate", "Date", "Activity Date"])
      ) as Date | null,
      notes: (pick(r, ["Notes"]) ?? "").toString().trim() || null,
      productId: asNum(
        pick(r, ["a__ProductCode", "a_ProductCode", "ProductCode"])
      ) as number | null,
      locationInId: asNum(pick(r, ["a_LocationID_In", "a_LocationID|In"])) as
        | number
        | null,
      locationOutId: asNum(
        pick(r, ["a_LocationID_Out", "a_LocationID|Out"])
      ) as number | null,
      qtyBreakdown: qtyBreakdown as any,
      quantity:
        qtySum > 0
          ? (qtySum as any)
          : (asNum(pick(r, ["Quantity"])) as number | null as any),
      qtyFabricConsumed: asNum(pick(r, ["Qty_FabricConsumed"])) as
        | number
        | null,
      qtyFabricConsumedPerUnit: asNum(
        pick(r, ["Qty_FabricConsumedPerUnit"])
      ) as number | null,
    };
    try {
      await prisma.assemblyActivity.upsert({
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
