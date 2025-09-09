import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";

export async function importBatches(rows: any[]): Promise<ImportResult> {
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
      productId: asNum(
        pick(r, ["a__ProductCode", "a_ProductCode", "ProductCode"])
      ) as number | null,
      locationId: asNum(pick(r, ["a_LocationID"])) as number | null,
      jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
      assemblyId: asNum(pick(r, ["a_AssemblyID"])) as number | null,
      codeMill: (pick(r, ["Code|Mill"]) ?? "").toString().trim() || null,
      codeSartor: (pick(r, ["Code|Sartor"]) ?? "").toString().trim() || null,
      name: (pick(r, ["Name"]) ?? "").toString().trim() || null,
      source: (pick(r, ["Source"]) ?? "").toString().trim() || null,
      quantity: asNum(pick(r, ["Quantity"])) as number | null,
      receivedAt: asDate(
        pick(r, ["Date|Received", "ReceivedAt"])
      ) as Date | null,
      notes: (pick(r, ["Notes"]) ?? "").toString().trim() || null,
    };
    try {
      await prisma.batch.upsert({ where: { id }, create: data, update: data });
      created++;
    } catch (e: any) {
      errors.push({ index: i, id, message: e?.message, code: e?.code });
    }
  }
  return { created, updated, skipped, errors };
}
