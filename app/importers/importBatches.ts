import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";

// Enhanced: progress + richer error meta

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
      const log = {
        index: i,
        id,
        code: e?.code,
        constraint: e?.meta?.field_name || e?.meta?.target || null,
        message: e?.message,
      };
      errors.push(log);
      // Defer consolidated reporting; keep single-line error for immediate visibility
      // per-row error suppressed; consolidated summary will report
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] batches progress ${i + 1}/${
          rows.length
        } created=${created} skipped=${skipped} errors=${errors.length}`
      );
    }
  }
  console.log(
    `[import] batches complete total=${rows.length} created=${created} skipped=${skipped} errors=${errors.length}`
  );
  if (errors.length) {
    const grouped: Record<
      string,
      { constraint: string; count: number; ids: (number | null)[] }
    > = {};
    for (const e of errors) {
      const key = e.constraint || e.code || "unknown";
      if (!grouped[key]) grouped[key] = { constraint: key, count: 0, ids: [] };
      grouped[key].count++;
      grouped[key].ids.push(typeof e.id === "number" ? e.id : null);
    }
    console.log("[import] batches error summary", Object.values(grouped));
  }
  return { created, updated, skipped, errors };
}
