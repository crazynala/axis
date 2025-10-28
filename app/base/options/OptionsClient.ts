export type Option = { value: string; label: string };
export type OptionsData = {
  categoryOptions: Option[];
  subcategoryOptions: Option[];
  taxCodeOptions: Option[];
  // Optional: map of tax ValueList id -> numeric rate (e.g., 0.18)
  taxRateById?: Record<string | number, number>;
  productTypeOptions: Option[];
  companyAllOptions?: Option[];
  customerOptions: Option[];
  customerAllOptions?: Option[];
  supplierOptions: Option[];
  supplierAllOptions?: Option[];
  carrierOptions: Option[];
  locationOptions: Option[];
  jobTypeOptions: Option[];
  jobStatusOptions: Option[];
  variantSetOptions: Option[];
  // New: sale price groups and cost groups as simple id/name option lists
  salePriceGroupOptions?: Option[];
  costGroupOptions?: Option[];
};

let GLOBAL_OPTIONS: OptionsData | null = null;

export function setGlobalOptions(opts: OptionsData) {
  GLOBAL_OPTIONS = opts;
}

export function getGlobalOptions(): OptionsData | null {
  return GLOBAL_OPTIONS;
}
