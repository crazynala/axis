export type ShipBrief = {
  id: number;
  trackingNo: string | null;
  date: string | Date | null;
  packingSlipCode: string | null;
  companyCarrierName?: string | null;
};

export type PoLineBrief = {
  id: number;
  purchaseOrderId: number | null;
  productSkuCopy: string | null;
  productNameCopy: string | null;
  companyName?: string | null; // purchaseOrder.company.name
};

export function formatYmd(d: Date | string | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (!(dt instanceof Date) || isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export function buildInvoiceLineDetails(
  l: any,
  ctx?: {
    poLine?: PoLineBrief | null;
    shipActual?: ShipBrief | null;
    shipDuty?: ShipBrief | null;
  }
): string {
  // Costing case: "AssemblyName: ProductName"
  if (l?.costingId && l?.costing) {
    const assembly = l.costing.assembly?.name || "Assembly";
    const productName = l.costing.product?.name || "";
    const s = [assembly, productName].filter(Boolean).join(": ");
    if (s) return s;
  }

  // Purchase Order Line case
  if (l?.purchaseOrderLineId) {
    const po = ctx?.poLine;
    const memoPrefix =
      l?.memo && String(l.memo).length > 1 ? String(l.memo) + " " : "";
    const parts = [
      memoPrefix + (po?.purchaseOrderId ? `[PO-${po.purchaseOrderId}] ` : ""),
      po?.companyName || "",
      po?.productSkuCopy ? ` [${po.productSkuCopy}] ` : " ",
      po?.productNameCopy || "",
    ];
    const s = parts.join("").trim();
    if (s) return s;
  }

  // Shipping Actual ("- Shipping")
  if (l?.shippingIdActual && ctx?.shipActual) {
    const sh = ctx.shipActual;
    const s = `${sh.companyCarrierName ?? ""} [${sh.trackingNo ?? ""}] ${
      formatYmd(sh.date) || ""
    } ${sh.packingSlipCode ?? ""} - Shipping`.trim();
    if (s) return s;
  }

  // Shipping Duty ("- Duty")
  if (l?.shippingIdDuty && ctx?.shipDuty) {
    const sh = ctx.shipDuty;
    const s = `${sh.companyCarrierName ?? ""} [${sh.trackingNo ?? ""}] ${
      formatYmd(sh.date) || ""
    } ${sh.packingSlipCode ?? ""} - Duty`.trim();
    if (s) return s;
  }

  // Expense case
  if (l?.expense) {
    const poSuffix = l.expense.purchaseOrderId
      ? ` [PO-${l.expense.purchaseOrderId}]`
      : "";
    const s = `${l.expense.details || ""}${poSuffix}`.trim();
    if (s) return s;
  }

  // Fallbacks
  if (l?.details) return String(l.details);
  return "UNKNOWN";
}
