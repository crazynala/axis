export const DEFAULT_STOCK_LOCATION_ID = 1;

export function resolveJobSetupDefaults(args: {
  company: { stockLocationId?: number | null; defaultAddressId?: number | null } | null;
  fallbackStockLocationId?: number;
}): { stockLocationId: number; shipToAddressId: number | null } {
  const fallback = args.fallbackStockLocationId ?? DEFAULT_STOCK_LOCATION_ID;
  const stockLocationId =
    args.company?.stockLocationId != null ? args.company.stockLocationId : fallback;
  const shipToAddressId =
    args.company?.defaultAddressId != null ? args.company.defaultAddressId : null;
  return { stockLocationId, shipToAddressId };
}

export { buildJobProjectCode as buildProjectCodeFromCompany } from "./jobProjectCode";
export { buildProjectCodeFromIncrement } from "./jobProjectCode";
export { parseJobProjectCodeNumber } from "./jobProjectCode";
