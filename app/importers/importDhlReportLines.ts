import { prisma } from "../utils/prisma.server";
import type { ImportResult } from "./utils";
import { asDate, asNum, pick, resetSequence } from "./utils";

export async function importDhlReportLines(rows: any[]): Promise<ImportResult> {
  let created = 0,
    updated = 0,
    skipped = 0;
  const errors: any[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Synthetic stable id: row number (1-based). Ignore any a__Serial/id column.
    const idNum = i + 1;
    const data: any = {
      id: idNum,
      accountName:
        (pick(r, ["AccountName", "Account Name"]) ?? "").toString().trim() ||
        null,
      awbNumber:
        (pick(r, ["AWB Number", "AWBNumber"]) ?? "").toString().trim() || null,
      billedWeight: asNum(pick(r, ["BilledWeight", "Billed Weight"])) as
        | number
        | null,
      billingAccountNumber:
        (pick(r, ["BillingAccountNumber", "Billing Account Number"]) ?? "")
          .toString()
          .trim() || null,
      billingExchangeRate: asNum(pick(r, ["BillingExchangeRate"])) as
        | number
        | null,
      destinationCountryCode:
        (pick(r, ["DestinationCountryCode", "Destination Country Code"]) ?? "")
          .toString()
          .trim() || null,
      destinationCountryName:
        (pick(r, ["DestinationCountryName", "Destination Country Name"]) ?? "")
          .toString()
          .trim() || null,
      destinationServiceAreaCode:
        (
          pick(r, [
            "DestinationServiceAreaCode",
            "Destination Service Area Code",
          ]) ?? ""
        )
          .toString()
          .trim() || null,
      destinationServiceAreaName:
        (
          pick(r, [
            "DestinationServiceAreaName",
            "Destination Service Area Name",
          ]) ?? ""
        )
          .toString()
          .trim() || null,
      globalProductCode:
        (pick(r, ["GlobalProductCode"]) ?? "").toString().trim() || null,
      globalProductName:
        (pick(r, ["GlobalProductName"]) ?? "").toString().trim() || null,
      invoiceDate: asDate(
        pick(r, ["InvoiceDate", "Invoice Date"])
      ) as Date | null,
      invoiceNumber:
        (pick(r, ["InvoiceNumber", "Invoice No"]) ?? "").toString().trim() ||
        null,
      numberOfPieces: asNum(pick(r, ["NumberOfPieces", "Number Of Pieces"])) as
        | number
        | null,
      opsConsigneeContactName:
        (
          pick(r, ["OpsConsigneeContactName", "Ops Consignee Contact Name"]) ??
          ""
        )
          .toString()
          .trim() || null,
      opsConsigneeName:
        (pick(r, ["OpsConsigneeName", "Ops Consignee Name"]) ?? "")
          .toString()
          .trim() || null,
      opsConsignorContactName:
        (
          pick(r, ["OpsConsignorContactName", "Ops Consignor Contact Name"]) ??
          ""
        )
          .toString()
          .trim() || null,
      opsConsignorName:
        (pick(r, ["OpsConsignorName", "Ops Consignor Name"]) ?? "")
          .toString()
          .trim() || null,
      originCountryCode:
        (pick(r, ["OriginCountryCode", "Origin Country Code"]) ?? "")
          .toString()
          .trim() || null,
      originCountryName:
        (pick(r, ["OriginCountryName", "Origin Country Name"]) ?? "")
          .toString()
          .trim() || null,
      originServiceAreaCode:
        (pick(r, ["OriginServiceAreaCode", "Origin Service Area Code"]) ?? "")
          .toString()
          .trim() || null,
      originServiceAreaName:
        (pick(r, ["OriginServiceAreaName", "Origin Service Area Name"]) ?? "")
          .toString()
          .trim() || null,
      relativePeriod:
        (pick(r, ["RelativePeriod"]) ?? "").toString().trim() || null,
      shipmentPickUpDate: asDate(
        pick(r, ["ShipmentPickUpDate", "Ship PickUp Date"])
      ) as Date | null,
      shipmentReference:
        (pick(r, ["ShipmentReference", "Shipment Reference"]) ?? "")
          .toString()
          .trim() || null,
      shipperAccountNumber:
        (pick(r, ["ShipperAccountNumber", "Shipper Account Number"]) ?? "")
          .toString()
          .trim() || null,
      totalRevenueEUR: asNum(pick(r, ["TotalRevenueEUR"])) as number | null,
      totalRevenueLCY: asNum(pick(r, ["TotalRevenueLCY"])) as number | null,
      totalTaxEUR: asNum(pick(r, ["TotalTaxEUR"])) as number | null,
      totalTaxLCY: asNum(pick(r, ["TotalTaxLCY"])) as number | null,
    };
    try {
      const existing = await prisma.dHLReportLine.findUnique({
        where: { id: idNum },
      });
      if (existing) {
        await prisma.dHLReportLine.update({ where: { id: idNum }, data });
        updated++;
      } else {
        await prisma.dHLReportLine.create({ data });
        created++;
      }
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
        `[import] dhl_report_lines progress ${i + 1}/${
          rows.length
        } created=${created} updated=${updated} skipped=${skipped} errors=${
          errors.length
        }`
      );
    }
  }
  console.log(
    `[import] dhl_report_lines complete total=${rows.length} created=${created} updated=${updated} skipped=${skipped} errors=${errors.length}`
  );
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
    console.log(
      "[import] dhl_report_lines error summary",
      Object.values(grouped)
    );
  }
  await resetSequence(prisma, "DHLReportLine");
  return { created, updated, skipped, errors };
}
