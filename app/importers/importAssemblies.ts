import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, parseIntListPreserveGaps } from "./utils";

export async function importAssemblies(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const productIdSet = new Set<number>();
  for (const row of rows) {
    const pid = asNum(
      pick(row, ["a__ProductCode", "a_ProductCode", "ProductId", "ProductID"])
    ) as number | null;
    if (pid != null) productIdSet.add(pid);
  }
  const productNameById = new Map<number, string | null>();
  if (productIdSet.size) {
    const products = await prisma.product.findMany({
      where: { id: { in: Array.from(productIdSet) } },
      select: { id: true, name: true },
    });
    for (const product of products) {
      productNameById.set(product.id, product.name ?? null);
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (id == null) {
      skipped++;
      continue;
    }
    const qtyOrderedBreakdown = parseIntListPreserveGaps(
      pick(r, [
        "Qty_Ordered_List_c",
        "QtyOrdered_List_c",
        "QtyOrderedList",
        "Qty_Ordered_List",
      ])
    );
    const orderedSum = qtyOrderedBreakdown.reduce(
      (t: number, n: number) => (Number.isFinite(n) ? t + (n | 0) : t),
      0
    );
    const productId = asNum(
      pick(r, ["a__ProductCode", "a_ProductCode", "ProductId", "ProductID"])
    ) as number | null;
    const rawName = (pick(r, ["Name", "AssemblyName", "NameOverride"]) ?? "")
      .toString()
      .trim();
    const resolvedName = rawName
      ? rawName
      : productId != null
        ? productNameById.get(productId) ?? null
        : null;
    const data: any = {
      id,
      name: resolvedName,
      status: (pick(r, ["Status"]) ?? "").toString().trim() || null,
      quantity:
        orderedSum > 0
          ? (orderedSum as any)
          : (asNum(pick(r, ["Quantity"])) as number | null as any),
      qtyOrderedBreakdown: qtyOrderedBreakdown as any,
      jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
      productId,
      variantSetId: asNum(pick(r, ["a_VariantSetID"])) as number | null,
      notes: (pick(r, ["Notes"]) ?? "").toString().trim() || null,
    };
    try {
      await prisma.assembly.upsert({
        where: { id },
        create: data,
        update: data,
      });
      created++;
    } catch (e: any) {
      errors.push({ index: i, id, message: e?.message, code: e?.code });
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
    console.log("[import] assemblies error summary", Object.values(grouped));
  }
  return { created, updated, skipped, errors };
}
