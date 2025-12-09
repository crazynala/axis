export function computeInvoiceLineTotal(line: any): number {
  if (line.invoicedTotalManual != null) {
    return Number(line.invoicedTotalManual ?? 0) || 0;
  }
  const qty = Number(line.quantity ?? 0) || 0;
  const price =
    Number(line.invoicedPrice ?? line.priceSell ?? 0) || 0;
  return qty * price;
}
