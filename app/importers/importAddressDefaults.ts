import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, resetSequence } from "./utils";

type AddressOwner = { companyId: number | null; contactId: number | null };

type SkipTracker = Record<string, { key: string; count: number }>;

function noteSkip(skipReasons: SkipTracker, reason: string) {
  if (!skipReasons[reason]) skipReasons[reason] = { key: reason, count: 0 };
  skipReasons[reason].count++;
}

async function preloadAddressOwners(): Promise<Map<number, AddressOwner>> {
  const addresses = await prisma.address.findMany({
    select: { id: true, companyId: true, contactId: true },
  });
  return new Map(addresses.map((a) => [a.id, a]));
}

export async function applyCompanyDefaultAddresses(
  rows: any[]
): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const skipReasons: SkipTracker = {};

  const companies = await prisma.company.findMany({ select: { id: true } });
  const companyIds = new Set(companies.map((r) => r.id));
  const addressOwners = await preloadAddressOwners();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const companyId = asNum(pick(r, ["a__Serial", "id", "CompanyID"])) as
      | number
      | null;
    if (companyId == null) {
      skipped++;
      noteSkip(skipReasons, "missing_company_id");
      continue;
    }
    if (!companyIds.has(companyId)) {
      skipped++;
      noteSkip(skipReasons, "company_missing");
      continue;
    }

    const rawDefaultId = asNum(
      pick(r, [
        "a_AddressID",
        "DefaultAddressID",
        "AddressID",
        "defaultAddressId",
      ])
    ) as number | null;
    if (rawDefaultId == null) {
      skipped++;
      noteSkip(skipReasons, "missing_default");
      continue;
    }

    try {
      const owner = addressOwners.get(rawDefaultId);
      if (!owner) {
        await prisma.company.update({
          where: { id: companyId },
          data: { defaultAddressId: null },
        });
        updated++;
        noteSkip(skipReasons, "address_missing");
        continue;
      }
      if (owner.companyId !== companyId) {
        await prisma.company.update({
          where: { id: companyId },
          data: { defaultAddressId: null },
        });
        updated++;
        noteSkip(skipReasons, "address_not_owned");
        continue;
      }

      await prisma.company.update({
        where: { id: companyId },
        data: { defaultAddressId: rawDefaultId },
      });
      updated++;
    } catch (e: any) {
      errors.push({
        index: i,
        id: companyId,
        message: e?.message,
        code: e?.code,
      });
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
    console.log("[import] company defaults error summary", Object.values(grouped));
  }
  if (Object.keys(skipReasons).length) {
    console.log(
      "[import] company defaults skip summary",
      Object.values(skipReasons)
    );
  }

  await resetSequence(prisma, "Company");
  return { created, updated, skipped, errors };
}

export async function applyContactDefaultAddresses(
  rows: any[]
): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const skipReasons: SkipTracker = {};

  const contacts = await prisma.contact.findMany({ select: { id: true } });
  const contactIds = new Set(contacts.map((r) => r.id));
  const addressOwners = await preloadAddressOwners();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const contactId = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (contactId == null) {
      skipped++;
      noteSkip(skipReasons, "missing_contact_id");
      continue;
    }
    if (!contactIds.has(contactId)) {
      skipped++;
      noteSkip(skipReasons, "contact_missing");
      continue;
    }

    const rawDefaultId = asNum(
      pick(r, [
        "a_AddressID_c",
        "DefaultAddressID",
        "AddressID",
        "defaultAddressId",
      ])
    ) as number | null;
    if (rawDefaultId == null) {
      skipped++;
      noteSkip(skipReasons, "missing_default");
      continue;
    }

    try {
      const owner = addressOwners.get(rawDefaultId);
      if (!owner) {
        await prisma.contact.update({
          where: { id: contactId },
          data: { defaultAddressId: null },
        });
        updated++;
        noteSkip(skipReasons, "address_missing");
        continue;
      }
      if (owner.contactId !== contactId) {
        await prisma.contact.update({
          where: { id: contactId },
          data: { defaultAddressId: null },
        });
        updated++;
        noteSkip(skipReasons, "address_not_owned");
        continue;
      }

      await prisma.contact.update({
        where: { id: contactId },
        data: { defaultAddressId: rawDefaultId },
      });
      updated++;
    } catch (e: any) {
      errors.push({
        index: i,
        id: contactId,
        message: e?.message,
        code: e?.code,
      });
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
    console.log("[import] contact defaults error summary", Object.values(grouped));
  }
  if (Object.keys(skipReasons).length) {
    console.log(
      "[import] contact defaults skip summary",
      Object.values(skipReasons)
    );
  }

  await resetSequence(prisma, "Contact");
  return { created, updated, skipped, errors };
}
