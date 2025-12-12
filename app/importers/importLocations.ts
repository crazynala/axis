import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, resetSequence } from "./utils";
import { LocationType } from "@prisma/client";

function normalizeLocationType(raw: any): LocationType | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  switch (s) {
    case "warehouse":
    case "stock":
    case "default":
      return LocationType.warehouse;
    case "customer_depot":
    case "customer depot":
    case "depot":
      return LocationType.customer_depot;
    case "wip":
    case "in process":
    case "in-process":
      return LocationType.wip;
    case "sample":
    case "keep":
    case "showroom":
      return LocationType.sample;
    case "scrap":
    case "trash":
    case "waste":
      return LocationType.scrap;
    case "off_spec":
    case "off-spec":
    case "off spec":
    case "donation":
    case "defect":
      return LocationType.off_spec;
    case "review":
    case "qc":
    case "qc review":
      return LocationType.review;
    default:
      console.log("[import] locations: unmapped type", raw);
      return null;
  }
}

export async function importLocations(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const toCreate: any[] = [];
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
    const type = normalizeLocationType(pick(r, ["type", "location_type"]));
    try {
      const existing = await prisma.location.findFirst({ where: { name } });
      if (existing) {
        await prisma.location.update({
          where: { id: existing.id },
          data: { notes, type: type ?? undefined },
        });
        updated++;
      } else {
        toCreate.push({
          ...(id != null ? { id } : {}),
          name,
          notes,
          ...(type ? { type } : {}),
        });
      }
    } catch (e: any) {
      errors.push({ index: i, id, name, message: e?.message, code: e?.code });
    }
  }
  if (toCreate.length) {
    try {
      const res = await prisma.location.createMany({
        data: toCreate as any[],
        skipDuplicates: true,
      });
      created += res.count;
    } catch (e: any) {
      errors.push({
        index: -1,
        id: null,
        name: null,
        message: e?.message,
        code: e?.code,
        note: `createMany failed for ${toCreate.length} locations`,
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
    console.log("[import] locations error summary", Object.values(grouped));
  }
  await resetSequence(prisma, "Location");
  return { created, updated, skipped, errors };
}
