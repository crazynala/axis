import { prisma, refreshProductStockSnapshot } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";
import util from "node:util";

const dbgPML = (o: any) =>
  util.inspect(o, { depth: null, colors: false, maxArrayLength: 50 });

function pickParentASerial(row: any): string | null {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const m: Record<string, string> = {};
  for (const k of Object.keys(row)) m[normalize(k)] = k;
  const get = (k: string) => row[m[normalize(k)]];
  const raw =
    get("a_serialid") ??
    get("a_serial") ??
    get("serial") ??
    get("movement_serial") ??
    get("ref") ??
    get("reference") ??
    null;
  return raw == null ? null : String(raw).trim();
}

export async function importProductMovementLines(
  rows: any[]
): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const skipCounts: Record<string, number> = {};
  const markSkip = (reason: string) => {
    skipped++;
    skipCounts[reason] = (skipCounts[reason] || 0) + 1;
  };

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
    const parentSerial = pickParentASerial(r);

    try {
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
        const reasonParts = [
          movementIdVal == null ? "missing movementId" : null,
          !productCodeRaw ? "missing productCodeRaw" : null,
          qty == null ? "missing qty" : null,
        ].filter(Boolean);
        const reason = reasonParts.join(", ") || "missing required fields";
        console.log(
          `[import:product_movement_lines] skip row #${
            i + 1
          } reason=${reason} parent a_Serial=${
            parentSerial ?? "N/A"
          } src=${dbgPML(r)}`
        );
        markSkip(reason);
        continue;
      }
      const movement = await prisma.productMovement.findUnique({
        where: { id: movementIdVal },
      });
      if (!movement) {
        console.log(
          `[import:product_movement_lines] skip row #${
            i + 1
          } reason=missing parent movement id=${movementIdVal} parent a_Serial=${
            parentSerial ?? "N/A"
          } src=${dbgPML(r)}`
        );
        markSkip("missing parent movement");
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
        console.log(
          `[import:product_movement_lines] skip row #${
            i + 1
          } reason=unmapped product productCodeRaw=${productCodeRaw} parent a_Serial=${
            parentSerial ?? "N/A"
          } src=${dbgPML(r)}`
        );
        markSkip("unmapped product");
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
        errors.push({
          index: i,
          id: lineId,
          message: e?.message,
          code: e?.code,
        });
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
    } catch (e: any) {
      console.error(
        `[import:product_movement_lines] error at row #${
          i + 1
        } parent a_Serial=${parentSerial ?? "N/A"} ${e?.code ?? ""} ${
          e?.message ?? e
        }`
      );
      console.error(
        `[import:product_movement_lines] row #${i + 1} src= ${dbgPML(r)}`
      );
      // ...existing error aggregation (if any)...
      // errors.push({ key: parentSerial ?? null, reason: e?.message || "unknown" });
    }
  }
  console.log(
    `[import] product_movement_lines complete total=${rows.length} created=${created} updated=${updated} skipped=${skipped} errors=${errors.length}`
  );
  if (skipped) {
    console.log(
      "[import] product_movement_lines skip summary",
      Object.entries(skipCounts).map(([reason, count]) => ({ reason, count }))
    );
  }
  try {
    await refreshProductStockSnapshot(false);
  } catch (e) {
    console.warn("[import] product_movement_lines: MV refresh failed", e);
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
    console.log(
      "[import] product_movement_lines error summary",
      Object.values(grouped)
    );
  }
  return { created, updated, skipped, errors };
}
