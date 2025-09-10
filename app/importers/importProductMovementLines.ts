import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";

export async function importProductMovementLines(
  rows: any[]
): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];

  const getSkuMap = async () => {
    const bySku = new Map<string, number>();
    const all = await prisma.product.findMany({
      select: { id: true, sku: true },
    });
    for (const p of all) if (p.sku) bySku.set(p.sku.trim().toUpperCase(), p.id);
    return bySku;
  };
  const skuMap = await getSkuMap();

  // Regen batch cache per product
  const regenCache = new Map<number, number>();
  const getOrCreateRegenBatch = async (productIdNonNull: number) => {
    if (regenCache.has(productIdNonNull)) {
      const id = regenCache.get(productIdNonNull)!;
      return await prisma.batch.findUnique({ where: { id } });
    }
    const codeSartor = `REGEN-${productIdNonNull}`;
    const existing = await prisma.batch.findFirst({
      where: { productId: productIdNonNull, codeSartor } as any,
      orderBy: { id: "desc" as const },
    });
    if (existing) {
      regenCache.set(productIdNonNull, existing.id);
      return existing;
    }
    const created = await prisma.batch.create({
      data: {
        productId: productIdNonNull,
        codeSartor,
        notes: "Auto-created during import due to missing referenced batch",
      } as any,
    });
    regenCache.set(productIdNonNull, created.id);
    return created;
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const lineId = asNum(pick(r, ["a__Serial", "a_Serial", "id"])) as
      | number
      | null;
    const movementIdVal = asNum(
      pick(r, ["a_ProductMovementID", "a_MovementID"])
    ) as number | null;
    const productCodeRaw = (
      pick(r, ["a_ProductCode", "ProductCode", "product_code"]) ?? ""
    )
      .toString()
      .trim();
    const qty = asNum(pick(r, ["Quantity", "quantity", "qty"])) as
      | number
      | null;
    const notes = pick(r, ["notes", "note"])?.toString() ?? null;
    const createdAt = asDate(pick(r, ["Date", "date"])) as Date | null;
    const costingId = asNum(pick(r, ["a_AssemblyLineID", "a_CostingID"])) as
      | number
      | null;
    const batchId = asNum(pick(r, ["a_BatchID"])) as number | null;
    const purchaseOrderLineId = asNum(pick(r, ["a_PurchaseOrderLineID"])) as
      | number
      | null;

    if (movementIdVal == null || !productCodeRaw || qty == null) {
      skipped++;
      continue;
    }
    const movement = await prisma.productMovement.findUnique({
      where: { id: movementIdVal },
    });
    if (!movement) {
      skipped++;
      continue;
    }
    let productId: number | null = null;
    if (/^\d+$/.test(productCodeRaw)) {
      const pid = Number(productCodeRaw);
      const p = await prisma.product.findUnique({ where: { id: pid } });
      if (p) productId = p.id;
    } else if (productCodeRaw) {
      productId = skuMap.get(productCodeRaw.toUpperCase()) ?? null;
    }
    if (productId == null) {
      skipped++;
      continue;
    }

    const data: any = {
      movementId: movement.id,
      productId,
      quantity: qty,
      notes,
      productMovementId: movement.id,
      costingId: costingId ?? undefined,
      batchId: batchId ?? undefined,
      purchaseOrderLineId: purchaseOrderLineId ?? undefined,
    } as any;
    if (createdAt) data.createdAt = createdAt;

    // Validate batchId and repair if missing
    let desiredBatchId: number | undefined = (batchId ?? undefined) as
      | number
      | undefined;
    if (desiredBatchId != null) {
      const b = await prisma.batch.findUnique({
        where: { id: desiredBatchId },
      });
      if (!b) {
        const regen = await getOrCreateRegenBatch(productId);
        if (regen) desiredBatchId = regen.id;
        else desiredBatchId = undefined;
      }
    }
    if (desiredBatchId != null) data.batchId = desiredBatchId;

    try {
      if (lineId != null) {
        const existing = await prisma.productMovementLine.findUnique({
          where: { id: lineId },
        });
        if (existing) {
          await prisma.productMovementLine.update({
            where: { id: lineId },
            data,
          });
          updated++;
        } else {
          await prisma.productMovementLine.create({
            data: { id: lineId, ...data },
          });
          created++;
        }
      } else {
        await prisma.productMovementLine.create({ data });
        created++;
      }
    } catch (e: any) {
      // Retry once if batch FK fails by creating regen batch
      if (
        e &&
        e.code === "P2003" &&
        String(e?.meta?.field_name || "").includes("batchId")
      ) {
        try {
          const regen = await getOrCreateRegenBatch(productId);
          const retry = { ...data, batchId: regen?.id } as any;
          if (lineId != null) {
            const exists2 = await prisma.productMovementLine.findUnique({
              where: { id: lineId },
            });
            if (exists2)
              await prisma.productMovementLine.update({
                where: { id: lineId },
                data: retry,
              });
            else
              await prisma.productMovementLine.create({
                data: { id: lineId, ...retry },
              });
          } else {
            await prisma.productMovementLine.create({ data: retry });
          }
          created++;
          continue;
        } catch {}
      }
      errors.push({ index: i, id: lineId, message: e?.message, code: e?.code });
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] product_movement_lines progress ${i + 1}/${
          rows.length
        } created=${created} updated=${updated} skipped=${skipped} errors=${
          errors.length
        }`
      );
    }
  }
  console.log(
    `[import] product_movement_lines complete total=${rows.length} created=${created} updated=${updated} skipped=${skipped} errors=${errors.length}`
  );
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
    console.log(
      "[import] product_movement_lines error summary",
      Object.values(grouped)
    );
  }
  return { created, updated, skipped, errors };
}
