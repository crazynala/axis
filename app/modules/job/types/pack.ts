export type PackBoxSummary = {
  id: number;
  warehouseNumber: number | null;
  description: string | null;
  notes: string | null;
  locationId: number | null;
  state: string | null;
  totalQuantity: number;
};
