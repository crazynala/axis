import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick, resetSequence } from "./utils";

export async function importShipments(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idNum = asNum(pick(r, ["a__Serial", "id"])) as number | null;
    if (idNum == null) {
      skipped++;
      errors.push({ index: i, message: "Missing a__Serial/id for shipment" });
      continue;
    }
    const data: any = {
      id: idNum,
      addressIdShip: asNum(pick(r, ["a_AddressID|Ship"])) as number | null,
      companyIdCarrier: asNum(pick(r, ["a_CompanyID_Carrier"])) as
        | number
        | null,
      companyIdReceiver: asNum(pick(r, ["a_CompanyID_Receiver"])) as
        | number
        | null,
      companyIdSender: asNum(pick(r, ["a_CompanyID_Sender"])) as number | null,
      locationId: asNum(pick(r, ["a_LocationID"])) as number | null,
      contactIdReceiver: asNum(pick(r, ["a_ContactID_Receiver"])) as
        | number
        | null,
      date: asDate(pick(r, ["Date"])) as Date | null,
      dateReceived: asDate(pick(r, ["DateReceived"])) as Date | null,
      trackingNo: (pick(r, ["TrackingNo"]) ?? "").toString().trim() || null,
      packingSlipCode:
        (pick(r, ["PackingSlipCode"]) ?? "").toString().trim() || null,
      type: (pick(r, ["Type"]) ?? "").toString().trim() || null,
      status: (pick(r, ["Status"]) ?? "").toString().trim() || null,
      // New address detail fields (Ship)
      addressName:
        (pick(r, ["Address_Name|Ship"]) ?? "").toString().trim() || null,
      addressCountry:
        (pick(r, ["Address_Country|Ship"]) ?? "").toString().trim() || null,
      addressCountyState:
        (pick(r, ["Address_CountyState|Ship"]) ?? "").toString().trim() || null,
      addressLine1:
        (pick(r, ["Address_Line1|Ship"]) ?? "").toString().trim() || null,
      addressLine2:
        (pick(r, ["Address_Line2|Ship"]) ?? "").toString().trim() || null,
      addressLine3:
        (pick(r, ["Address_Line3|Ship"]) ?? "").toString().trim() || null,
      addressTownCity:
        (pick(r, ["Address_TownCity|Ship"]) ?? "").toString().trim() || null,
      addressZipPostCode:
        (pick(r, ["Address_ZipPostCode|Ship"]) ?? "").toString().trim() || null,
      memo: (pick(r, ["Memo"]) ?? "").toString().trim() || null,
      shippingMethod:
        (pick(r, ["ShippingMethod"]) ?? "").toString().trim() || null,
    };
    try {
      await prisma.shipment.upsert({
        where: { id: idNum },
        create: data,
        update: data,
      });
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
    if ((i + 1) % 100 === 0) {
      console.log(
        `[import] shipments progress ${i + 1}/${
          rows.length
        } created=${created} skipped=${skipped} errors=${errors.length}`
      );
    }
  }
  console.log(
    `[import] shipments complete total=${rows.length} created=${created} skipped=${skipped} errors=${errors.length}`
  );
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
    console.log("[import] shipments error summary", Object.values(grouped));
  }
  await resetSequence(prisma, "Shipment");
  return { created, updated, skipped, errors };
}
