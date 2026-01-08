import { Prisma } from "@prisma/client";

export type PurchaseOrderWarning = {
  code: "invoice_mismatch" | "record_invoice" | "receipt_missing";
  severity: "warn" | "info";
  label: string;
  meta?: Record<string, any>;
};

export type PurchaseOrderWarningsInput = {
  invoiceCount?: number | null;
  hasReceipts?: boolean | null;
  receiptShipmentLineCount?: number | null;
  deltaRounded?: number | string | Prisma.Decimal | null;
  expectedRounded?: number | string | Prisma.Decimal | null;
  invoicedRounded?: number | string | Prisma.Decimal | null;
  invoiceTrackingStatus?: string | null;
};

export function buildPurchaseOrderWarnings(
  input: PurchaseOrderWarningsInput
): PurchaseOrderWarning[] {
  const warnings: PurchaseOrderWarning[] = [];
  const invoiceCount = Number(input.invoiceCount ?? 0) || 0;
  const receiptLineCount =
    Number(input.receiptShipmentLineCount ?? 0) || 0;
  const hasReceipts = receiptLineCount > 0 || Boolean(input.hasReceipts);
  const status = String(input.invoiceTrackingStatus || "UNKNOWN");
  const delta = new Prisma.Decimal(input.deltaRounded ?? 0);
  const expected = new Prisma.Decimal(input.expectedRounded ?? 0);
  const invoiced = new Prisma.Decimal(input.invoicedRounded ?? 0);

  if (invoiceCount > 0 && receiptLineCount === 0) {
    return [
      {
        code: "receipt_missing",
        severity: "warn",
        label: "Receipt missing",
      },
    ];
  }

  if (invoiceCount === 0 && hasReceipts && status !== "NO_INVOICE_EXPECTED") {
    return [
      {
        code: "record_invoice",
        severity: "info",
        label: "Record invoice",
      },
    ];
  }

  if (
    invoiceCount > 0 &&
    receiptLineCount > 0 &&
    delta.abs().gte(0.01)
  ) {
    return [
      {
        code: "invoice_mismatch",
        severity: "warn",
        label: "Invoice mismatch",
        meta: {
          expected: expected.toDecimalPlaces(2).toString(),
          invoiced: invoiced.toDecimalPlaces(2).toString(),
          delta: delta.toDecimalPlaces(2).toString(),
        },
      },
    ];
  }

  return [];
}

export const purchaseOrderWarnings = {
  buildPurchaseOrderWarnings,
};
