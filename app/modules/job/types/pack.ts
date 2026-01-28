export type PackBoxSummary = {
  id: number;
  warehouseNumber: number | null;
  description: string | null;
  notes: string | null;
  locationId: number | null;
  locationName?: string | null;
  state: string | null;
  totalQuantity: number;
  destinationAddressId?: number | null;
  destinationLocationId?: number | null;
  destinationAddress?: {
    id: number;
    name: string | null;
    addressLine1: string | null;
    addressTownCity: string | null;
    addressCountyState: string | null;
    addressZipPostCode: string | null;
    addressCountry: string | null;
  } | null;
  destinationLocation?: {
    id: number;
    name: string | null;
    type: string | null;
  } | null;
};
