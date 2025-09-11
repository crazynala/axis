import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick } from "./utils";

export async function importAddresses(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (idNum == null) {
      skipped++;
      continue;
    }
    const data: any = {
      id: idNum,
      companyId: asNum(pick(r, ["a__CompanyID", "CompanyID"])) as number | null,
      contactId: asNum(pick(r, ["a__ContactID", "ContactID"])) as number | null,
      name: (pick(r, ["Name", "name"]) ?? null) as any,
      addressCountry: (pick(r, ["Address_Country"]) ?? null) as any,
      addressCountyState: (pick(r, ["Address_County_State"]) ?? null) as any,
      addressLine1: (pick(r, ["Address_Line1"]) ?? null) as any,
      addressLine2: (pick(r, ["Address_Line2"]) ?? null) as any,
      addressLine3: (pick(r, ["Address_Line3"]) ?? null) as any,
      addressTownCity: (pick(r, ["Address_Town_City"]) ?? null) as any,
      addressZipPostCode: (pick(r, ["Address_Zip_PostCode"]) ?? null) as any,
    };
    try {
      await prisma.address.upsert({
        where: { id: idNum },
        create: data,
        update: data,
      });
      created += 1;
    } catch (e: any) {
      errors.push({ index: i, id: idNum, message: e?.message, code: e?.code });
    }
  }
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
    console.log("[import] addresses error summary", Object.values(grouped));
  }
  return { created, updated, skipped, errors };
}
