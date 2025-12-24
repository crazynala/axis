import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, resetSequence } from "./utils";

// Contacts importer
// RecordType can be Employee | Contact | Customer -> map to contactType field (string) if present
// (Assumes Contact model exists with matching columns; if not, adjust accordingly.)
export async function importContacts(rows: any[]): Promise<ImportResult> {
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
      companyId: asNum(pick(r, ["a_CompanyID"])) as number | null,
      email: (pick(r, ["Email"]) ?? "").toString().trim() || null,
      department: (pick(r, ["Department"]) ?? "").toString().trim() || null,
      firstName: (pick(r, ["Name_First"]) ?? "").toString().trim() || null,
      lastName: (pick(r, ["Name_Last"]) ?? "").toString().trim() || null,
      title: (pick(r, ["Name_Title"]) ?? "").toString().trim() || null,
      phoneDirect: (pick(r, ["Phone|Direct"]) ?? "").toString().trim() || null,
      phoneHome: (pick(r, ["Phone|Home"]) ?? "").toString().trim() || null,
      phoneMobile: (pick(r, ["Phone|Mobile"]) ?? "").toString().trim() || null,
      position: (pick(r, ["Position"]) ?? "").toString().trim() || null,
      recordType: (pick(r, ["RecordType"]) ?? "").toString().trim() || null,
    };
    try {
      await prisma.contact.upsert({
        where: { id },
        create: data,
        update: data,
      });
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
      // per-row error suppressed; consolidated summary will report
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] contacts progress ${i + 1}/${
          rows.length
        } created=${created} skipped=${skipped} errors=${errors.length}`
      );
    }
  }
  console.log(
    `[import] contacts complete total=${rows.length} created=${created} skipped=${skipped} errors=${errors.length}`
  );
  await resetSequence(prisma, "Contact");
  return { created, updated, skipped, errors };
}
