import { prisma, refreshProductStockSnapshot } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";
import util from "node:util";

const dbgPM = (o: any) =>
  util.inspect(o, { depth: null, colors: false, maxArrayLength: 50 });

function pickASerial(row: any): string | null {
  // accept common header variants (case/space/punct-insensitive)
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

export async function importProductMovements(
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

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const aSerial = pickASerial(r);

    try {
      let parsedId: number | null = null;
      parsedId = asNum(pick(r, ["a__Serial", "a_Serial", "id"])) as
        | number
        | null;
      const type =
        (pick(r, ["Type", "type", "MovementType"]) ?? "").toString().trim() ||
        null;
      const createdAt = asDate(
        pick(r, ["Date", "date", "movement_date"])
      ) as Date | null;
      const fromRaw = pick(r, [
        "a_LocationID_Out",
        "a_LocationID|Out",
        "Movement_From",
      ]) as any;
      const toRaw = pick(r, [
        "a_LocationID_In",
        "a_LocationID|In",
        "Movement_To",
      ]) as any;
      const shippingType =
        (pick(r, ["ShippingType"]) ?? "").toString().trim() || null;
      const qty = asNum(pick(r, ["Quantity", "Qty", "quantity"])) as
        | number
        | null;
      // Optional header-level linkage fields
      const purchaseOrderLineId = asNum(pick(r, ["a_PurchaseOrderLineID"])) as
        | number
        | null;
      const shippingLineId = asNum(pick(r, ["a_ShippingLineID"])) as
        | number
        | null;
      const assemblyActivityIdFM = asNum(pick(r, ["a_AssemblyActivityID"])) as
        | number
        | null;
      const assemblyIdFM = asNum(pick(r, ["a_AssemblyID"])) as number | null;
      const costingIdFM = asNum(pick(r, ["a_CostingsID", "a_CostingID"])) as
        | number
        | null;
      const productCodeRaw = (
        pick(r, ["a_ProductCode", "ProductCode", "product_code"]) ?? ""
      )
        .toString()
        .trim();
      let productId: number | null = null;
      if (/^\d+$/.test(productCodeRaw)) {
        const pid = Number(productCodeRaw);
        const p = await prisma.product.findUnique({ where: { id: pid } });
        if (p) productId = p.id;
      } else if (productCodeRaw) {
        productId = skuMap.get(productCodeRaw.toUpperCase()) ?? null;
      }
      const fromId = asNum(fromRaw) as number | null;
      const toId = asNum(toRaw) as number | null;
      const locationOutId = fromId;
      const locationInId = toId;
      if (!type && !createdAt && productId == null && qty == null) {
        skipped++;
        continue;
      }
      if (productId == null) {
        const msg = `skip row #${
          i + 1
        } reason=missing product for movement a_Serial=${
          aSerial ?? "N/A"
        } productCodeRaw=${productCodeRaw}`;
        console.log(`[import:product_movements] ${msg}`);
        console.log(
          `[import:product_movements] row #${i + 1} src= ${dbgPM(r)}`
        );
        errors.push({
          index: i,
          id: parsedId ?? null,
          code: "MISSING_PRODUCT",
          message: "Missing product for movement",
          aSerial: aSerial ?? null,
          productCodeRaw,
        });
        continue;
      }
      try {
        const data: any = {
          movementType: type,
          date: createdAt,
          shippingType,
          productId,
          quantity: qty,
          locationInId,
          locationOutId,
          assemblyActivityId: assemblyActivityIdFM ?? undefined,
          assemblyId: assemblyIdFM ?? undefined,
          costingId: costingIdFM ?? undefined,
          purchaseOrderLineId: purchaseOrderLineId ?? undefined,
          shippingLineId: shippingLineId ?? undefined,
        };
        if (parsedId != null) {
          const existing = await prisma.productMovement.findUnique({
            where: { id: parsedId },
          });
          if (existing) {
            await prisma.productMovement.update({
              where: { id: parsedId },
              data,
            });
            updated++;
          } else {
            await prisma.productMovement.create({
              data: { id: parsedId, ...data },
            });
            created++;
          }
        } else {
          await prisma.productMovement.create({ data });
          created++;
        }
      } catch (e: any) {
        const code = e?.code || "error";
        const msg = `error at row #${i + 1} a_Serial=${
          aSerial ?? "N/A"
        } ${code} ${e?.message ?? e}`;
        console.log(`[import:product_movements] ${msg}`);
        console.log(
          `[import:product_movements] row #${i + 1} src= ${dbgPM(r)}`
        );
        errors.push({
          index: i,
          id: parsedId ?? null,
          message: e?.message,
          code,
          aSerial: aSerial ?? null,
        });
      }
    } catch (e: any) {
      const code = e?.code || "error";
      const msg = `parse error at row #${i + 1} a_Serial=${
        aSerial ?? "N/A"
      } ${code} ${e?.message ?? e}`;
      console.log(`[import:product_movements] ${msg}`);
      console.log(`[import:product_movements] row #${i + 1} src= ${dbgPM(r)}`);
      errors.push({
        index: i,
        id: null,
        message: e?.message,
        code,
        aSerial: aSerial ?? null,
      });
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] product_movements progress ${i + 1}/${
          rows.length
        } created=${created} updated=${updated} skipped=${skipped} errors=${
          errors.length
        }`
      );
    }
  }
  console.log(
    `[import] product_movements complete total=${rows.length} created=${created} updated=${updated} skipped=${skipped} errors=${errors.length}`
  );
  try {
    await refreshProductStockSnapshot(false);
  } catch (e) {
    console.warn("[import] product_movements: MV refresh failed", e);
  }
  if (errors.length) {
    const grouped: Record<
      string,
      { key: string; count: number; ids: (number | null)[] }
    > = {};
    for (const e of errors) {
      const key = e.code || "error";
      if (!grouped[key]) grouped[key] = { key, count: 0, ids: [] };
      grouped[key].count++;
      grouped[key].ids.push(e.id ?? null);
    }
    console.log(
      "[import] product_movements error summary",
      Object.values(grouped)
    );
    // Print a few detailed samples for visibility
    const sample = errors.slice(0, 5).map((e) => ({
      index: e.index,
      id: e.id ?? null,
      code: e.code,
      aSerial: e.aSerial ?? null,
      message: e.message,
    }));
    console.log("[import] product_movements error samples (first 5)", sample);
  }
  return { created, updated, skipped, errors };
}
