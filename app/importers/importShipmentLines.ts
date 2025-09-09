import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, parseIntListPreserveGaps } from "./utils";

export async function importShipmentLines(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (idNum == null) {
      skipped++;
      errors.push({
        index: i,
        message: "Missing a__Serial/id for shipment line",
      });
      continue;
    }
    const data: any = {
      id: idNum,
      assemblyId: asNum(pick(r, ["a_AssemblyID"])) as number | null,
      jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
      locationId: asNum(pick(r, ["a_LocationID"])) as number | null,
      productId: asNum(
        pick(r, ["a__ProductCode", "a_ProductCode", "ProductCode"])
      ) as number | null,
      shipmentId: asNum(pick(r, ["a_ShippingID"])) as number | null,
      variantSetId: asNum(pick(r, ["a_VariantSetID"])) as number | null,
      category: (pick(r, ["Category"]) ?? "").toString().trim() || null,
      details: (pick(r, ["Details"]) ?? "").toString().trim() || null,
      quantity: asNum(pick(r, ["Quantity"])) as number | null,
      qtyBreakdown: parseIntListPreserveGaps(
        pick(r, ["Qty_Breakdown_List_c", "QtyBreakdown", "Qty|Breakdown"])
      ),
      status: (pick(r, ["Status"]) ?? "").toString().trim() || null,
      subCategory: (pick(r, ["SubCategory"]) ?? "").toString().trim() || null,
    };
    try {
      await prisma.shipmentLine.upsert({
        where: { id: idNum },
        create: data,
        update: data,
      });
      created += 1;
    } catch (e: any) {
      const log = {
        index: i,
        id: idNum,
        shipmentId: data.shipmentId,
        productId: data.productId,
        code: e?.code,
        constraint: e?.meta?.field_name || e?.meta?.target || null,
        message: e?.message,
      };
      errors.push(log);
      console.error("[import] shipment_lines upsert error", log);
    }
  }
  return { created, updated, skipped, errors };
}
