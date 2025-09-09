import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick } from "./utils";

export async function importLocations(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = asNum(pick(r, ["a__Serial", "a_Serial", "id"])) as number | null;
    const name = (pick(r, ["name", "location", "location_name"]) ?? "")
      .toString()
      .trim();
    if (!name) {
      skipped++;
      continue;
    }
    const notes = pick(r, ["notes", "note"])?.toString() ?? null;
    try {
      const existing = await prisma.location.findFirst({ where: { name } });
      if (existing) {
        await prisma.location.update({
          where: { id: existing.id },
          data: { notes },
        });
        updated++;
      } else {
        await prisma.location.create({
          data: { ...(id != null ? { id } : {}), name, notes } as any,
        });
        created++;
      }
    } catch (e: any) {
      errors.push({ index: i, id, name, message: e?.message, code: e?.code });
    }
  }
  return { created, updated, skipped, errors };
}
