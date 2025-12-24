import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, resetSequence } from "./utils";

export async function importAddresses(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const skipReasons: Record<string, { key: string; count: number }> = {};

  const companies = await prisma.company.findMany({ select: { id: true } });
  const contacts = await prisma.contact.findMany({ select: { id: true } });
  const existingAddresses = await prisma.address.findMany({
    select: { id: true },
  });
  const companyIds = new Set(companies.map((r) => r.id));
  const contactIds = new Set(contacts.map((r) => r.id));
  const addressIds = new Set(existingAddresses.map((r) => r.id));

  const noteSkip = (reason: string) => {
    skipped++;
    if (!skipReasons[reason]) skipReasons[reason] = { key: reason, count: 0 };
    skipReasons[reason].count++;
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (idNum == null) {
      noteSkip("missing_id");
      continue;
    }
    const rawCompanyId = asNum(pick(r, ["a_CompanyID", "CompanyID"])) as
      | number
      | null;
    const rawContactId = asNum(pick(r, ["a_ContactID", "ContactID"])) as
      | number
      | null;
    let companyId: number | null = null;
    let contactId: number | null = null;
    if (rawContactId && contactIds.has(rawContactId)) {
      contactId = rawContactId;
    } else if (rawCompanyId && companyIds.has(rawCompanyId)) {
      companyId = rawCompanyId;
    } else if (rawContactId || rawCompanyId) {
      noteSkip("missing_parent");
      continue;
    } else {
      noteSkip("missing_owner");
      continue;
    }
    const data: any = {
      id: idNum,
      companyId,
      contactId,
      name: (pick(r, ["Name", "name"]) ?? null) as any,
      addressCountry: (pick(r, ["Address_Country"]) ?? null) as any,
      addressCountyState: (pick(r, ["Address_CountyState"]) ?? null) as any,
      addressLine1: (pick(r, ["Address_Line1"]) ?? null) as any,
      addressLine2: (pick(r, ["Address_Line2"]) ?? null) as any,
      addressLine3: (pick(r, ["Address_Line3"]) ?? null) as any,
      addressTownCity: (pick(r, ["Address_TownCity"]) ?? null) as any,
      addressZipPostCode: (pick(r, ["Address_ZipPostCode"]) ?? null) as any,
    };
    try {
      const existed = addressIds.has(idNum);
      await prisma.address.upsert({
        where: { id: idNum },
        create: data,
        update: data,
      });
      if (existed) updated += 1;
      else created += 1;
      addressIds.add(idNum);
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
  if (Object.keys(skipReasons).length) {
    console.log(
      "[import] addresses skip summary",
      Object.values(skipReasons)
    );
  }
  await resetSequence(prisma, "Address");
  return { created, updated, skipped, errors };
}
