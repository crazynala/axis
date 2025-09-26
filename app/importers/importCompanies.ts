import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick, fixMojibake } from "./utils";

export async function importCompanies(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const toCreate: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idNum = asNum(pick(r, ["a__Serial"])) as number | null;
    const name = fixMojibake(
      (pick(r, ["Company", "Name"]) ?? "").toString().trim()
    );
    if (!name && idNum == null) {
      skipped++;
      continue;
    }
    const email =
      fixMojibake((pick(r, ["Email"]) ?? "").toString().trim()) || null;
    const phone =
      fixMojibake((pick(r, ["Phone"]) ?? "").toString().trim()) || null;
    const category =
      fixMojibake((pick(r, ["Category"]) ?? "").toString().trim()) || null;
    const customerPricingCategory =
      (pick(r, ["CustomerPricingCategory"]) ?? "").toString().trim() || null;
    const customerPricingDiscount = asNum(
      pick(r, ["CustomerPricingDiscount"])
    ) as number | null;
    const ourRep = (pick(r, ["OurRep"]) ?? "").toString().trim() || null;
    const flagCarrier = !!pick(r, ["Flag_Carrier"]);
    const flagCustomer = !!pick(r, ["Flag_Customer"]);
    const flagInactive = !!pick(r, ["Flag_Inactive"]);
    const flagSupplier = !!pick(r, ["Flag_Supplier"]);
    const createdBy =
      (pick(r, ["Record_CreatedBy"]) ?? "").toString().trim() || null;
    const createdAt = asDate(
      pick(r, ["Record_CreatedTimestamp"])
    ) as Date | null;
    const modifiedBy =
      (pick(r, ["Record_ModifiedBy"]) ?? "").toString().trim() || null;
    const updatedAt = asDate(
      pick(r, ["Record_ModifiedTimestamp"])
    ) as Date | null;
    const type = flagSupplier ? "vendor" : flagCustomer ? "customer" : "other";
    const data: any = {
      name,
      email,
      phone,
      notes:
        [
          type ? `Type: ${type}` : null,
          category ? `Category: ${category}` : null,
          customerPricingCategory
            ? `CustPricingCat: ${customerPricingCategory}`
            : null,
          customerPricingDiscount != null
            ? `CustPricingDisc: ${customerPricingDiscount}`
            : null,
          ourRep ? `OurRep: ${ourRep}` : null,
          flagCarrier ? `Carrier: yes` : null,
        ]
          .filter(Boolean)
          .join(" | ") || null,
      isCarrier: flagCarrier || null,
      isCustomer: flagCustomer || null,
      isSupplier: flagSupplier || null,
      isInactive: flagInactive || null,
      createdBy,
      modifiedBy,
    };
    if (createdAt) (data as any).createdAt = createdAt;
    if (updatedAt) (data as any).updatedAt = updatedAt;
    try {
      let existing =
        idNum != null
          ? await prisma.company.findUnique({ where: { id: idNum } })
          : null;
      if (!existing && name)
        existing = await prisma.company.findFirst({ where: { name } });
      if (existing) {
        await prisma.company.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        // Stage for batch insert via createMany to allow explicit ids on autoincrement column
        if (idNum != null) toCreate.push({ id: idNum, ...data });
        else toCreate.push({ ...data });
      }
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
  // Perform batch create for new companies
  if (toCreate.length) {
    try {
      const res = await prisma.company.createMany({
        data: toCreate as any[],
        skipDuplicates: true,
      });
      created += res.count;
    } catch (e: any) {
      errors.push({
        index: -1,
        id: null,
        code: e?.code,
        message: e?.message,
        note: `createMany failed for ${toCreate.length} records`,
      });
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
    console.log("[import] companies error summary", Object.values(grouped));
  }
  return { created, updated, skipped, errors };
}
