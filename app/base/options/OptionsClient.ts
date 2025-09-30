export type Option = { value: string; label: string };
export type OptionsData = {
  categoryOptions: Option[];
  subcategoryOptions: Option[];
  taxCodeOptions: Option[];
  // Optional: map of tax ValueList id -> numeric rate (e.g., 0.18)
  taxRateById?: Record<string | number, number>;
  productTypeOptions: Option[];
  customerOptions: Option[];
  supplierOptions: Option[];
  carrierOptions: Option[];
  locationOptions: Option[];
  jobTypeOptions: Option[];
  jobStatusOptions: Option[];
  variantSetOptions: Option[];
};

let GLOBAL_OPTIONS: OptionsData | null = null;

export function setGlobalOptions(opts: OptionsData) {
  GLOBAL_OPTIONS = opts;
}

export function getGlobalOptions(): OptionsData | null {
  return GLOBAL_OPTIONS;
}
