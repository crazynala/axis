import { priceProduct } from "../pricing/pricingService.server";

export async function calcProductPriceFromDb(opts: {
  productId: number;
  qty: number;
  vendorId?: number | null;
  customerId?: number | null;
  currencyRate?: number | null;
}) {
  return await priceProduct(opts);
}
