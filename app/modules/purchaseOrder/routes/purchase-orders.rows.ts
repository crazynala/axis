import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import { prismaBase } from "../../../utils/prisma.server";
import { buildPurchaseOrderWarnings } from "../spec/warnings";

function normalizeTaxRate(value: Prisma.Decimal | number | null | undefined) {
  const rate = new Prisma.Decimal(value ?? 0);
  return rate.gt(1) ? rate.div(100) : rate;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rawIds = url.searchParams.getAll("ids");
  if (!rawIds.length) return json({ rows: [] });
  const flattened: string[] = [];
  for (const part of rawIds) {
    if (!part) continue;
    for (const piece of part.split(",")) {
      const trimmed = piece.trim();
      if (trimmed) flattened.push(trimmed);
    }
  }
  const ids = Array.from(new Set(flattened))
    .slice(0, 500)
    .map((v) => (v.match(/^\d+$/) ? Number(v) : v))
    .filter((v) => typeof v === "number") as number[];
  if (!ids.length) return json({ rows: [] });
  const rows = await prismaBase.purchaseOrder.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      date: true,
      invoiceTrackingStatus: true,
      company: { select: { id: true, name: true } },
      consignee: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      lines: { select: { manualCost: true, priceCost: true, quantity: true } },
    },
  });
  const invoiceRows = await prismaBase.supplierInvoice.findMany({
    where: { purchaseOrderId: { in: ids } },
    select: { purchaseOrderId: true, type: true, totalExTax: true },
  });
  const lineRows = await prismaBase.purchaseOrderLine.findMany({
    where: { purchaseOrderId: { in: ids } },
    select: {
      id: true,
      purchaseOrderId: true,
      manualCost: true,
      priceCost: true,
      taxRate: true,
    },
  });
  const lineIds = lineRows.map((l) => l.id);
  const receiptLines = lineIds.length
    ? await prismaBase.shipmentLine.findMany({
        where: {
          purchaseOrderLineId: { in: lineIds },
          shipment: { type: "In" },
        },
        select: { purchaseOrderLineId: true, quantity: true },
      })
    : [];
  const invoicesByPo = new Map<number, typeof invoiceRows>();
  for (const inv of invoiceRows) {
    const poId = Number(inv.purchaseOrderId || 0);
    if (!Number.isFinite(poId) || !poId) continue;
    const list = invoicesByPo.get(poId) || [];
    list.push(inv);
    invoicesByPo.set(poId, list);
  }
  const linesByPo = new Map<number, typeof lineRows>();
  for (const line of lineRows) {
    const poId = Number(line.purchaseOrderId || 0);
    if (!Number.isFinite(poId) || !poId) continue;
    const list = linesByPo.get(poId) || [];
    list.push(line);
    linesByPo.set(poId, list);
  }
  const receivedByLine = new Map<number, Prisma.Decimal>();
  for (const sl of receiptLines) {
    const lid = Number(sl.purchaseOrderLineId || 0);
    if (!Number.isFinite(lid) || !lid) continue;
    const qty = new Prisma.Decimal(sl.quantity ?? 0);
    receivedByLine.set(
      lid,
      (receivedByLine.get(lid) || new Prisma.Decimal(0)).plus(qty)
    );
  }
  const enhanced = rows.map((r: any) => {
    const poId = Number(r.id || 0);
    const poInvoices = invoicesByPo.get(poId) || [];
    const poLines = linesByPo.get(poId) || [];
    let expectedExSum = new Prisma.Decimal(0);
    let expectedTaxSum = new Prisma.Decimal(0);
    let hasReceipts = false;
    for (const line of poLines) {
      const qty = receivedByLine.get(line.id) || new Prisma.Decimal(0);
      if (qty.gt(0)) hasReceipts = true;
      const unit = new Prisma.Decimal(line.manualCost ?? line.priceCost ?? 0);
      const lineEx = qty.mul(unit);
      const taxRate = normalizeTaxRate(line.taxRate);
      const lineTax = lineEx.mul(taxRate);
      expectedExSum = expectedExSum.plus(lineEx);
      expectedTaxSum = expectedTaxSum.plus(lineTax);
    }
    const expectedIncSum = expectedExSum.plus(expectedTaxSum);
    const effectiveRate = expectedExSum.eq(0)
      ? new Prisma.Decimal(0)
      : expectedTaxSum.div(expectedExSum);
    let invoicedSum = new Prisma.Decimal(0);
    for (const inv of poInvoices) {
      const amt = new Prisma.Decimal(inv.totalExTax ?? 0);
      invoicedSum =
        inv.type === "CREDIT_MEMO"
          ? invoicedSum.minus(amt)
          : invoicedSum.plus(amt);
    }
    const invoicedIncSum = invoicedSum.mul(
      new Prisma.Decimal(1).plus(effectiveRate)
    );
    const expected2 = expectedIncSum.toDecimalPlaces(2);
    const invoiced2 = invoicedIncSum.toDecimalPlaces(2);
    const delta2 = invoiced2.minus(expected2);
    const warnings = buildPurchaseOrderWarnings({
      invoiceCount: poInvoices.length,
      hasReceipts,
      deltaRounded: delta2,
      expectedRounded: expected2,
      invoicedRounded: invoiced2,
      invoiceTrackingStatus: r.invoiceTrackingStatus,
    });
    return {
      ...r,
      vendorName: r.company?.name || "",
      consigneeName: r.consignee?.name || "",
      locationName: r.location?.name || "",
      totalCost: (r.lines || []).reduce((sum: number, l: any) => {
        const unit = Number(l.manualCost ?? l.priceCost ?? 0) || 0;
        return sum + unit * (Number(l.quantity || 0) || 0);
      }, 0),
      warnings,
    };
  });
  const map = new Map(enhanced.map((r) => [r.id, r] as const));
  const ordered = ids.map((id) => map.get(id)).filter(Boolean);
  return json({ rows: ordered });
}
