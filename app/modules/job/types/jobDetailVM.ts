export type JobDetailVM = {
  job: any;
  productsById: Record<number, any>;
  assemblyTypes: Array<{ label: string }>;
  customers: Array<{ id: number; name: string | null }>;
  productChoices: any[];
  groupsById: Record<number, any>;
  activityCounts: Record<number, number>;
  locations: Array<{ id: number; name: string | null }>;
  shipToAddresses: Array<{
    id: number;
    name: string | null;
    addressLine1: string | null;
    addressTownCity: string | null;
    addressCountyState: string | null;
    addressZipPostCode: string | null;
    addressCountry: string | null;
  }>;
  defaultLeadDays: number;
  jobTargets: Record<string, any>;
  assemblyTargetsById: Record<number, any>;
};
