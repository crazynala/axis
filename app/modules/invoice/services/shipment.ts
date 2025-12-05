import { prisma } from "~/utils/prisma.server";

export type PendingShipmentItem = {
  sourceType: "shipping";
  shipmentId: number;
  trackingNo: string | null;
  freightPendingUSD: string;
  dutyPendingUSD: string;
};

async function getForexRate(date: Date | null, from: string, to: string) {
  const rate = await prisma.forexLine.findFirst({
    where: {
      currencyFrom: from,
      currencyTo: to,
      ...(date ? { date: { lte: date } } : {}),
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  return rate ? Number(rate.price ?? 1) || 1 : 1;
}

function invoiceLineTotal(line: any): number {
  if (line.invoicedTotalManual != null) {
    return Number(line.invoicedTotalManual ?? 0) || 0;
  }
  const qty = Number(line.quantity ?? 0) || 0;
  const price = Number(line.priceSell ?? 0) || 0;
  return qty * price;
}

export async function getShipmentsPendingInvoicing(
  customerId: number | null | undefined
): Promise<PendingShipmentItem[]> {
  if (!customerId) return [];
  const shipments = await prisma.shipment.findMany({
    where: { companyIdReceiver: customerId },
    select: {
      id: true,
      trackingNo: true,
      date: true,
    },
    orderBy: { id: "desc" },
  });
  const results: PendingShipmentItem[] = [];
  for (const shipment of shipments) {
    const dhlLines = await prisma.dHLReportLine.findMany({
      where: { awbNumber: shipment.trackingNo ?? undefined },
    });
    if (!dhlLines.length) continue;
    const rate = await getForexRate(
      shipment.date ? new Date(shipment.date) : null,
      "EUR",
      "USD"
    );
    const freightTotalUSD = dhlLines.reduce((sum, line) => {
      const v = Number(line.totalRevenueEUR ?? 0) || 0;
      return sum + v * rate;
    }, 0);
    const dutyTotalUSD = dhlLines.reduce((sum, line) => {
      const v = Number(line.totalTaxEUR ?? 0) || 0;
      return sum + v * rate;
    }, 0);
    if (!freightTotalUSD && !dutyTotalUSD) continue;
    const existingLines = await prisma.invoiceLine.findMany({
      where: {
        OR: [
          { shippingIdActual: shipment.id },
          { shippingIdDuty: shipment.id },
        ],
      },
    });
    const freightInvoicedUSD = existingLines
      .filter((l) => l.shippingIdActual === shipment.id)
      .reduce((sum, l) => sum + invoiceLineTotal(l), 0);
    const dutyInvoicedUSD = existingLines
      .filter((l) => l.shippingIdDuty === shipment.id)
      .reduce((sum, l) => sum + invoiceLineTotal(l), 0);
    const freightPendingUSD = freightTotalUSD - freightInvoicedUSD;
    const dutyPendingUSD = dutyTotalUSD - dutyInvoicedUSD;
    if (freightPendingUSD > 0 || dutyPendingUSD > 0) {
      results.push({
        sourceType: "shipping",
        shipmentId: shipment.id,
        trackingNo: shipment.trackingNo ?? null,
        freightPendingUSD: freightPendingUSD.toString(),
        dutyPendingUSD: dutyPendingUSD.toString(),
      });
    }
  }
  return results;
}
