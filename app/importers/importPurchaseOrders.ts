import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";

export async function importPurchaseOrders(rows: any[]): Promise<ImportResult> {
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
        message: "Missing a__Serial/id for purchase order",
      });
      continue;
    }
    const data: any = {
      id: idNum,
      companyId: asNum(pick(r, ["a_CompanyID"])) as number | null,
      consigneeCompanyId: asNum(pick(r, ["a_CompanyID|Consignee"])) as
        | number
        | null,
      locationId: asNum(pick(r, ["a_LocationID|In"])) as number | null,
      date: asDate(pick(r, ["Date"])) as Date | null,
    };
    try {
      await prisma.purchaseOrder.upsert({
        where: { id: idNum },
        create: data,
        update: data,
      });
      created += 1;
    } catch (e: any) {
      const log = {
        index: i,
        id: idNum,
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
      "[import] purchase_orders error summary",
      Object.values(grouped)
    );
  }
  return { created, updated, skipped, errors };
}
