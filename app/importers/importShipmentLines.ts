import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asNum, pick, parseIntListPreserveGaps, resetSequence } from "./utils";

export async function importShipmentLines(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  const linesByShipment = new Map<
    number,
    Array<{
      shipmentLineId: number;
      assemblyId: number | null;
      jobId: number | null;
      productId: number | null;
      quantity: number | null;
      qtyBreakdown: number[];
    }>
  >();
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
    const poLineRaw = asNum(pick(r, ["a_PurchaseOrderLineID|Creator"])) as
      | number
      | null;
    let purchaseOrderLineId = poLineRaw;
    if (purchaseOrderLineId != null) {
      const exists = await prisma.purchaseOrderLine.findUnique({
        where: { id: purchaseOrderLineId },
        select: { id: true },
      });
      if (!exists) {
        console.warn(
          `[import] shipment_lines missing PurchaseOrderLine ${purchaseOrderLineId} for line ${idNum}`
        );
        purchaseOrderLineId = null;
      }
    }
    const data: any = {
      id: idNum,
      assemblyId: asNum(pick(r, ["a_AssemblyID"])) as number | null,
      jobId: asNum(pick(r, ["a_JobNo"])) as number | null,
      locationId: asNum(pick(r, ["a_LocationID"])) as number | null,
      productId: asNum(
        pick(r, ["a__ProductCode", "a_ProductCode", "ProductCode"])
      ) as number | null,
      purchaseOrderLineId,
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
      if (data.shipmentId) {
        const list = linesByShipment.get(data.shipmentId) || [];
        list.push({
          shipmentLineId: idNum,
          assemblyId: data.assemblyId ?? null,
          jobId: data.jobId ?? null,
          productId: data.productId ?? null,
          quantity: data.quantity ?? null,
          qtyBreakdown: Array.isArray(data.qtyBreakdown)
            ? (data.qtyBreakdown as number[])
            : [],
        });
        linesByShipment.set(data.shipmentId, list);
      }
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
      // per-row error suppressed; consolidated summary will report
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] shipment_lines progress ${i + 1}/${
          rows.length
        } created=${created} skipped=${skipped} errors=${errors.length}`
      );
    }
  }
  console.log(
    `[import] shipment_lines complete total=${rows.length} created=${created} skipped=${skipped} errors=${errors.length}`
  );
  if (linesByShipment.size) {
    const shipmentIds = Array.from(linesByShipment.keys());
    const shipments = await prisma.shipment.findMany({
      where: { id: { in: shipmentIds } },
      select: {
        id: true,
        type: true,
        status: true,
        locationId: true,
        companyIdSender: true,
        companyIdReceiver: true,
      },
    });
    const shipmentMap = new Map<number, typeof shipments[number]>();
    shipments.forEach((s) => shipmentMap.set(s.id, s));
    for (const [shipmentId, lines] of linesByShipment.entries()) {
      const shipment = shipmentMap.get(shipmentId);
      if (!shipment) continue;
      if (shipment.type && shipment.type !== "Out") continue;
      const importKey = `FM_SHIPMENT:${shipmentId}`;
      const box = await prisma.box.upsert({
        where: { importKey },
        create: {
          importKey,
          shipmentId,
          locationId: shipment.locationId ?? null,
          companyId: shipment.companyIdSender ?? shipment.companyIdReceiver ?? null,
          state: "shipped",
          description: "Legacy box (imported)",
        },
        update: {
          shipmentId,
          locationId: shipment.locationId ?? null,
          companyId: shipment.companyIdSender ?? shipment.companyIdReceiver ?? null,
          state: "shipped",
          description: "Legacy box (imported)",
        },
      });
      await prisma.boxLine.deleteMany({ where: { boxId: box.id } });
      if (!lines.length) continue;
      await prisma.boxLine.createMany({
        data: lines.map((line) => ({
          boxId: box.id,
          shipmentLineId: line.shipmentLineId,
          assemblyId: line.assemblyId ?? undefined,
          jobId: line.jobId ?? undefined,
          productId: line.productId ?? undefined,
          quantity: line.quantity ?? undefined,
          qtyBreakdown:
            Array.isArray(line.qtyBreakdown) && line.qtyBreakdown.length
              ? (line.qtyBreakdown as any)
              : undefined,
        })),
      });
    }
  }
  if (errors.length) {
    const grouped: Record<
      string,
      { key: string; count: number; ids: (number | null)[] }
    > = {};
    for (const e of errors) {
      const key = e.constraint || e.code || "error";
      if (!grouped[key]) grouped[key] = { key, count: 0, ids: [] };
      grouped[key].count++;
      grouped[key].ids.push(e.id ?? null);
    }
    console.log(
      "[import] shipment_lines error summary",
      Object.values(grouped)
    );
  }
  await resetSequence(prisma, "ShipmentLine");
  return { created, updated, skipped, errors };
}
