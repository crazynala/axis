export function assertManualPriceExclusivity(input: {
  manualSalePrice?: any;
  manualMargin?: any;
}) {
  const hasSale =
    input.manualSalePrice != null && String(input.manualSalePrice) !== "";
  const hasMargin =
    input.manualMargin != null && String(input.manualMargin) !== "";
  if (hasSale && hasMargin) {
    throw new Error("manualSalePrice and manualMargin cannot both be set");
  }
}
