export type JobDetailVM = {
  job: any;
  productsById: Record<number, any>;
  assemblyTypes: Array<{ label: string }>;
  customers: Array<{
    id: number;
    name: string | null;
    defaultAddressId: number | null;
    stockLocationId: number | null;
    shortCode: string | null;
    shortName: string | null;
    projectCodeNextNumber: number | null;
  }>;
  productChoices: any[];
  groupsById: Record<number, any>;
  activityCounts: Record<number, number>;
  locations: Array<{ id: number; name: string | null }>;
  contacts: Array<{
    id: number;
    firstName: string | null;
    lastName: string | null;
    companyId: number | null;
    defaultAddressId: number | null;
  }>;
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
  internalTargetBufferDays: number;
  dropDeadEscalationBufferDays: number;
  jobProjectCodePrefix: string;
  jobTargets: Record<string, any>;
  assemblyTargetsById: Record<number, any>;
};
