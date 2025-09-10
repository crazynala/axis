import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick } from "./utils";

export async function importVariantSets(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    const name = (pick(r, ["Name"]) ?? "").toString().trim() || null;
    const variantsRaw = (pick(r, ["Variants"]) ?? "").toString().trim();
    const variants = variantsRaw
      ? variantsRaw
          .split(/[|,;\n]+/)
          .map((s: string) => s.trim())
          .filter((v: string) => Boolean(v))
      : [];
    const data: any = { name, variants };
    try {
      if (idNum != null) {
        await prisma.variantSet.upsert({
          where: { id: idNum },
          create: { id: idNum, ...data },
          update: data,
        });
      } else {
        await prisma.variantSet.create({ data });
      }
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
    console.log("[import] variant_sets error summary", Object.values(grouped));
  }
  return { created, updated, skipped, errors };
}
