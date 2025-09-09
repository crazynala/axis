import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick } from "./utils";

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
      console.error("[import] shipments upsert error", log);
    }
  }
  return { created, updated, skipped, errors };
}
